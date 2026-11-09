import { contextBridge, ipcRenderer } from 'electron';
import type { ElectronAPI } from '../shared/types';

const api: ElectronAPI = {
  db: {
    getConversations: (filter) => ipcRenderer.invoke('db:getConversations', filter),
    getMessages: (conversationId, limit, offset) => ipcRenderer.invoke('db:getMessages', conversationId, limit, offset),
    getAttachments: (conversationId) => ipcRenderer.invoke('db:getAttachments', conversationId),
    getAttachment: (attachmentId) => ipcRenderer.invoke('db:getAttachment', attachmentId),
    searchMessages: (query, filters) => ipcRenderer.invoke('db:searchMessages', query, filters),
    getStats: () => ipcRenderer.invoke('db:getStats'),
    getImportJobs: () => ipcRenderer.invoke('db:getImportJobs'),
  },
  import: {
    selectFiles: () => ipcRenderer.invoke('import:selectFiles'),
    selectFolder: () => ipcRenderer.invoke('import:selectFolder'),
    preview: (paths) => ipcRenderer.invoke('import:preview', paths),
    start: (paths, mediaFolder) => ipcRenderer.invoke('import:start', paths, mediaFolder),
    cancel: (jobId) => ipcRenderer.invoke('import:cancel', jobId),
    onProgress: (callback) => {
      const handler = (_: any, progress: any) => callback(progress);
      ipcRenderer.on('import:progress', handler);
      return () => ipcRenderer.removeListener('import:progress', handler);
    },
    selectDatabase: () => ipcRenderer.invoke('import:selectDatabase'),
    selectKeyFile: () => ipcRenderer.invoke('import:selectKeyFile'),
    detectEncryption: (dbPath: string) => ipcRenderer.invoke('import:detectEncryption', dbPath),
    startBackup: (dbPath: string, mediaPath?: string, keyPath?: string, backupKey?: string) =>
      ipcRenderer.invoke('import:startBackup', dbPath, mediaPath, keyPath, backupKey),
    onBackupProgress: (callback: (progress: any) => void) => {
      const handler = (_: any, progress: any) => callback(progress);
      ipcRenderer.on('import:backupProgress', handler);
      return () => ipcRenderer.removeListener('import:backupProgress', handler);
    },
  },
  workspace: {
    createConversation: (title) => ipcRenderer.invoke('workspace:createConversation', title),
    updateConversation: (id, title) => ipcRenderer.invoke('workspace:updateConversation', id, title),
    deleteConversation: (id) => ipcRenderer.invoke('workspace:deleteConversation', id),
    addEntry: (conversationId, type, content, filePath) => ipcRenderer.invoke('workspace:addEntry', conversationId, type, content, filePath),
    updateEntry: (entryId, content) => ipcRenderer.invoke('workspace:updateEntry', entryId, content),
    deleteEntry: (entryId) => ipcRenderer.invoke('workspace:deleteEntry', entryId),
    getEntries: (conversationId) => ipcRenderer.invoke('workspace:getEntries', conversationId),
  },
  media: {
    openFile: (relativePath) => ipcRenderer.invoke('media:openFile', relativePath),
    getMediaUrl: (relativePath) => ipcRenderer.invoke('media:getMediaUrl', relativePath),
    getAllMedia: (filter) => ipcRenderer.invoke('media:getAllMedia', filter),
  },
  archive: {
    getPath: () => ipcRenderer.invoke('archive:getPath'),
    setPath: (p) => ipcRenderer.invoke('archive:setPath', p),
    backup: (dest) => ipcRenderer.invoke('archive:backup', dest),
    restore: (src) => ipcRenderer.invoke('archive:restore', src),
    getSize: () => ipcRenderer.invoke('archive:getSize'),
  },
  app: {
    getVersion: () => ipcRenderer.invoke('app:getVersion'),
    selectDirectory: () => ipcRenderer.invoke('app:selectDirectory'),
    getTheme: () => ipcRenderer.invoke('app:getTheme'),
    setTheme: (theme) => ipcRenderer.invoke('app:setTheme', theme),
    onThemeChange: (callback) => {
      const handler = (_: any, theme: any) => callback(theme);
      ipcRenderer.on('app:themeChanged', handler);
      return () => ipcRenderer.removeListener('app:themeChanged', handler);
    },
  },
};

contextBridge.exposeInMainWorld('electronAPI', api);
