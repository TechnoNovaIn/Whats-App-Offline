import type { ElectronAPI } from '../shared/types';

const noop = () => Promise.resolve(undefined as any);
const emptyArr = () => Promise.resolve([]);

const mock: ElectronAPI = {
  db: {
    getConversations: emptyArr,
    getMessages: emptyArr,
    getAttachments: emptyArr,
    getAttachment: () => Promise.resolve(null),
    searchMessages: emptyArr,
    getStats: () => Promise.resolve({
      total_conversations: 0, total_messages: 0, total_media: 0,
      total_local_conversations: 0, archive_size_bytes: 0,
    }),
    getImportJobs: emptyArr,
  },
  import: {
    selectFiles: () => Promise.resolve(null),
    selectFolder: () => Promise.resolve(null),
    preview: () => Promise.resolve({
      files: [], estimated_chats: 0, estimated_messages: 0,
      estimated_media: 0, total_size: 0, warnings: [],
    }),
    start: () => Promise.resolve(''),
    cancel: noop,
    onProgress: () => () => {},
    selectDatabase: () => Promise.resolve(null),
    selectKeyFile: () => Promise.resolve(null),
    detectEncryption: () => Promise.resolve('unknown' as const),
    startBackup: () => Promise.resolve(''),
    onBackupProgress: () => () => {},
  },
  workspace: {
    createConversation: () => Promise.resolve({
      conversation_id: '', source_type: 'local', display_name: '',
      conversation_type: 'individual', created_at: '', updated_at: '',
      message_count: 0, unread_count: 0,
    } as any),
    updateConversation: noop,
    deleteConversation: noop,
    addEntry: () => Promise.resolve({} as any),
    updateEntry: noop,
    deleteEntry: noop,
    getEntries: emptyArr,
  },
  media: {
    openFile: noop,
    getMediaUrl: () => Promise.resolve(null as any),
    getAllMedia: emptyArr,
  },
  archive: {
    getPath: () => Promise.resolve(''),
    setPath: noop,
    backup: noop,
    restore: noop,
    getSize: () => Promise.resolve(0),
  },
  app: {
    getVersion: () => Promise.resolve('1.0.0'),
    selectDirectory: () => Promise.resolve(null),
    getTheme: () => Promise.resolve('light' as const),
    setTheme: noop,
    onThemeChange: () => () => {},
  },
};

export function ensureElectronAPI(): void {
  if (!window.electronAPI) {
    window.electronAPI = mock;
  }
}
