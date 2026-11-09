import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { Conversation, Message, Attachment } from '../../shared/types';
import { useAsync, formatTimestamp, formatFullTimestamp } from '../hooks/useApi';

export default function ChatsPage() {
  const [selectedChat, setSelectedChat] = useState<string | null>(null);
  const { data: conversations, refresh } = useAsync(
    () => window.electronAPI.db.getConversations({ source_type: 'imported' }),
    []
  );

  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
      <ConversationList
        conversations={conversations || []}
        selectedId={selectedChat}
        onSelect={setSelectedChat}
        onRefresh={refresh}
      />
      {selectedChat ? (
        <ChatTimeline conversationId={selectedChat} />
      ) : (
        <EmptyState />
      )}
    </div>
  );
}

function ConversationList({ conversations, selectedId, onSelect }: {
  conversations: Conversation[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onRefresh: () => void;
}) {
  const [search, setSearch] = useState('');

  const filtered = conversations.filter(c =>
    c.display_name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{
      width: 'var(--sidebar-width)', borderRight: '1px solid var(--border-color)',
      display: 'flex', flexDirection: 'column', background: 'var(--bg-sidebar)',
    }}>
      <div style={{
        padding: '10px 12px', borderBottom: '1px solid var(--border-color)',
        background: 'var(--bg-header-secondary)',
      }}>
        <input
          type="text"
          placeholder="Search or start new chat"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            width: '100%', padding: '8px 12px',
            borderRadius: 'var(--radius-md)', border: 'none',
            background: 'var(--bg-input)', fontSize: 14,
            color: 'var(--text-primary)',
          }}
        />
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        {filtered.length === 0 && (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 14 }}>
            No conversations found
          </div>
        )}
        {filtered.map(conv => (
          <div
            key={conv.conversation_id}
            onClick={() => onSelect(conv.conversation_id)}
            style={{
              display: 'flex', gap: 12, padding: '12px 16px',
              cursor: 'pointer', borderBottom: '1px solid var(--border-light)',
              background: selectedId === conv.conversation_id ? 'var(--bg-active)' : 'transparent',
            }}
            onMouseEnter={e => {
              if (selectedId !== conv.conversation_id) (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)';
            }}
            onMouseLeave={e => {
              if (selectedId !== conv.conversation_id) (e.currentTarget as HTMLElement).style.background = 'transparent';
            }}
          >
            <div style={{
              width: 48, height: 48, borderRadius: 'var(--radius-full)',
              background: conv.conversation_type === 'group' ? '#00a884' : '#667781',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontWeight: 600, fontSize: 18, flexShrink: 0,
            }}>
              {conv.display_name.charAt(0).toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                <span style={{ fontWeight: 500, fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {conv.display_name}
                </span>
                <span style={{ fontSize: 12, color: 'var(--text-timestamp)', flexShrink: 0, marginLeft: 8 }}>
                  {conv.last_message_time ? formatTimestamp(conv.last_message_time) : ''}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{
                  fontSize: 13, color: 'var(--text-secondary)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
                }}>
                  {conv.last_message_preview || 'No messages'}
                </span>
                {conv.source_type === 'local' && (
                  <span className="badge badge-local">Local</span>
                )}
                {conv.message_count > 0 && (
                  <span style={{
                    fontSize: 11, background: 'var(--accent)', color: '#fff',
                    borderRadius: 'var(--radius-full)', padding: '1px 6px', fontWeight: 600,
                  }}>
                    {conv.message_count > 999 ? '999+' : conv.message_count}
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ChatTimeline({ conversationId }: { conversationId: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [loading, setLoading] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const PAGE_SIZE = 100;

  useEffect(() => {
    setMessages([]);
    setPage(0);
    setHasMore(true);
    setLoading(true);
    loadMessages(0);
    window.electronAPI.db.getConversations().then(convs => {
      const c = convs.find(c => c.conversation_id === conversationId);
      setConversation(c || null);
    });
  }, [conversationId]);

  const loadMessages = async (pageNum: number) => {
    const msgs = await window.electronAPI.db.getMessages(conversationId, PAGE_SIZE, pageNum * PAGE_SIZE);
    if (pageNum === 0) {
      setMessages(msgs);
    } else {
      setMessages(prev => [...prev, ...msgs]);
    }
    setHasMore(msgs.length === PAGE_SIZE);
    setLoading(false);
  };

  useEffect(() => {
    if (page === 0 && messages.length > 0) {
      messagesEndRef.current?.scrollIntoView();
    }
  }, [messages, page]);

  const loadMore = useCallback(() => {
    if (!hasMore || loading) return;
    const nextPage = page + 1;
    setPage(nextPage);
    loadMessages(nextPage);
  }, [page, hasMore, loading]);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--bg-chat)' }}>
      <div style={{
        height: 'var(--header-height)', background: 'var(--bg-header-secondary)',
        borderBottom: '1px solid var(--border-color)',
        display: 'flex', alignItems: 'center', padding: '0 16px', gap: 12,
      }}>
        <div style={{
          width: 40, height: 40, borderRadius: 'var(--radius-full)',
          background: conversation?.conversation_type === 'group' ? '#00a884' : '#667781',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontWeight: 600, fontSize: 16,
        }}>
          {conversation?.display_name?.charAt(0).toUpperCase() || '?'}
        </div>
        <div>
          <div style={{ fontWeight: 600, fontSize: 16 }}>{conversation?.display_name || 'Chat'}</div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            {conversation?.message_count || 0} messages
            {conversation?.source_type === 'imported' && ' · Imported archive'}
          </div>
        </div>
      </div>

      <div ref={containerRef} style={{
        flex: 1, overflow: 'auto', padding: '6px 60px',
        backgroundImage: 'var(--chat-bg-pattern, none)',
        backgroundSize: '412.5px 749.25px',
      }}>
        {hasMore && messages.length > 0 && (
          <div style={{ textAlign: 'center', padding: 12 }}>
            <button onClick={loadMore} style={{
              padding: '6px 16px', borderRadius: 'var(--radius-full)',
              background: 'var(--bg-bubble-system)', color: 'var(--text-system)',
              fontSize: 13, border: 'none',
            }}>
              Load older messages
            </button>
          </div>
        )}
        {loading && <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-secondary)' }}>Loading...</div>}
        {messages.map(msg => (
          <MessageBubble key={msg.message_id} message={msg} />
        ))}
        <div ref={messagesEndRef} />
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isOutgoing = message.direction === 'outgoing';
  const isSystem = message.message_type === 'system';
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);

  useEffect(() => {
    if (message.message_type !== 'text' && message.message_type !== 'system') {
      window.electronAPI.db.getAttachments(message.conversation_id).then(atts => {
        const att = atts.find(a => a.message_id === message.message_id);
        if (att) {
          setAttachment(att);
          if (att.availability_status === 'available') {
            window.electronAPI.media.getMediaUrl(att.relative_path).then(url => {
              if (url) setMediaUrl(url);
            });
          }
        }
      });
    }
  }, [message.message_id]);

  if (isSystem) {
    return (
      <div style={{ textAlign: 'center', margin: '4px 0' }}>
        <span style={{
          display: 'inline-block', background: 'var(--bg-bubble-system)',
          padding: '5px 12px 6px', borderRadius: '7.5px',
          fontSize: 12.5, color: 'var(--text-system)',
          boxShadow: '0 1px 0.5px rgba(11,20,26,0.13)',
        }}>
          {message.text_content}
        </span>
      </div>
    );
  }

  const timeStr = formatFullTimestamp(message.timestamp).split(',').pop()?.trim() || '';

  return (
    <div style={{
      display: 'flex', justifyContent: isOutgoing ? 'flex-end' : 'flex-start',
      marginBottom: 1, paddingLeft: isOutgoing ? '48px' : 0, paddingRight: isOutgoing ? 0 : '48px',
    }}>
      <div style={{
        maxWidth: '65%', padding: '6px 7px 8px 9px',
        borderRadius: isOutgoing ? '7.5px 7.5px 0 7.5px' : '7.5px 7.5px 7.5px 0',
        background: isOutgoing ? 'var(--bg-bubble-out)' : 'var(--bg-bubble-in)',
        boxShadow: '0 1px 0.5px rgba(11,20,26,0.13)',
        position: 'relative',
      }}>
        {!isOutgoing && message.sender_label !== 'Unknown' && message.sender_label.toLowerCase() !== 'you' && (
          <div style={{ fontSize: 12.8, fontWeight: 600, color: '#1fa855', marginBottom: 1 }}>
            {message.sender_label}
          </div>
        )}

        {attachment && attachment.availability_status === 'missing' && (
          <div style={{
            padding: '8px 12px', background: 'rgba(0,0,0,0.05)', borderRadius: 'var(--radius-sm)',
            marginBottom: 4, fontSize: 13, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <span style={{ flexShrink: 0 }}>&#9888;</span> Missing attachment: {attachment.original_name}
          </div>
        )}

        {mediaUrl && (message.message_type === 'image') && (
          <img
            src={mediaUrl}
            alt={attachment?.original_name || 'Image'}
            style={{ maxWidth: '100%', borderRadius: 'var(--radius-sm)', marginBottom: 4, cursor: 'pointer' }}
            onClick={() => attachment && window.electronAPI.media.openFile(attachment.relative_path)}
          />
        )}
        {mediaUrl && message.message_type === 'video' && (
          <video
            src={mediaUrl}
            controls
            style={{ maxWidth: '100%', borderRadius: 'var(--radius-sm)', marginBottom: 4 }}
          />
        )}
        {mediaUrl && message.message_type === 'audio' && (
          <audio src={mediaUrl} controls style={{ width: '100%', marginBottom: 4 }} />
        )}
        {attachment && message.message_type === 'document' && attachment.availability_status === 'available' && (
          <div
            onClick={() => window.electronAPI.media.openFile(attachment.relative_path)}
            style={{
              padding: '8px 12px', background: 'rgba(0,0,0,0.05)', borderRadius: 'var(--radius-sm)',
              cursor: 'pointer', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8,
            }}
          >
            <span style={{ fontSize: 24 }}>&#128196;</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500 }}>{attachment.original_name}</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                {(attachment.size_bytes / 1024).toFixed(0)} KB
              </div>
            </div>
          </div>
        )}

        {message.text_content && (
          <span style={{ fontSize: 14.2, lineHeight: 1.27, color: 'var(--text-bubble)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {message.text_content}
          </span>
        )}

        <span style={{
          float: 'right', fontSize: 11, color: isOutgoing ? 'var(--text-timestamp-out, var(--text-timestamp))' : 'var(--text-timestamp)',
          marginLeft: 12, marginTop: 2, whiteSpace: 'nowrap',
        }}>
          {timeStr}
        </span>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg-secondary)', color: 'var(--text-secondary)',
    }}>
      <div style={{ fontSize: 64, marginBottom: 16, opacity: 0.3 }}>💬</div>
      <h2 style={{ fontSize: 20, fontWeight: 400, marginBottom: 8 }}>WhatsApp Offline Archive</h2>
      <p style={{ fontSize: 14 }}>Select a conversation to view messages</p>
    </div>
  );
}
