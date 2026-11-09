import { app, BrowserWindow, ipcMain, dialog, shell, nativeTheme } from 'electron';
import path from 'path';
import fs from 'fs';
import { v4 as uuid } from 'uuid';
import { initDatabase, closeDatabase } from './database';
import * as queries from './db-queries';
import { previewImport, importFiles, cancelImport, type ImportProgress } from './parser';
import { importFullBackup, cancelBackupImport, type BackupProgress } from './backup-parser';
import { detectEncryptionType } from './decryptor';
import { MEDIA_DIR } from '../shared/constants';

let mainWindow: BrowserWindow | null = null;
let archivePath: string;

function getDefaultArchivePath(): string {
  return path.join(app.getPath('userData'), 'archive');
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'WhatsApp Offline Archive',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    show: false,
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }
}

function setupIpcHandlers(): void {
  // Database queries
  ipcMain.handle('db:getConversations', (_, filter) => queries.getConversations(filter));
  ipcMain.handle('db:getMessages', (_, conversationId, limit, offset) => queries.getMessages(conversationId, limit, offset));
  ipcMain.handle('db:getAttachments', (_, conversationId) => queries.getAttachments(conversationId));
  ipcMain.handle('db:getAttachment', (_, attachmentId) => queries.getAttachment(attachmentId));
  ipcMain.handle('db:searchMessages', (_, query, filters) => queries.searchMessages(query, filters));
  ipcMain.handle('db:getStats', () => queries.getStats());
  ipcMain.handle('db:getImportJobs', () => queries.getImportJobs());

  // Import
  ipcMain.handle('import:selectFiles', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'WhatsApp Chat Export', extensions: ['txt'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });
    return result.canceled ? null : result.filePaths;
  });

  ipcMain.handle('import:selectFolder', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openDirectory'],
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle('import:preview', (_, paths: string[]) => {
    return previewImport(paths);
  });

  ipcMain.handle('import:start', (_, paths: string[], mediaFolder?: string) => {
    const onProgress = (progress: ImportProgress) => {
      mainWindow?.webContents.send('import:progress', progress);
    };
    return importFiles(paths, mediaFolder, archivePath, onProgress);
  });

  ipcMain.handle('import:cancel', (_, jobId: string) => {
    cancelImport(jobId);
    cancelBackupImport(jobId);
  });

  // Full backup import
  ipcMain.handle('import:selectDatabase', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openFile'],
      filters: [
        { name: 'WhatsApp Database', extensions: ['db', 'crypt14', 'crypt15'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle('import:selectKeyFile', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openFile'],
      filters: [
        { name: 'Key File', extensions: ['*'] },
      ],
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle('import:detectEncryption', (_, dbPath: string) => {
    return detectEncryptionType(dbPath);
  });

  ipcMain.handle('import:startBackup', (_, dbPath: string, mediaPath?: string, keyPath?: string, backupKey?: string) => {
    const onProgress = (progress: BackupProgress) => {
      mainWindow?.webContents.send('import:backupProgress', progress);
    };
    return importFullBackup({
      dbPath,
      mediaPath: mediaPath || undefined,
      keyPath: keyPath || undefined,
      backupKey: backupKey || undefined,
      archivePath,
      onProgress,
    });
  });

  // Workspace
  ipcMain.handle('workspace:createConversation', (_, title: string) => {
    return queries.createLocalConversation(uuid(), title);
  });
  ipcMain.handle('workspace:updateConversation', (_, id: string, title: string) => {
    queries.updateLocalConversation(id, title);
  });
  ipcMain.handle('workspace:deleteConversation', (_, id: string) => {
    queries.deleteLocalConversation(id);
  });
  ipcMain.handle('workspace:addEntry', (_, conversationId: string, type: string, content: string | null, filePath?: string) => {
    let attachmentId: string | undefined;
    if (filePath) {
      attachmentId = uuid();
      const fileName = path.basename(filePath);
      const destDir = path.join(archivePath, MEDIA_DIR, 'local');
      fs.mkdirSync(destDir, { recursive: true });
      const destPath = path.join(destDir, `${attachmentId}_${fileName}`);
      fs.copyFileSync(filePath, destPath);

      const ext = path.extname(fileName).toLowerCase();
      const { MIME_MAP } = require('../shared/constants');
      const mimeType = MIME_MAP[ext] || 'application/octet-stream';
      const stat = fs.statSync(destPath);

      const { getDb } = require('./database');
      getDb().prepare(`
        INSERT INTO attachments (attachment_id, conversation_id, relative_path, original_name, mime_type, size_bytes, availability_status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 'available', datetime('now'))
      `).run(attachmentId, conversationId, path.join(MEDIA_DIR, 'local', `${attachmentId}_${fileName}`), fileName, mimeType, stat.size);
    }
    return queries.addLocalEntry(uuid(), conversationId, type, content, attachmentId);
  });
  ipcMain.handle('workspace:updateEntry', (_, entryId: string, content: string) => {
    queries.updateLocalEntry(entryId, content);
  });
  ipcMain.handle('workspace:deleteEntry', (_, entryId: string) => {
    queries.deleteLocalEntry(entryId);
  });
  ipcMain.handle('workspace:getEntries', (_, conversationId: string) => {
    return queries.getLocalEntries(conversationId);
  });

  // Media
  ipcMain.handle('media:openFile', (_, relativePath: string) => {
    const fullPath = path.join(archivePath, relativePath);
    if (fs.existsSync(fullPath)) {
      shell.openPath(fullPath);
    }
  });

  ipcMain.handle('media:getMediaUrl', (_, relativePath: string) => {
    const fullPath = path.join(archivePath, relativePath);
    if (fs.existsSync(fullPath)) {
      return `file://${fullPath}`;
    }
    return null;
  });

  ipcMain.handle('media:getAllMedia', (_, filter) => queries.getAllMedia(filter));

  // Archive
  ipcMain.handle('archive:getPath', () => archivePath);
  ipcMain.handle('archive:setPath', async (_, newPath: string) => {
    archivePath = newPath;
    closeDatabase();
    initDatabase(archivePath);
  });
  ipcMain.handle('archive:backup', async (_, destination: string) => {
    const dbSrc = path.join(archivePath, 'archive.db');
    const dbDest = path.join(destination, 'archive.db');
    fs.mkdirSync(destination, { recursive: true });
    fs.copyFileSync(dbSrc, dbDest);
    const mediaSrc = path.join(archivePath, MEDIA_DIR);
    if (fs.existsSync(mediaSrc)) {
      copyDirSync(mediaSrc, path.join(destination, MEDIA_DIR));
    }
  });
  ipcMain.handle('archive:restore', async (_, source: string) => {
    const dbSrc = path.join(source, 'archive.db');
    if (!fs.existsSync(dbSrc)) throw new Error('No archive.db found in backup');
    closeDatabase();
    fs.copyFileSync(dbSrc, path.join(archivePath, 'archive.db'));
    const mediaSrc = path.join(source, MEDIA_DIR);
    if (fs.existsSync(mediaSrc)) {
      copyDirSync(mediaSrc, path.join(archivePath, MEDIA_DIR));
    }
    initDatabase(archivePath);
  });
  ipcMain.handle('archive:getSize', () => {
    return getDirSize(archivePath);
  });

  // App
  ipcMain.handle('app:getVersion', () => app.getVersion());
  ipcMain.handle('app:selectDirectory', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openDirectory', 'createDirectory'],
    });
    return result.canceled ? null : result.filePaths[0];
  });
  ipcMain.handle('app:getTheme', () => nativeTheme.shouldUseDarkColors ? 'dark' : 'light');
  ipcMain.handle('app:setTheme', (_, theme: 'light' | 'dark') => {
    nativeTheme.themeSource = theme;
  });
}

function copyDirSync(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function getDirSize(dirPath: string): number {
  let size = 0;
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        size += getDirSize(fullPath);
      } else {
        size += fs.statSync(fullPath).size;
      }
    }
  } catch { /* empty or inaccessible */ }
  return size;
}

app.whenReady().then(() => {
  archivePath = getDefaultArchivePath();
  initDatabase(archivePath);
  setupIpcHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  closeDatabase();
  if (process.platform !== 'darwin') app.quit();
});
