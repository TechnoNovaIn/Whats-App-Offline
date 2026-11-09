import React, { useState, useEffect } from 'react';
import type { ArchiveStats, ImportJob } from '../../shared/types';
import { useAsync, formatFileSize, formatFullTimestamp } from '../hooks/useApi';

interface Props {
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
}

export default function SettingsPage({ theme, onToggleTheme }: Props) {
  const { data: stats, refresh: refreshStats } = useAsync(() => window.electronAPI.db.getStats(), []);
  const { data: archivePath } = useAsync(() => window.electronAPI.archive.getPath(), []);
  const { data: archiveSize } = useAsync(() => window.electronAPI.archive.getSize(), []);
  const { data: importJobs } = useAsync(() => window.electronAPI.db.getImportJobs(), []);
  const { data: version } = useAsync(() => window.electronAPI.app.getVersion(), []);
  const [backupStatus, setBackupStatus] = useState<string | null>(null);

  const handleBackup = async () => {
    const dest = await window.electronAPI.app.selectDirectory();
    if (!dest) return;
    setBackupStatus('Backing up...');
    try {
      await window.electronAPI.archive.backup(dest);
      setBackupStatus('Backup complete!');
    } catch (e: any) {
      setBackupStatus('Backup failed: ' + e.message);
    }
    setTimeout(() => setBackupStatus(null), 3000);
  };

  const handleRestore = async () => {
    if (!confirm('Restore will replace your current archive. Continue?')) return;
    const src = await window.electronAPI.app.selectDirectory();
    if (!src) return;
    setBackupStatus('Restoring...');
    try {
      await window.electronAPI.archive.restore(src);
      setBackupStatus('Restore complete!');
      refreshStats();
    } catch (e: any) {
      setBackupStatus('Restore failed: ' + e.message);
    }
    setTimeout(() => setBackupStatus(null), 3000);
  };

  const handleChangeLocation = async () => {
    const newPath = await window.electronAPI.app.selectDirectory();
    if (!newPath) return;
    if (!confirm(`Change archive location to ${newPath}? This will create a new empty archive.`)) return;
    await window.electronAPI.archive.setPath(newPath);
    refreshStats();
  };

  return (
    <div style={{ flex: 1, overflow: 'auto', background: 'var(--bg-secondary)', padding: '24px 32px' }}>
      <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 24 }}>Settings</h1>

      <Section title="Archive Information">
        <Row label="Location" value={archivePath || '—'} />
        <Row label="Total size" value={archiveSize ? formatFileSize(archiveSize) : '—'} />
        <Row label="Imported conversations" value={String(stats?.total_conversations || 0)} />
        <Row label="Total messages" value={String(stats?.total_messages || 0)} />
        <Row label="Media files" value={String(stats?.total_media || 0)} />
        <Row label="Local conversations" value={String(stats?.total_local_conversations || 0)} />
        <Row label="Last import" value={stats?.last_import ? formatFullTimestamp(stats.last_import) : 'Never'} />
        <div style={{ marginTop: 12 }}>
          <button onClick={handleChangeLocation} style={actionBtnStyle}>
            Change Location
          </button>
        </div>
      </Section>

      <Section title="Appearance">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0' }}>
          <span>Theme</span>
          <button
            onClick={onToggleTheme}
            style={{
              padding: '6px 16px', borderRadius: 'var(--radius-md)',
              background: 'var(--bg-input)', border: '1px solid var(--border-color)',
              fontSize: 13,
            }}
          >
            {theme === 'light' ? '🌙 Switch to Dark' : '☀️ Switch to Light'}
          </button>
        </div>
      </Section>

      <Section title="Backup & Restore">
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>
          Back up your archive database and media to an external folder. Restore replaces the current archive.
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={handleBackup} style={{ ...actionBtnStyle, background: 'var(--accent)', color: '#fff' }}>
            Backup Archive
          </button>
          <button onClick={handleRestore} style={{ ...actionBtnStyle, background: 'var(--bg-input)', border: '1px solid var(--border-color)' }}>
            Restore from Backup
          </button>
        </div>
        {backupStatus && (
          <div style={{ marginTop: 8, fontSize: 13, color: backupStatus.includes('failed') ? 'var(--danger)' : 'var(--success)' }}>
            {backupStatus}
          </div>
        )}
      </Section>

      <Section title="Import History">
        {(!importJobs || importJobs.length === 0) ? (
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>No imports yet</p>
        ) : (
          <div style={{ fontSize: 13 }}>
            {importJobs.map(job => (
              <div key={job.job_id} style={{
                padding: '10px 0', borderBottom: '1px solid var(--border-color)',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontWeight: 500 }}>
                    {job.status === 'completed' ? '✅' : job.status === 'failed' ? '❌' : job.status === 'cancelled' ? '⏹' : '⏳'}
                    {' '}{job.status.charAt(0).toUpperCase() + job.status.slice(1)}
                  </span>
                  <span style={{ color: 'var(--text-timestamp)' }}>
                    {formatFullTimestamp(job.started_at)}
                  </span>
                </div>
                <div style={{ color: 'var(--text-secondary)' }}>
                  {job.imported_messages} messages · {job.imported_media} media · {job.skipped_items} skipped
                  {job.errors.length > 0 && ` · ${job.errors.length} errors`}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="About">
        <Row label="App" value="WhatsApp Offline Archive" />
        <Row label="Version" value={version || '1.0.0'} />
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 12, lineHeight: 1.5 }}>
          This application is an offline archive and personal workspace.
          It is not an official WhatsApp product and is not affiliated with WhatsApp or Meta.
          Your data stays on your computer — nothing is uploaded to the cloud.
        </p>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: 'var(--bg-primary)', borderRadius: 'var(--radius-lg)',
      padding: '16px 20px', marginBottom: 16,
      border: '1px solid var(--border-color)',
    }}>
      <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12, color: 'var(--accent)' }}>{title}</h3>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', padding: '6px 0',
      borderBottom: '1px solid var(--border-light)', fontSize: 14,
    }}>
      <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
      <span style={{ fontWeight: 500, maxWidth: '60%', textAlign: 'right', wordBreak: 'break-all' }}>{value}</span>
    </div>
  );
}

const actionBtnStyle: React.CSSProperties = {
  padding: '8px 16px',
  borderRadius: 'var(--radius-md)',
  fontSize: 13,
  fontWeight: 500,
  border: 'none',
  cursor: 'pointer',
};
