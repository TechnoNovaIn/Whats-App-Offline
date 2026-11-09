export interface Conversation {
  conversation_id: string;
  source_type: 'imported' | 'local';
  display_name: string;
  conversation_type: 'individual' | 'group';
  created_at: string;
  updated_at: string;
  import_job_id?: string;
  last_message_preview?: string;
  last_message_time?: string;
  message_count: number;
  unread_count: number;
}

export interface Message {
  message_id: string;
  conversation_id: string;
  sender_label: string;
  timestamp: string;
  message_type: 'text' | 'image' | 'video' | 'audio' | 'document' | 'sticker' | 'system' | 'unknown';
  text_content: string | null;
  direction: 'incoming' | 'outgoing' | 'unknown';
  source_reference?: string;
  is_local: boolean;
}

export interface Attachment {
  attachment_id: string;
  message_id: string | null;
  conversation_id: string;
  relative_path: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  hash?: string;
  availability_status: 'available' | 'missing' | 'unsupported';
  thumbnail_path?: string;
  created_at: string;
}

export interface Contact {
  contact_id: string;
  display_name: string;
  phone_or_identifier?: string;
  avatar_path?: string;
  source_reference?: string;
}

export interface ImportJob {
  job_id: string;
  source_path: string;
  started_at: string;
  completed_at?: string;
  status: 'pending' | 'running' | 'completed' | 'cancelled' | 'failed';
  total_files: number;
  processed_files: number;
  imported_messages: number;
  imported_media: number;
  skipped_items: number;
  warnings: string[];
  errors: string[];
}

export interface LocalEntry {
  entry_id: string;
  conversation_id: string;
  entry_type: 'text' | 'note' | 'file';
  text_content: string | null;
  created_at: string;
  updated_at: string;
  attachment_id?: string;
}

export interface SearchResult {
  message: Message;
  conversation: Conversation;
  highlight: string;
}

export interface ImportPreview {
  files: { name: string; type: string; size: number }[];
  estimated_chats: number;
  estimated_messages: number;
  estimated_media: number;
  total_size: number;
  warnings: string[];
}

export interface ArchiveStats {
  total_conversations: number;
  total_messages: number;
  total_media: number;
  total_local_conversations: number;
  archive_size_bytes: number;
  last_import?: string;
}

export type AppPage = 'chats' | 'media' | 'search' | 'workspace' | 'settings';

export interface ElectronAPI {
  db: {
    getConversations: (filter?: { source_type?: string }) => Promise<Conversation[]>;
    getMessages: (conversationId: string, limit?: number, offset?: number) => Promise<Message[]>;
    getAttachments: (conversationId?: string) => Promise<Attachment[]>;
    getAttachment: (attachmentId: string) => Promise<Attachment | null>;
    searchMessages: (query: string, filters?: SearchFilters) => Promise<SearchResult[]>;
    getStats: () => Promise<ArchiveStats>;
    getImportJobs: () => Promise<ImportJob[]>;
  };
  import: {
    selectFiles: () => Promise<string[] | null>;
    selectFolder: () => Promise<string | null>;
    preview: (paths: string[]) => Promise<ImportPreview>;
    start: (paths: string[], mediaFolder?: string) => Promise<string>;
    cancel: (jobId: string) => Promise<void>;
    onProgress: (callback: (job: ImportJob) => void) => () => void;
    selectDatabase: () => Promise<string | null>;
    selectKeyFile: () => Promise<string | null>;
    detectEncryption: (dbPath: string) => Promise<'crypt14' | 'crypt15' | 'plain' | 'unknown'>;
    startBackup: (dbPath: string, mediaPath?: string, keyPath?: string, backupKey?: string) => Promise<string>;
    onBackupProgress: (callback: (progress: BackupProgress) => void) => () => void;
  };
  workspace: {
    createConversation: (title: string) => Promise<Conversation>;
    updateConversation: (id: string, title: string) => Promise<void>;
    deleteConversation: (id: string) => Promise<void>;
    addEntry: (conversationId: string, type: string, content: string | null, filePath?: string) => Promise<LocalEntry>;
    updateEntry: (entryId: string, content: string) => Promise<void>;
    deleteEntry: (entryId: string) => Promise<void>;
    getEntries: (conversationId: string) => Promise<LocalEntry[]>;
  };
  media: {
    openFile: (relativePath: string) => Promise<void>;
    getMediaUrl: (relativePath: string) => Promise<string>;
    getAllMedia: (filter?: MediaFilter) => Promise<Attachment[]>;
  };
  archive: {
    getPath: () => Promise<string>;
    setPath: (path: string) => Promise<void>;
    backup: (destination: string) => Promise<void>;
    restore: (source: string) => Promise<void>;
    getSize: () => Promise<number>;
  };
  app: {
    getVersion: () => Promise<string>;
    selectDirectory: () => Promise<string | null>;
    getTheme: () => Promise<'light' | 'dark'>;
    setTheme: (theme: 'light' | 'dark') => Promise<void>;
    onThemeChange: (callback: (theme: 'light' | 'dark') => void) => () => void;
  };
}

export interface SearchFilters {
  conversationId?: string;
  dateFrom?: string;
  dateTo?: string;
  sender?: string;
  hasAttachment?: boolean;
  attachmentType?: string;
}

export interface MediaFilter {
  type?: 'image' | 'video' | 'audio' | 'document';
  conversationId?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface BackupProgress {
  jobId: string;
  status: ImportJob['status'];
  phase: 'decrypting' | 'reading' | 'importing_chats' | 'importing_media' | 'done';
  processed: number;
  total: number;
  imported_messages: number;
  imported_media: number;
  imported_chats: number;
  skipped: number;
  warnings: string[];
  errors: string[];
}
