import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { DB_FILENAME } from '../shared/constants';

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) throw new Error('Database not initialized');
  return db;
}

export function initDatabase(archivePath: string): void {
  const dbPath = path.join(archivePath, DB_FILENAME);
  fs.mkdirSync(archivePath, { recursive: true });

  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  createTables(db);
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}

function createTables(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      conversation_id TEXT PRIMARY KEY,
      source_type TEXT NOT NULL DEFAULT 'imported' CHECK(source_type IN ('imported', 'local')),
      display_name TEXT NOT NULL,
      conversation_type TEXT NOT NULL DEFAULT 'individual' CHECK(conversation_type IN ('individual', 'group')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      import_job_id TEXT,
      last_message_preview TEXT,
      last_message_time TEXT,
      message_count INTEGER NOT NULL DEFAULT 0,
      unread_count INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS messages (
      message_id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      sender_label TEXT NOT NULL DEFAULT 'Unknown',
      timestamp TEXT NOT NULL,
      message_type TEXT NOT NULL DEFAULT 'text',
      text_content TEXT,
      direction TEXT NOT NULL DEFAULT 'unknown' CHECK(direction IN ('incoming', 'outgoing', 'unknown')),
      source_reference TEXT,
      is_local INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (conversation_id) REFERENCES conversations(conversation_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS attachments (
      attachment_id TEXT PRIMARY KEY,
      message_id TEXT,
      conversation_id TEXT NOT NULL,
      relative_path TEXT NOT NULL,
      original_name TEXT NOT NULL,
      mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
      size_bytes INTEGER NOT NULL DEFAULT 0,
      hash TEXT,
      availability_status TEXT NOT NULL DEFAULT 'available' CHECK(availability_status IN ('available', 'missing', 'unsupported')),
      thumbnail_path TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (message_id) REFERENCES messages(message_id) ON DELETE SET NULL,
      FOREIGN KEY (conversation_id) REFERENCES conversations(conversation_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS contacts (
      contact_id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      phone_or_identifier TEXT,
      avatar_path TEXT,
      source_reference TEXT
    );

    CREATE TABLE IF NOT EXISTS import_jobs (
      job_id TEXT PRIMARY KEY,
      source_path TEXT NOT NULL,
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'running', 'completed', 'cancelled', 'failed')),
      total_files INTEGER NOT NULL DEFAULT 0,
      processed_files INTEGER NOT NULL DEFAULT 0,
      imported_messages INTEGER NOT NULL DEFAULT 0,
      imported_media INTEGER NOT NULL DEFAULT 0,
      skipped_items INTEGER NOT NULL DEFAULT 0,
      warnings TEXT NOT NULL DEFAULT '[]',
      errors TEXT NOT NULL DEFAULT '[]'
    );

    CREATE TABLE IF NOT EXISTS local_entries (
      entry_id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      entry_type TEXT NOT NULL DEFAULT 'text' CHECK(entry_type IN ('text', 'note', 'file')),
      text_content TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      attachment_id TEXT,
      FOREIGN KEY (conversation_id) REFERENCES conversations(conversation_id) ON DELETE CASCADE,
      FOREIGN KEY (attachment_id) REFERENCES attachments(attachment_id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, timestamp);
    CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_label);
    CREATE INDEX IF NOT EXISTS idx_messages_type ON messages(message_type);
    CREATE INDEX IF NOT EXISTS idx_attachments_message ON attachments(message_id);
    CREATE INDEX IF NOT EXISTS idx_attachments_conversation ON attachments(conversation_id);
    CREATE INDEX IF NOT EXISTS idx_attachments_type ON attachments(mime_type);
    CREATE INDEX IF NOT EXISTS idx_conversations_source ON conversations(source_type);
    CREATE INDEX IF NOT EXISTS idx_local_entries_conversation ON local_entries(conversation_id);

    CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
      text_content,
      sender_label,
      content='messages',
      content_rowid='rowid',
      tokenize='porter unicode61'
    );

    CREATE TRIGGER IF NOT EXISTS messages_ai AFTER INSERT ON messages BEGIN
      INSERT INTO messages_fts(rowid, text_content, sender_label)
      VALUES (NEW.rowid, NEW.text_content, NEW.sender_label);
    END;

    CREATE TRIGGER IF NOT EXISTS messages_ad AFTER DELETE ON messages BEGIN
      INSERT INTO messages_fts(messages_fts, rowid, text_content, sender_label)
      VALUES ('delete', OLD.rowid, OLD.text_content, OLD.sender_label);
    END;

    CREATE TRIGGER IF NOT EXISTS messages_au AFTER UPDATE ON messages BEGIN
      INSERT INTO messages_fts(messages_fts, rowid, text_content, sender_label)
      VALUES ('delete', OLD.rowid, OLD.text_content, OLD.sender_label);
      INSERT INTO messages_fts(rowid, text_content, sender_label)
      VALUES (NEW.rowid, NEW.text_content, NEW.sender_label);
    END;
  `);
}
