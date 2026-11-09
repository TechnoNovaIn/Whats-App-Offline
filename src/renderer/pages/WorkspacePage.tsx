import React, { useState, useEffect } from 'react';
import type { Conversation, LocalEntry } from '../../shared/types';
import { useAsync, formatTimestamp } from '../hooks/useApi';

export default function WorkspacePage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { data: conversations, refresh } = useAsync(
    () => window.electronAPI.db.getConversations({ source_type: 'local' }),
    []
  );

  const createNew = async () => {
    const title = prompt('New conversation title:');
    if (!title?.trim()) return;
    const conv = await window.electronAPI.workspace.createConversation(title.trim());
    setSelectedId(conv.conversation_id);
    refresh();
  };

  const deleteConversation = async (id: string) => {
    if (!confirm('Delete this local conversation? This cannot be undone.')) return;
    await window.electronAPI.workspace.deleteConversation(id);
    if (selectedId === id) setSelectedId(null);
    refresh();
  };

  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
      <div style={{
        width: 'var(--sidebar-width)', borderRight: '1px solid var(--border-color)',
        display: 'flex', flexDirection: 'column', background: 'var(--bg-sidebar)',
      }}>
        <div style={{
          padding: '12px 16px', borderBottom: '1px solid var(--border-color)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'var(--bg-header-secondary)',
        }}>
          <h2 style={{ fontSize: 16, fontWeight: 600 }}>Local Workspace</h2>
          <button onClick={createNew} style={{
            padding: '6px 12px', borderRadius: 'var(--radius-md)',
            background: 'var(--accent)', color: '#fff', fontSize: 13, fontWeight: 500,
          }}>
            + New
          </button>
        </div>

        <div style={{ flex: 1, overflow: 'auto' }}>
          {(!conversations || conversations.length === 0) && (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 14 }}>
              <p>No local conversations yet</p>
              <p style={{ fontSize: 13, marginTop: 4 }}>Create one to start taking notes</p>
            </div>
          )}
          {conversations?.map(conv => (
            <div
              key={conv.conversation_id}
              onClick={() => setSelectedId(conv.conversation_id)}
              style={{
                display: 'flex', gap: 12, padding: '12px 16px',
                cursor: 'pointer', borderBottom: '1px solid var(--border-light)',
                background: selectedId === conv.conversation_id ? 'var(--bg-active)' : 'transparent',
              }}
              onMouseEnter={e => {
                if (selectedId !== conv.conversation_id)
                  e.currentTarget.style.background = 'var(--bg-hover)';
              }}
              onMouseLeave={e => {
                if (selectedId !== conv.conversation_id)
                  e.currentTarget.style.background = 'transparent';
              }}
            >
              <div style={{
                width: 44, height: 44, borderRadius: 'var(--radius-full)',
                background: 'var(--badge-local)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontWeight: 600, fontSize: 16, flexShrink: 0,
              }}>
                {conv.display_name.charAt(0).toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                  <span style={{ fontWeight: 500, fontSize: 15 }}>{conv.display_name}</span>
                  <span style={{ fontSize: 12, color: 'var(--text-timestamp)' }}>
                    {conv.last_message_time ? formatTimestamp(conv.last_message_time) : ''}
                  </span>
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span className="badge badge-local">Local</span>
                  <span>{conv.last_message_preview || 'Empty'}</span>
                </div>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); deleteConversation(conv.conversation_id); }}
                style={{ color: 'var(--danger)', fontSize: 12, alignSelf: 'center', padding: '4px 8px' }}
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      </div>

      {selectedId ? (
        <LocalConversationView conversationId={selectedId} onUpdate={refresh} />
      ) : (
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          background: 'var(--bg-secondary)', color: 'var(--text-secondary)',
        }}>
          <div style={{ fontSize: 64, marginBottom: 16, opacity: 0.3 }}>📝</div>
          <h2 style={{ fontSize: 20, fontWeight: 400, marginBottom: 8 }}>Local Workspace</h2>
          <p style={{ fontSize: 14 }}>Create conversations and notes that stay on your computer</p>
          <p style={{ fontSize: 13, marginTop: 4, color: 'var(--text-secondary)' }}>
            These are never sent to WhatsApp
          </p>
        </div>
      )}
    </div>
  );
}

function LocalConversationView({ conversationId, onUpdate }: { conversationId: string; onUpdate: () => void }) {
  const [entries, setEntries] = useState<LocalEntry[]>([]);
  const [input, setInput] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  const loadEntries = async () => {
    const data = await window.electronAPI.workspace.getEntries(conversationId);
    setEntries(data);
  };

  useEffect(() => { loadEntries(); }, [conversationId]);

  const addEntry = async () => {
    if (!input.trim()) return;
    await window.electronAPI.workspace.addEntry(conversationId, 'text', input.trim());
    setInput('');
    loadEntries();
    onUpdate();
  };

  const attachFile = async () => {
    const files = await window.electronAPI.import.selectFiles();
    if (files && files.length > 0) {
      for (const f of files) {
        await window.electronAPI.workspace.addEntry(conversationId, 'file', null, f);
      }
      loadEntries();
      onUpdate();
    }
  };

  const deleteEntry = async (id: string) => {
    if (!confirm('Delete this entry?')) return;
    await window.electronAPI.workspace.deleteEntry(id);
    loadEntries();
    onUpdate();
  };

  const startEdit = (entry: LocalEntry) => {
    setEditingId(entry.entry_id);
    setEditText(entry.text_content || '');
  };

  const saveEdit = async () => {
    if (editingId) {
      await window.electronAPI.workspace.updateEntry(editingId, editText);
      setEditingId(null);
      loadEntries();
      onUpdate();
    }
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--bg-chat)' }}>
      <div style={{
        height: 'var(--header-height)', background: 'var(--bg-header-secondary)',
        borderBottom: '1px solid var(--border-color)',
        display: 'flex', alignItems: 'center', padding: '0 16px', gap: 8,
      }}>
        <div style={{
          width: 40, height: 40, borderRadius: 'var(--radius-full)',
          background: 'var(--badge-local)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontWeight: 600,
        }}>
          📝
        </div>
        <div>
          <div style={{ fontWeight: 600 }}>Local Conversation</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{entries.length} entries · Never sent to WhatsApp</div>
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '16px 60px' }}>
        {entries.length === 0 && (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>
            Start typing below to add notes
          </div>
        )}
        {entries.map(entry => (
          <div key={entry.entry_id} style={{
            display: 'flex', justifyContent: 'flex-end', marginBottom: 4,
          }}>
            <div style={{
              maxWidth: '70%', padding: '8px 10px',
              borderRadius: '8px 0 8px 8px',
              background: 'var(--bg-bubble-out)',
              boxShadow: '0 1px 0.5px rgba(0,0,0,0.13)',
              position: 'relative',
            }}>
              {editingId === entry.entry_id ? (
                <div>
                  <textarea
                    value={editText}
                    onChange={e => setEditText(e.target.value)}
                    style={{
                      width: '100%', minHeight: 60, padding: 8, border: '1px solid var(--border-color)',
                      borderRadius: 'var(--radius-sm)', fontSize: 14, resize: 'vertical',
                      background: 'var(--bg-input)', color: 'var(--text-primary)',
                    }}
                  />
                  <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                    <button onClick={saveEdit} style={{ fontSize: 12, color: 'var(--accent)' }}>Save</button>
                    <button onClick={() => setEditingId(null)} style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Cancel</button>
                  </div>
                </div>
              ) : (
                <>
                  {entry.text_content && (
                    <div style={{ fontSize: 14, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                      {entry.text_content}
                    </div>
                  )}
                  {entry.entry_type === 'file' && (
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 4 }}>
                      📎 Attached file
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
                    <span style={{ fontSize: 11, color: 'var(--text-timestamp)' }}>
                      {new Date(entry.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    {entry.text_content && (
                      <button onClick={() => startEdit(entry)} style={{ fontSize: 11, color: 'var(--text-link)' }}>Edit</button>
                    )}
                    <button onClick={() => deleteEntry(entry.entry_id)} style={{ fontSize: 11, color: 'var(--danger)' }}>Delete</button>
                  </div>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      <div style={{
        padding: '10px 16px', borderTop: '1px solid var(--border-color)',
        background: 'var(--bg-header-secondary)', display: 'flex', gap: 8,
      }}>
        <button onClick={attachFile} style={{
          width: 40, height: 40, borderRadius: 'var(--radius-full)',
          background: 'var(--bg-secondary)', fontSize: 18, display: 'flex',
          alignItems: 'center', justifyContent: 'center',
        }}>
          📎
        </button>
        <input
          type="text"
          placeholder="Type a note..."
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addEntry(); } }}
          style={{
            flex: 1, padding: '8px 14px', borderRadius: 'var(--radius-md)',
            border: 'none', background: 'var(--bg-input)', fontSize: 15,
            color: 'var(--text-primary)',
          }}
        />
        <button onClick={addEntry} style={{
          width: 40, height: 40, borderRadius: 'var(--radius-full)',
          background: 'var(--accent)', color: '#fff', fontSize: 18,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          ➤
        </button>
      </div>
    </div>
  );
}
