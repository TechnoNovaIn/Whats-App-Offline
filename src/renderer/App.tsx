import React, { useState, useEffect } from 'react';
import type { AppPage } from '../shared/types';
import Sidebar from './components/Sidebar';
import ChatsPage from './pages/ChatsPage';
import MediaPage from './pages/MediaPage';
import SearchPage from './pages/SearchPage';
import WorkspacePage from './pages/WorkspacePage';
import SettingsPage from './pages/SettingsPage';
import ImportModal from './components/ImportModal';

declare global {
  interface Window {
    electronAPI: import('../shared/types').ElectronAPI;
  }
}

export default function App() {
  const [activePage, setActivePage] = useState<AppPage>('chats');
  const [showImport, setShowImport] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    window.electronAPI?.app.getTheme().then(setTheme);
    const unsub = window.electronAPI?.app.onThemeChange(setTheme);
    return () => unsub?.();
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    window.electronAPI?.app.setTheme(next);
  };

  const renderPage = () => {
    switch (activePage) {
      case 'chats': return <ChatsPage />;
      case 'media': return <MediaPage />;
      case 'search': return <SearchPage />;
      case 'workspace': return <WorkspacePage />;
      case 'settings': return <SettingsPage theme={theme} onToggleTheme={toggleTheme} />;
    }
  };

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw' }}>
      <Sidebar
        activePage={activePage}
        onNavigate={setActivePage}
        onImport={() => setShowImport(true)}
        theme={theme}
        onToggleTheme={toggleTheme}
      />
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {renderPage()}
      </main>
      {showImport && <ImportModal onClose={() => setShowImport(false)} />}
    </div>
  );
}
