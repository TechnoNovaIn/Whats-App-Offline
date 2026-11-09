import React, { useState, useEffect } from 'react';
import type { ImportPreview, ImportJob, BackupProgress } from '../../shared/types';
import { formatFileSize } from '../hooks/useApi';

interface Props {
  onClose: () => void;
}

type Mode = 'choose' | 'chat_export' | 'full_backup';
type Step = 'select' | 'preview' | 'importing' | 'done';

export default function ImportModal({ onClose }: Props) {
  const [mode, setMode] = useState<Mode>('choose');
  const [step, setStep] = useState<Step>('select');

  // Chat export state
  const [chatFiles, setChatFiles] = useState<string[]>([]);
  const [mediaFolder, setMediaFolder] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [progress, setProgress] = useState<ImportJob | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);

  // Full backup state
  const [dbPath, setDbPath] = useState<string | null>(null);
  const [encType, setEncType] = useState<string | null>(null);
  const [keyPath, setKeyPath] = useState<string | null>(null);
  const [backupKey, setBackupKey] = useState('');
  const [backupMediaPath, setBackupMediaPath] = useState<string | null>(null);
  const [backupProgress, setBackupProgress] = useState<BackupProgress | null>(null);

  useEffect(() => {
    if (!window.electronAPI) return;
    const unsub1 = window.electronAPI.import.onProgress((job) => {
      setProgress(job as any);
      if (job.status === 'completed' || job.status === 'cancelled' || job.status === 'failed') {
        setStep('done');
      }
    });
    const unsub2 = window.electronAPI.import.onBackupProgress((bp: BackupProgress) => {
      setBackupProgress(bp);
      if (bp.status === 'completed' || bp.status === 'cancelled' || bp.status === 'failed') {
        setStep('done');
      }
    });
    return () => { unsub1(); unsub2(); };
  }, []);

  // Chat export handlers
  const selectChatFiles = async () => {
    const files = await window.electronAPI.import.selectFiles();
    if (files) setChatFiles(prev => [...prev, ...files]);
  };
  const selectMedia = async () => {
    const folder = await window.electronAPI.import.selectFolder();
    if (folder) setMediaFolder(folder);
  };
  const doPreview = async () => {
    const allPaths = [...chatFiles];
    if (mediaFolder) allPaths.push(mediaFolder);
    const result = await window.electronAPI.import.preview(allPaths);
    setPreview(result);
    setStep('preview');
  };
  const startChatImport = async () => {
    setStep('importing');
    const id = await window.electronAPI.import.start(chatFiles, mediaFolder || undefined);
    setJobId(id);
  };

  // Full backup handlers
  const selectDatabase = async () => {
    const path = await window.electronAPI.import.selectDatabase();
    if (path) {
      setDbPath(path);
      const enc = await window.electronAPI.import.detectEncryption(path);
      setEncType(enc);
    }
  };
  const selectKey = async () => {
    const path = await window.electronAPI.import.selectKeyFile();
    if (path) setKeyPath(path);
  };
  const selectBackupMedia = async () => {
    const folder = await window.electronAPI.import.selectFolder();
    if (folder) setBackupMediaPath(folder);
  };
  const startBackupImport = async () => {
    if (!dbPath) return;
    setStep('importing');
    const id = await window.electronAPI.import.startBackup(
      dbPath,
      backupMediaPath || undefined,
      keyPath || undefined,
      backupKey || undefined,
    );
    setJobId(id);
  };

  const cancelImport = async () => {
    if (jobId) await window.electronAPI.import.cancel(jobId);
  };

  const phaseLabels: Record<string, string> = {
    decrypting: 'Decrypting database...',
    reading: 'Reading WhatsApp database...',
    importing_chats: 'Importing chats & messages...',
    importing_media: 'Copying media files...',
    done: 'Done!',
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'var(--bg-overlay)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
    }} onClick={(e) => { if (e.target === e.currentTarget && step !== 'importing') onClose(); }}>
      <div style={{
        background: 'var(--bg-modal)', borderRadius: 'var(--radius-lg)',
        width: 560, maxHeight: '85vh', overflow: 'auto',
        boxShadow: 'var(--shadow-lg)', padding: 24,
      }}>

        {/* === MODE CHOOSER === */}
        {mode === 'choose' && (
          <>
            <h2 style={{ fontSize: 20, marginBottom: 4 }}>Import WhatsApp Data</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 20 }}>
              Choose how you want to import your chats.
            </p>

            <div
              onClick={() => setMode('full_backup')}
              style={modeCardStyle}
              onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent)'}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border-color)'}
            >
              <div style={{ fontSize: 32, marginBottom: 8 }}>📱</div>
              <strong style={{ fontSize: 16, display: 'block', marginBottom: 4 }}>Full Backup Import</strong>
              <span style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                Import ALL chats at once from your WhatsApp database file
                (<code>msgstore.db</code>) and media folder. Best for complete archives.
              </span>
              <div style={{ marginTop: 8, fontSize: 12, color: 'var(--accent)', fontWeight: 600 }}>RECOMMENDED</div>
            </div>

            <div
              onClick={() => setMode('chat_export')}
              style={modeCardStyle}
              onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent)'}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border-color)'}
            >
              <div style={{ fontSize: 32, marginBottom: 8 }}>📄</div>
              <strong style={{ fontSize: 16, display: 'block', marginBottom: 4 }}>Chat Export Files</strong>
              <span style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                Import individual <code>.txt</code> exports from WhatsApp's "Export Chat" feature.
                One file per conversation.
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
              <button onClick={onClose} style={{ ...btnStyle, background: 'var(--bg-secondary)' }}>Cancel</button>
            </div>
          </>
        )}

        {/* === FULL BACKUP SELECT === */}
        {mode === 'full_backup' && step === 'select' && (
          <>
            <h2 style={{ fontSize: 20, marginBottom: 4 }}>Full Backup Import</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 16, lineHeight: 1.6 }}>
              Import all your WhatsApp chats from the database file on your phone.
              Your original files will not be modified.
            </p>

            <div style={{ background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', padding: 14, marginBottom: 16, fontSize: 13, lineHeight: 1.7, color: 'var(--text-secondary)' }}>
              <strong style={{ color: 'var(--text-primary)', display: 'block', marginBottom: 6 }}>How to get your WhatsApp files:</strong>
              <div><strong>1.</strong> Connect your Samsung phone via USB (File Transfer mode)</div>
              <div><strong>2.</strong> Navigate to: <code style={{ background: 'var(--bg-input)', padding: '1px 4px', borderRadius: 3 }}>Android/media/com.whatsapp/WhatsApp/</code></div>
              <div><strong>3.</strong> Copy <code style={{ background: 'var(--bg-input)', padding: '1px 4px', borderRadius: 3 }}>Databases/msgstore.db.crypt14</code> (or .crypt15) to your PC</div>
              <div><strong>4.</strong> Copy the entire <code style={{ background: 'var(--bg-input)', padding: '1px 4px', borderRadius: 3 }}>Media/</code> folder to your PC</div>
            </div>

            {/* Database file */}
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>WhatsApp Database File *</label>
              {dbPath ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                  <span style={{ flex: 1, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {dbPath.split(/[/\\]/).pop()}
                  </span>
                  {encType && (
                    <span style={{
                      fontSize: 11, padding: '2px 8px', borderRadius: 'var(--radius-full)',
                      background: encType === 'plain' ? 'var(--success)' : 'var(--warning)',
                      color: encType === 'plain' ? '#fff' : '#333', fontWeight: 600,
                    }}>
                      {encType === 'plain' ? 'Decrypted' : encType.toUpperCase()}
                    </span>
                  )}
                  <button onClick={() => { setDbPath(null); setEncType(null); }} style={{ color: 'var(--danger)', fontSize: 12 }}>Remove</button>
                </div>
              ) : (
                <button onClick={selectDatabase} style={btnStyle}>
                  Select Database File (.db / .crypt14 / .crypt15)
                </button>
              )}
            </div>

            {/* Key / Backup password (only if encrypted) */}
            {encType && encType !== 'plain' && encType !== 'unknown' && (
              <div style={{ marginBottom: 14, background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', padding: 14 }}>
                <label style={labelStyle}>Decryption Key (required for {encType})</label>

                {encType === 'crypt14' ? (
                  <>
                    <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 10, lineHeight: 1.6 }}>
                      <strong>How to get the key (no root needed):</strong><br/>
                      1. Connect phone via USB &rarr; check <code>Android/media/com.whatsapp/WhatsApp/Databases/</code> for a file named <code>key</code> or <code>encrypted_backup.key</code><br/>
                      2. Use a key extraction tool like <em>wa-crypt-tools</em> or <em>WhatsApp Key/DB Extractor</em> (search GitHub)<br/>
                      3. If rooted: <code>/data/data/com.whatsapp/files/key</code>
                    </p>
                    <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 10, lineHeight: 1.6 }}>
                      Provide either a <strong>key file</strong> or a <strong>64-character hex key</strong>:
                    </p>
                    {keyPath ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 8 }}>
                        <span style={{ flex: 1, color: 'var(--text-secondary)' }}>{keyPath.split(/[/\\]/).pop()}</span>
                        <button onClick={() => setKeyPath(null)} style={{ color: 'var(--danger)', fontSize: 12 }}>Remove</button>
                      </div>
                    ) : (
                      <button onClick={selectKey} style={{ ...btnStyle, marginBottom: 8 }}>Select Key File</button>
                    )}
                    {!keyPath && (
                      <>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', textAlign: 'center', margin: '4px 0' }}>— or paste your hex key —</div>
                        <input
                          type="text"
                          placeholder="64-character hex key (e.g. a1b2c3d4...)"
                          value={backupKey}
                          onChange={e => setBackupKey(e.target.value)}
                          style={{
                            width: '100%', padding: '8px 10px', borderRadius: 'var(--radius-sm)',
                            border: '1px solid var(--border-color)', background: 'var(--bg-input)',
                            fontSize: 13, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)',
                          }}
                        />
                      </>
                    )}
                    <div style={{ marginTop: 10, padding: '8px 10px', background: 'var(--bg-tertiary, var(--bg-modal))', borderRadius: 'var(--radius-sm)', fontSize: 11.5, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                      <strong>Easier alternative:</strong> Use WhatsApp &rarr; open any chat &rarr; ⋮ &rarr; More &rarr; Export Chat to create .txt files. Import those via "Chat Export" mode instead — no key needed.
                    </div>
                  </>
                ) : (
                  <>
                    <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8, lineHeight: 1.5 }}>
                      Enter your 64-digit backup key from: WhatsApp &gt; Settings &gt; Chats &gt; Chat Backup &gt; End-to-end encrypted backup
                    </p>
                    <input
                      type="text"
                      placeholder="64-character hex key"
                      value={backupKey}
                      onChange={e => setBackupKey(e.target.value)}
                      style={{
                        width: '100%', padding: '8px 10px', borderRadius: 'var(--radius-sm)',
                        border: '1px solid var(--border-color)', background: 'var(--bg-input)',
                        fontSize: 13, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)',
                      }}
                    />
                  </>
                )}
              </div>
            )}

            {/* Media folder */}
            <div style={{ marginBottom: 20 }}>
              <label style={labelStyle}>WhatsApp Media Folder (optional but recommended)</label>
              {backupMediaPath ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                  <span style={{ flex: 1, color: 'var(--text-secondary)' }}>{backupMediaPath.split(/[/\\]/).pop()}</span>
                  <button onClick={() => setBackupMediaPath(null)} style={{ color: 'var(--danger)', fontSize: 12 }}>Remove</button>
                </div>
              ) : (
                <button onClick={selectBackupMedia} style={btnStyle}>
                  Select Media Folder
                </button>
              )}
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setMode('choose')} style={{ ...btnStyle, background: 'var(--bg-secondary)' }}>Back</button>
              <button
                onClick={startBackupImport}
                disabled={!dbPath || (encType === 'crypt14' && !keyPath && !backupKey) || (encType === 'crypt15' && !backupKey && !keyPath)}
                style={{
                  ...btnStyle, background: 'var(--accent)', color: '#fff',
                  opacity: !dbPath ? 0.5 : 1,
                }}
              >
                Start Import
              </button>
            </div>
          </>
        )}

        {/* === CHAT EXPORT SELECT === */}
        {mode === 'chat_export' && step === 'select' && (
          <>
            <h2 style={{ fontSize: 20, marginBottom: 4 }}>Import Chat Exports</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 20 }}>
              Select exported .txt chat files and an optional media folder. Your originals won't be modified.
            </p>

            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Chat Export Files (.txt)</label>
              <button onClick={selectChatFiles} style={btnStyle}>+ Add Chat Files</button>
              {chatFiles.map((f, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, fontSize: 13 }}>
                  <span style={{ flex: 1, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {f.split(/[/\\]/).pop()}
                  </span>
                  <button onClick={() => setChatFiles(prev => prev.filter((_, j) => j !== i))}
                    style={{ color: 'var(--danger)', fontSize: 12 }}>Remove</button>
                </div>
              ))}
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={labelStyle}>Media Folder (optional)</label>
              {mediaFolder ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                  <span style={{ flex: 1, color: 'var(--text-secondary)' }}>{mediaFolder.split(/[/\\]/).pop()}</span>
                  <button onClick={() => setMediaFolder(null)} style={{ color: 'var(--danger)', fontSize: 12 }}>Remove</button>
                </div>
              ) : (
                <button onClick={selectMedia} style={btnStyle}>+ Select Media Folder</button>
              )}
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setMode('choose')} style={{ ...btnStyle, background: 'var(--bg-secondary)' }}>Back</button>
              <button onClick={doPreview} disabled={chatFiles.length === 0}
                style={{ ...btnStyle, background: 'var(--accent)', color: '#fff', opacity: chatFiles.length === 0 ? 0.5 : 1 }}>
                Preview Import
              </button>
            </div>
          </>
        )}

        {/* === PREVIEW (chat export only) === */}
        {step === 'preview' && preview && (
          <>
            <h2 style={{ fontSize: 20, marginBottom: 16 }}>Import Preview</h2>
            <div style={{ background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', padding: 16, marginBottom: 16 }}>
              <div style={statRow}><span>Files selected</span><strong>{preview.files.length}</strong></div>
              <div style={statRow}><span>Estimated chats</span><strong>{preview.estimated_chats}</strong></div>
              <div style={statRow}><span>Estimated messages</span><strong>{preview.estimated_messages.toLocaleString()}</strong></div>
              <div style={statRow}><span>Estimated media</span><strong>{preview.estimated_media.toLocaleString()}</strong></div>
              <div style={statRow}><span>Total size</span><strong>{formatFileSize(preview.total_size)}</strong></div>
            </div>
            {preview.warnings.length > 0 && (
              <div style={{ background: '#fff3cd', borderRadius: 'var(--radius-md)', padding: 12, marginBottom: 16 }}>
                <strong style={{ fontSize: 13 }}>Warnings</strong>
                {preview.warnings.map((w, i) => <div key={i} style={{ fontSize: 13, color: '#856404' }}>{w}</div>)}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setStep('select')} style={{ ...btnStyle, background: 'var(--bg-secondary)' }}>Back</button>
              <button onClick={startChatImport} style={{ ...btnStyle, background: 'var(--accent)', color: '#fff' }}>Start Import</button>
            </div>
          </>
        )}

        {/* === IMPORTING === */}
        {step === 'importing' && (
          <>
            <h2 style={{ fontSize: 20, marginBottom: 8 }}>Importing...</h2>
            {mode === 'full_backup' && backupProgress && (
              <p style={{ fontSize: 13, color: 'var(--accent)', marginBottom: 12, fontWeight: 500 }}>
                {phaseLabels[backupProgress.phase] || backupProgress.phase}
              </p>
            )}
            <div style={{ marginBottom: 16 }}>
              <div style={{ height: 8, background: 'var(--bg-secondary)', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', background: 'var(--accent)', borderRadius: 4,
                  width: mode === 'full_backup' && backupProgress
                    ? `${Math.round((backupProgress.processed / Math.max(backupProgress.total, 1)) * 100)}%`
                    : progress
                    ? `${Math.round(((progress as any).processed_files / Math.max((progress as any).total_files, 1)) * 100)}%`
                    : '0%',
                  transition: 'width 0.3s',
                }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 13, color: 'var(--text-secondary)' }}>
                {mode === 'full_backup' && backupProgress ? (
                  <>
                    <span>{backupProgress.imported_chats} chats</span>
                    <span>{backupProgress.imported_messages.toLocaleString()} messages</span>
                    <span>{backupProgress.imported_media.toLocaleString()} media</span>
                  </>
                ) : (
                  <>
                    <span>{progress?.imported_messages?.toLocaleString() || 0} messages</span>
                    <span>{progress?.imported_media?.toLocaleString() || 0} media</span>
                  </>
                )}
              </div>
            </div>
            <button onClick={cancelImport} style={{ ...btnStyle, background: 'var(--danger)', color: '#fff' }}>Cancel Import</button>
          </>
        )}

        {/* === DONE === */}
        {step === 'done' && (
          <>
            {(() => {
              const bp = mode === 'full_backup' ? backupProgress : null;
              const cp = mode === 'chat_export' ? progress : null;
              const status = bp?.status || cp?.status || 'completed';
              const msgs = bp?.imported_messages || cp?.imported_messages || 0;
              const media = bp?.imported_media || cp?.imported_media || 0;
              const chats = bp?.imported_chats || 0;
              const skipped = bp?.skipped || (cp as any)?.skipped_items || 0;
              const warnings = bp?.warnings || cp?.warnings || [];
              const errors = bp?.errors || cp?.errors || [];

              return (
                <>
                  <h2 style={{ fontSize: 20, marginBottom: 16 }}>
                    {status === 'completed' ? 'Import Complete!' : status === 'cancelled' ? 'Import Cancelled' : 'Import Failed'}
                  </h2>
                  <div style={{ background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', padding: 16, marginBottom: 16 }}>
                    {chats > 0 && <div style={statRow}><span>Chats imported</span><strong>{chats}</strong></div>}
                    <div style={statRow}><span>Messages imported</span><strong>{msgs.toLocaleString()}</strong></div>
                    <div style={statRow}><span>Media imported</span><strong>{media.toLocaleString()}</strong></div>
                    <div style={statRow}><span>Skipped</span><strong>{skipped}</strong></div>
                    {warnings.length > 0 && <div style={statRow}><span>Warnings</span><strong>{warnings.length}</strong></div>}
                    {errors.length > 0 && <div style={statRow}><span>Errors</span><strong style={{ color: 'var(--danger)' }}>{errors.length}</strong></div>}
                  </div>
                  {errors.length > 0 && (
                    <div style={{ background: '#f8d7da', borderRadius: 'var(--radius-md)', padding: 12, marginBottom: 16, maxHeight: 120, overflow: 'auto' }}>
                      {errors.map((e, i) => <div key={i} style={{ fontSize: 12, color: '#721c24' }}>{e}</div>)}
                    </div>
                  )}
                  <button onClick={onClose} style={{ ...btnStyle, background: 'var(--accent)', color: '#fff' }}>Done</button>
                </>
              );
            })()}
          </>
        )}
      </div>
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  padding: '8px 16px',
  borderRadius: 'var(--radius-md)',
  fontSize: 14,
  fontWeight: 500,
  border: '1px solid var(--border-color)',
  background: 'var(--bg-primary)',
  color: 'var(--text-primary)',
};

const labelStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--text-secondary)',
  display: 'block',
  marginBottom: 6,
};

const statRow: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  padding: '6px 0',
  fontSize: 14,
  borderBottom: '1px solid var(--border-color)',
};

const modeCardStyle: React.CSSProperties = {
  padding: 20,
  borderRadius: 'var(--radius-lg)',
  border: '2px solid var(--border-color)',
  cursor: 'pointer',
  marginBottom: 12,
  transition: 'border-color 0.15s',
  textAlign: 'center',
};
