import React, { useState, useEffect } from 'react';
import type { Attachment, MediaFilter } from '../../shared/types';
import { useAsync, formatFileSize } from '../hooks/useApi';

type MediaTab = 'all' | 'image' | 'video' | 'audio' | 'document';

export default function MediaPage() {
  const [tab, setTab] = useState<MediaTab>('all');
  const [selectedMedia, setSelectedMedia] = useState<Attachment | null>(null);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);

  const filter: MediaFilter | undefined = tab === 'all' ? undefined : { type: tab };
  const { data: media, loading } = useAsync(
    () => window.electronAPI.media.getAllMedia(filter),
    [tab]
  );

  useEffect(() => {
    if (selectedMedia && selectedMedia.availability_status === 'available') {
      window.electronAPI.media.getMediaUrl(selectedMedia.relative_path).then(setMediaUrl);
    } else {
      setMediaUrl(null);
    }
  }, [selectedMedia]);

  const tabs: { key: MediaTab; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'image', label: 'Photos' },
    { key: 'video', label: 'Videos' },
    { key: 'audio', label: 'Audio' },
    { key: 'document', label: 'Documents' },
  ];

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--bg-primary)' }}>
      <div style={{
        padding: '12px 20px', borderBottom: '1px solid var(--border-color)',
        background: 'var(--bg-header-secondary)', display: 'flex', gap: 4,
      }}>
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => { setTab(t.key); setSelectedMedia(null); }}
            style={{
              padding: '6px 16px', borderRadius: 'var(--radius-full)',
              fontSize: 13, fontWeight: 500,
              background: tab === t.key ? 'var(--accent)' : 'transparent',
              color: tab === t.key ? '#fff' : 'var(--text-primary)',
              border: tab === t.key ? 'none' : '1px solid var(--border-color)',
            }}
          >
            {t.label}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 13, color: 'var(--text-secondary)', alignSelf: 'center' }}>
          {media?.length || 0} items
        </span>
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
          {loading && <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-secondary)' }}>Loading...</div>}

          {!loading && (!media || media.length === 0) && (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>
              <div style={{ fontSize: 48, marginBottom: 12, opacity: 0.3 }}>🖼</div>
              <p>No media files found</p>
              <p style={{ fontSize: 13, marginTop: 4 }}>Import chats with media to see them here</p>
            </div>
          )}

          {(tab === 'image' || tab === 'all') && media && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
              gap: 4,
            }}>
              {media.filter(m => tab === 'all' ? m.mime_type.startsWith('image/') || m.mime_type.startsWith('video/') : true).map(item => (
                <MediaThumbnail
                  key={item.attachment_id}
                  attachment={item}
                  onClick={() => setSelectedMedia(item)}
                  isSelected={selectedMedia?.attachment_id === item.attachment_id}
                />
              ))}
            </div>
          )}

          {(tab === 'audio' || tab === 'document') && media && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {media.map(item => (
                <div
                  key={item.attachment_id}
                  onClick={() => setSelectedMedia(item)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
                    borderRadius: 'var(--radius-md)', cursor: 'pointer',
                    background: selectedMedia?.attachment_id === item.attachment_id ? 'var(--bg-active)' : 'transparent',
                  }}
                  onMouseEnter={e => {
                    if (selectedMedia?.attachment_id !== item.attachment_id)
                      e.currentTarget.style.background = 'var(--bg-hover)';
                  }}
                  onMouseLeave={e => {
                    if (selectedMedia?.attachment_id !== item.attachment_id)
                      e.currentTarget.style.background = 'transparent';
                  }}
                >
                  <span style={{ fontSize: 28 }}>
                    {item.mime_type.startsWith('audio/') ? '🎵' : '📄'}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.original_name}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      {formatFileSize(item.size_bytes)}
                      {item.availability_status === 'missing' && ' · Missing'}
                    </div>
                  </div>
                  {item.availability_status === 'available' && (
                    <button
                      onClick={(e) => { e.stopPropagation(); window.electronAPI.media.openFile(item.relative_path); }}
                      style={{ padding: '4px 10px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-secondary)', fontSize: 12 }}
                    >
                      Open
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {selectedMedia && (
          <div style={{
            width: 320, borderLeft: '1px solid var(--border-color)',
            background: 'var(--bg-secondary)', padding: 16, overflow: 'auto',
          }}>
            <div style={{ marginBottom: 16 }}>
              {mediaUrl && selectedMedia.mime_type.startsWith('image/') && (
                <img src={mediaUrl} alt="" style={{ width: '100%', borderRadius: 'var(--radius-md)' }} />
              )}
              {mediaUrl && selectedMedia.mime_type.startsWith('video/') && (
                <video src={mediaUrl} controls style={{ width: '100%', borderRadius: 'var(--radius-md)' }} />
              )}
              {mediaUrl && selectedMedia.mime_type.startsWith('audio/') && (
                <audio src={mediaUrl} controls style={{ width: '100%' }} />
              )}
              {!mediaUrl && selectedMedia.availability_status === 'missing' && (
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-secondary)' }}>
                  <div style={{ fontSize: 40, marginBottom: 8 }}>⚠</div>
                  <p>File not available</p>
                </div>
              )}
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              <div style={{ marginBottom: 8, fontWeight: 600, color: 'var(--text-primary)', fontSize: 14, wordBreak: 'break-all' }}>
                {selectedMedia.original_name}
              </div>
              <div style={detailRow}><span>Type</span><span>{selectedMedia.mime_type}</span></div>
              <div style={detailRow}><span>Size</span><span>{formatFileSize(selectedMedia.size_bytes)}</span></div>
              <div style={detailRow}><span>Status</span><span>{selectedMedia.availability_status}</span></div>
            </div>
            {selectedMedia.availability_status === 'available' && (
              <button
                onClick={() => window.electronAPI.media.openFile(selectedMedia.relative_path)}
                style={{
                  width: '100%', marginTop: 16, padding: '10px 0',
                  borderRadius: 'var(--radius-md)', background: 'var(--accent)',
                  color: '#fff', fontWeight: 500, fontSize: 14, border: 'none',
                }}
              >
                Open in System Viewer
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function MediaThumbnail({ attachment, onClick, isSelected }: {
  attachment: Attachment; onClick: () => void; isSelected: boolean;
}) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (attachment.availability_status === 'available' && attachment.mime_type.startsWith('image/')) {
      window.electronAPI.media.getMediaUrl(attachment.relative_path).then(setUrl);
    }
  }, [attachment]);

  return (
    <div
      onClick={onClick}
      style={{
        aspectRatio: '1', borderRadius: 'var(--radius-sm)', overflow: 'hidden',
        cursor: 'pointer', position: 'relative',
        border: isSelected ? '2px solid var(--accent)' : '2px solid transparent',
        background: 'var(--bg-secondary)',
      }}
    >
      {url ? (
        <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        <div style={{
          width: '100%', height: '100%', display: 'flex',
          alignItems: 'center', justifyContent: 'center', fontSize: 24,
          color: 'var(--text-secondary)',
        }}>
          {attachment.availability_status === 'missing' ? '⚠' :
           attachment.mime_type.startsWith('video/') ? '🎬' : '📄'}
        </div>
      )}
    </div>
  );
}

const detailRow: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between', padding: '4px 0',
  borderBottom: '1px solid var(--border-color)',
};
