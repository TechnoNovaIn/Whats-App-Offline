import React from 'react';
import type { AppPage } from '../../shared/types';

interface Props {
  activePage: AppPage;
  onNavigate: (page: AppPage) => void;
  onImport: () => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
}

const NAV_ITEMS: { page: AppPage; label: string; icon: string }[] = [
  { page: 'chats', label: 'Chats', icon: '💬' },
  { page: 'media', label: 'Media', icon: '🖼' },
  { page: 'search', label: 'Search', icon: '🔍' },
  { page: 'workspace', label: 'Workspace', icon: '📝' },
  { page: 'settings', label: 'Settings', icon: '⚙' },
];

export default function Sidebar({ activePage, onNavigate, onImport, theme, onToggleTheme }: Props) {
  return (
    <nav style={{
      width: 64,
      background: 'var(--bg-header)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '12px 0',
      gap: 4,
      flexShrink: 0,
    }}>
      <div style={{
        width: 40, height: 40, borderRadius: 'var(--radius-full)',
        background: 'rgba(255,255,255,0.2)', display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        fontSize: 18, marginBottom: 12,
        color: '#fff', fontWeight: 700,
      }}>
        W
      </div>

      {NAV_ITEMS.map(item => (
        <button
          key={item.page}
          onClick={() => onNavigate(item.page)}
          title={item.label}
          style={{
            width: 48, height: 48, borderRadius: 'var(--radius-lg)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 20,
            background: activePage === item.page ? 'rgba(255,255,255,0.2)' : 'transparent',
            transition: 'background 0.15s',
          }}
          onMouseEnter={e => {
            if (activePage !== item.page) (e.target as HTMLElement).style.background = 'rgba(255,255,255,0.1)';
          }}
          onMouseLeave={e => {
            if (activePage !== item.page) (e.target as HTMLElement).style.background = 'transparent';
          }}
        >
          {item.icon}
        </button>
      ))}

      <div style={{ flex: 1 }} />

      <button
        onClick={onImport}
        title="Import"
        style={{
          width: 48, height: 48, borderRadius: 'var(--radius-lg)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 20, background: 'rgba(255,255,255,0.15)',
        }}
      >
        📥
      </button>

      <button
        onClick={onToggleTheme}
        title={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
        style={{
          width: 48, height: 48, borderRadius: 'var(--radius-lg)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 18,
        }}
      >
        {theme === 'light' ? '🌙' : '☀️'}
      </button>
    </nav>
  );
}
