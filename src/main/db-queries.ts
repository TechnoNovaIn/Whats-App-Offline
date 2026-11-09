import { getDb } from './database';
import type {
  Conversation, Message, Attachment, ImportJob, LocalEntry,
  SearchResult, SearchFilters, ArchiveStats, MediaFilter,
} from '../shared/types';

export function getConversations(filter?: { source_type?: string }): Conversation[] {
  const db = getDb();
  let sql = 'SELECT * FROM conversations';
  const params: string[] = [];

  if (filter?.source_type) {
    sql += ' WHERE source_type = ?';
    params.push(filter.source_type);
  }

  sql += ' ORDER BY last_message_time DESC NULLS LAST, updated_at DESC';
  return db.prepare(sql).all(...params) as Conversation[];
}

export function getMessages(conversationId: string, limit = 100, offset = 0): Message[] {
  const db = getDb();
  return db.prepare(
    `SELECT * FROM messages WHERE conversation_id = ?
     ORDER BY timestamp ASC LIMIT ? OFFSET ?`
  ).all(conversationId, limit, offset) as Message[];
}

export function getMessageCount(conversationId: string): number {
  const db = getDb();
  const row = db.prepare(
    'SELECT COUNT(*) as count FROM messages WHERE conversation_id = ?'
  ).get(conversationId) as { count: number };
  return row.count;
}

export function getAttachments(conversationId?: string): Attachment[] {
  const db = getDb();
  if (conversationId) {
    return db.prepare(
      'SELECT * FROM attachments WHERE conversation_id = ? ORDER BY created_at DESC'
    ).all(conversationId) as Attachment[];
  }
  return db.prepare('SELECT * FROM attachments ORDER BY created_at DESC').all() as Attachment[];
}

export function getAttachment(attachmentId: string): Attachment | null {
  const db = getDb();
  return (db.prepare('SELECT * FROM attachments WHERE attachment_id = ?').get(attachmentId) as Attachment) || null;
}

export function searchMessages(query: string, filters?: SearchFilters): SearchResult[] {
  const db = getDb();
  let sql = `
    SELECT m.*, c.display_name, c.conversation_type, c.source_type,
           snippet(messages_fts, 0, '<mark>', '</mark>', '...', 40) as highlight
    FROM messages_fts
    JOIN messages m ON m.rowid = messages_fts.rowid
    JOIN conversations c ON c.conversation_id = m.conversation_id
    WHERE messages_fts MATCH ?
  `;
  const params: (string | number)[] = [query];

  if (filters?.conversationId) {
    sql += ' AND m.conversation_id = ?';
    params.push(filters.conversationId);
  }
  if (filters?.dateFrom) {
    sql += ' AND m.timestamp >= ?';
    params.push(filters.dateFrom);
  }
  if (filters?.dateTo) {
    sql += ' AND m.timestamp <= ?';
    params.push(filters.dateTo);
  }
  if (filters?.sender) {
    sql += ' AND m.sender_label = ?';
    params.push(filters.sender);
  }
  if (filters?.hasAttachment) {
    sql += ' AND m.message_type != ?';
    params.push('text');
  }

  sql += ' ORDER BY rank LIMIT 200';

  const rows = db.prepare(sql).all(...params) as (Message & {
    display_name: string; conversation_type: string; source_type: string; highlight: string;
  })[];

  return rows.map(row => ({
    message: {
      message_id: row.message_id,
      conversation_id: row.conversation_id,
      sender_label: row.sender_label,
      timestamp: row.timestamp,
      message_type: row.message_type as Message['message_type'],
      text_content: row.text_content,
      direction: row.direction as Message['direction'],
      source_reference: row.source_reference,
      is_local: !!row.is_local,
    },
    conversation: {
      conversation_id: row.conversation_id,
      display_name: row.display_name,
      conversation_type: row.conversation_type as Conversation['conversation_type'],
      source_type: row.source_type as Conversation['source_type'],
    } as Conversation,
    highlight: row.highlight,
  }));
}

export function getStats(): ArchiveStats {
  const db = getDb();
  const conversations = (db.prepare('SELECT COUNT(*) as c FROM conversations WHERE source_type = ?').get('imported') as { c: number }).c;
  const messages = (db.prepare('SELECT COUNT(*) as c FROM messages WHERE is_local = 0').get() as { c: number }).c;
  const media = (db.prepare('SELECT COUNT(*) as c FROM attachments').get() as { c: number }).c;
  const localConversations = (db.prepare('SELECT COUNT(*) as c FROM conversations WHERE source_type = ?').get('local') as { c: number }).c;
  const lastImport = db.prepare('SELECT completed_at FROM import_jobs WHERE status = ? ORDER BY completed_at DESC LIMIT 1').get('completed') as { completed_at: string } | undefined;

  return {
    total_conversations: conversations,
    total_messages: messages,
    total_media: media,
    total_local_conversations: localConversations,
    archive_size_bytes: 0,
    last_import: lastImport?.completed_at,
  };
}

export function getImportJobs(): ImportJob[] {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM import_jobs ORDER BY started_at DESC').all() as (Omit<ImportJob, 'warnings' | 'errors'> & { warnings: string; errors: string })[];
  return rows.map(row => ({
    ...row,
    warnings: JSON.parse(row.warnings),
    errors: JSON.parse(row.errors),
  }));
}

export function getAllMedia(filter?: MediaFilter): Attachment[] {
  const db = getDb();
  let sql = 'SELECT a.* FROM attachments a';
  const conditions: string[] = [];
  const params: string[] = [];

  if (filter?.type) {
    const prefix = filter.type === 'image' ? 'image/' :
                   filter.type === 'video' ? 'video/' :
                   filter.type === 'audio' ? 'audio/' : 'application/';
    conditions.push('a.mime_type LIKE ?');
    params.push(prefix + '%');
  }
  if (filter?.conversationId) {
    conditions.push('a.conversation_id = ?');
    params.push(filter.conversationId);
  }

  if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
  sql += ' ORDER BY a.created_at DESC';

  return db.prepare(sql).all(...params) as Attachment[];
}

export function createLocalConversation(id: string, title: string): Conversation {
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO conversations (conversation_id, source_type, display_name, conversation_type, created_at, updated_at, message_count, unread_count)
    VALUES (?, 'local', ?, 'individual', ?, ?, 0, 0)
  `).run(id, title, now, now);

  return db.prepare('SELECT * FROM conversations WHERE conversation_id = ?').get(id) as Conversation;
}

export function updateLocalConversation(id: string, title: string): void {
  const db = getDb();
  db.prepare("UPDATE conversations SET display_name = ?, updated_at = datetime('now') WHERE conversation_id = ? AND source_type = ?")
    .run(title, id, 'local');
}

export function deleteLocalConversation(id: string): void {
  const db = getDb();
  db.prepare('DELETE FROM conversations WHERE conversation_id = ? AND source_type = ?').run(id, 'local');
}

export function addLocalEntry(id: string, conversationId: string, entryType: string, content: string | null, attachmentId?: string): LocalEntry {
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO local_entries (entry_id, conversation_id, entry_type, text_content, created_at, updated_at, attachment_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, conversationId, entryType, content, now, now, attachmentId || null);

  db.prepare(`
    UPDATE conversations SET message_count = message_count + 1, last_message_preview = ?, last_message_time = ?, updated_at = ?
    WHERE conversation_id = ?
  `).run(content?.substring(0, 80) || '[Attachment]', now, now, conversationId);

  return db.prepare('SELECT * FROM local_entries WHERE entry_id = ?').get(id) as LocalEntry;
}

export function updateLocalEntry(entryId: string, content: string): void {
  const db = getDb();
  db.prepare("UPDATE local_entries SET text_content = ?, updated_at = datetime('now') WHERE entry_id = ?").run(content, entryId);
}

export function deleteLocalEntry(entryId: string): void {
  const db = getDb();
  const entry = db.prepare('SELECT conversation_id FROM local_entries WHERE entry_id = ?').get(entryId) as { conversation_id: string } | undefined;
  db.prepare('DELETE FROM local_entries WHERE entry_id = ?').run(entryId);
  if (entry) {
    db.prepare("UPDATE conversations SET message_count = MAX(0, message_count - 1), updated_at = datetime('now') WHERE conversation_id = ?")
      .run(entry.conversation_id);
  }
}

export function getLocalEntries(conversationId: string): LocalEntry[] {
  const db = getDb();
  return db.prepare('SELECT * FROM local_entries WHERE conversation_id = ? ORDER BY created_at ASC').all(conversationId) as LocalEntry[];
}
