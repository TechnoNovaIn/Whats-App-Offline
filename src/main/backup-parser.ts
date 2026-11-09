import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { v4 as uuid } from 'uuid';
import { getDb } from './database';
import { MIME_MAP, MEDIA_DIR } from '../shared/constants';
import type { ImportJob } from '../shared/types';
import { decryptCrypt14, decryptCrypt15, detectEncryptionType } from './decryptor';

export interface BackupImportOptions {
  dbPath: string;
  mediaPath?: string;
  keyPath?: string;
  backupKey?: string;
  archivePath: string;
  onProgress: (progress: BackupProgress) => void;
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

let cancelledJobs = new Set<string>();

export function cancelBackupImport(jobId: string): void {
  cancelledJobs.add(jobId);
}

export function importFullBackup(options: BackupImportOptions): string {
  const { dbPath, mediaPath, keyPath, backupKey, archivePath, onProgress } = options;
  const appDb = getDb();
  const jobId = uuid();

  const progress: BackupProgress = {
    jobId,
    status: 'running',
    phase: 'reading',
    processed: 0,
    total: 0,
    imported_messages: 0,
    imported_media: 0,
    imported_chats: 0,
    skipped: 0,
    warnings: [],
    errors: [],
  };

  appDb.prepare(`
    INSERT INTO import_jobs (job_id, source_path, status, total_files)
    VALUES (?, ?, 'running', 0)
  `).run(jobId, dbPath);

  let actualDbPath = dbPath;

  // Step 1: Decrypt if needed
  const encType = detectEncryptionType(dbPath);
  if (encType === 'crypt14' || encType === 'crypt15') {
    progress.phase = 'decrypting';
    onProgress({ ...progress });

    const decryptedPath = path.join(archivePath, 'msgstore_decrypted.db');

    try {
      if (encType === 'crypt14') {
        const key = keyPath || backupKey;
        if (!key) throw new Error('A key file or 64-character hex key is required for crypt14 backups.');
        decryptCrypt14(dbPath, key, decryptedPath);
      } else {
        const key = backupKey || keyPath;
        if (!key) throw new Error('Backup key or key file required for crypt15. Find the 64-digit key in WhatsApp > Settings > Chats > Chat Backup.');
        decryptCrypt15(dbPath, key, decryptedPath);
      }
      actualDbPath = decryptedPath;
    } catch (err: any) {
      progress.status = 'failed';
      progress.errors.push(`Decryption failed: ${err.message}`);
      finishJob(appDb, jobId, progress);
      onProgress({ ...progress });
      return jobId;
    }
  } else if (encType === 'unknown') {
    progress.status = 'failed';
    progress.errors.push('Unrecognized database format. Expected msgstore.db, msgstore.db.crypt14, or msgstore.db.crypt15');
    finishJob(appDb, jobId, progress);
    onProgress({ ...progress });
    return jobId;
  }

  // Step 2: Open WhatsApp database
  let waDb: Database.Database;
  try {
    waDb = new Database(actualDbPath, { readonly: true });
  } catch (err: any) {
    progress.status = 'failed';
    progress.errors.push(`Cannot open database: ${err.message}`);
    finishJob(appDb, jobId, progress);
    onProgress({ ...progress });
    return jobId;
  }

  try {
    // Detect schema version
    const tables = waDb.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[];
    const tableNames = tables.map(t => t.name);

    const hasNewSchema = tableNames.includes('message') && tableNames.includes('chat');
    const hasOldSchema = tableNames.includes('messages') && tableNames.includes('chat_list');

    if (!hasNewSchema && !hasOldSchema) {
      progress.status = 'failed';
      progress.errors.push('Database does not contain expected WhatsApp tables. Tables found: ' + tableNames.slice(0, 10).join(', '));
      finishJob(appDb, jobId, progress);
      onProgress({ ...progress });
      return jobId;
    }

    progress.phase = 'reading';
    onProgress({ ...progress });

    if (hasNewSchema) {
      importNewSchema(waDb, appDb, mediaPath, archivePath, jobId, progress, onProgress);
    } else {
      importOldSchema(waDb, appDb, mediaPath, archivePath, jobId, progress, onProgress);
    }
  } catch (err: any) {
    progress.status = 'failed';
    progress.errors.push(`Import error: ${err.message}`);
  } finally {
    waDb.close();
  }

  if (progress.status === 'running') progress.status = 'completed';
  progress.phase = 'done';
  finishJob(appDb, jobId, progress);
  onProgress({ ...progress });
  return jobId;
}

function importNewSchema(
  waDb: Database.Database,
  appDb: Database.Database,
  mediaPath: string | undefined,
  archivePath: string,
  jobId: string,
  progress: BackupProgress,
  onProgress: (p: BackupProgress) => void
) {
  // Read chats with JID info
  const chats = waDb.prepare(`
    SELECT c._id as chat_id, c.subject, c.created_timestamp,
           j.raw_string as jid, j.user as phone,
           j.server
    FROM chat c
    LEFT JOIN jid j ON c.jid_row_id = j._id
    WHERE c.jid_row_id > 0
    ORDER BY c._id
  `).all() as {
    chat_id: number; subject: string | null; created_timestamp: number;
    jid: string; phone: string; server: string;
  }[];

  progress.total = chats.length;
  progress.phase = 'importing_chats';
  onProgress({ ...progress });

  const insertConv = appDb.prepare(`
    INSERT OR IGNORE INTO conversations
    (conversation_id, source_type, display_name, conversation_type, created_at, updated_at, import_job_id, message_count, unread_count)
    VALUES (?, 'imported', ?, ?, ?, datetime('now'), ?, 0, 0)
  `);

  const insertMsg = appDb.prepare(`
    INSERT INTO messages
    (message_id, conversation_id, sender_label, timestamp, message_type, text_content, direction, source_reference, is_local)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
  `);

  const insertAtt = appDb.prepare(`
    INSERT INTO attachments
    (attachment_id, message_id, conversation_id, relative_path, original_name, mime_type, size_bytes, availability_status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `);

  const updateConvMeta = appDb.prepare(`
    UPDATE conversations SET message_count = ?, last_message_preview = ?, last_message_time = ?, updated_at = datetime('now')
    WHERE conversation_id = ?
  `);

  const insertContact = appDb.prepare(`
    INSERT OR IGNORE INTO contacts (contact_id, display_name, phone_or_identifier, source_reference)
    VALUES (?, ?, ?, ?)
  `);

  const mediaDir = path.join(archivePath, MEDIA_DIR);
  fs.mkdirSync(mediaDir, { recursive: true });

  // Build a map of JID -> display name from wa_contacts if available
  const contactNames = new Map<string, string>();
  try {
    const contacts = waDb.prepare(`
      SELECT jid, display_name, wa_name, given_name, family_name
      FROM wa_contacts WHERE jid IS NOT NULL
    `).all() as { jid: string; display_name: string | null; wa_name: string | null; given_name: string | null; family_name: string | null }[];

    for (const c of contacts) {
      const name = c.display_name || c.wa_name || [c.given_name, c.family_name].filter(Boolean).join(' ') || null;
      if (name) contactNames.set(c.jid, name);
    }
  } catch {
    // wa_contacts may not exist in all versions
  }

  for (const chat of chats) {
    if (cancelledJobs.has(jobId)) { progress.status = 'cancelled'; break; }

    const convId = uuid();
    const isGroup = chat.server === 'g.us' || !!chat.subject;
    const displayName = chat.subject || contactNames.get(chat.jid) || formatPhone(chat.phone) || chat.jid || 'Unknown';
    const convType = isGroup ? 'group' : 'individual';
    const createdAt = chat.created_timestamp
      ? new Date(chat.created_timestamp).toISOString()
      : new Date().toISOString();

    insertConv.run(convId, displayName, convType, createdAt, jobId);

    if (!isGroup && chat.phone) {
      insertContact.run(uuid(), displayName, chat.phone, chat.jid);
    }

    // Import messages for this chat
    let messages;
    try {
      messages = waDb.prepare(`
        SELECT m._id, m.from_me, m.key_id, m.timestamp, m.data as text_content,
               m.message_type, m.text_data,
               j.raw_string as sender_jid, j.user as sender_phone
        FROM message m
        LEFT JOIN jid j ON m.sender_jid_row_id = j._id
        WHERE m.chat_row_id = ?
        ORDER BY m.timestamp ASC
      `).all(chat.chat_id) as {
        _id: number; from_me: number; key_id: string; timestamp: number;
        text_content: string | null; message_type: number; text_data: string | null;
        sender_jid: string | null; sender_phone: string | null;
      }[];
    } catch {
      // Fallback for slightly different schemas
      try {
        messages = waDb.prepare(`
          SELECT m._id, m.from_me, m.key_id, m.timestamp,
                 m.data as text_content, m.message_type,
                 NULL as text_data, NULL as sender_jid, NULL as sender_phone
          FROM message m
          WHERE m.chat_row_id = ?
          ORDER BY m.timestamp ASC
        `).all(chat.chat_id) as any[];
      } catch (err: any) {
        progress.warnings.push(`Could not read messages for "${displayName}": ${err.message}`);
        progress.processed++;
        onProgress({ ...progress });
        continue;
      }
    }

    const batchInsert = appDb.transaction(() => {
      let msgCount = 0;
      let lastPreview = '';
      let lastTime = '';

      for (const msg of messages) {
        if (cancelledJobs.has(jobId)) break;

        const msgId = uuid();
        const ts = msg.timestamp
          ? new Date(msg.timestamp < 1e12 ? msg.timestamp * 1000 : msg.timestamp).toISOString()
          : new Date().toISOString();
        const direction = msg.from_me ? 'outgoing' : 'incoming';
        const msgType = mapMessageType(msg.message_type);
        const textContent = msg.text_content || msg.text_data || null;

        let senderLabel: string;
        if (msg.from_me) {
          senderLabel = 'You';
        } else if (isGroup) {
          senderLabel = contactNames.get(msg.sender_jid || '') || formatPhone(msg.sender_phone) || 'Unknown';
        } else {
          senderLabel = displayName;
        }

        insertMsg.run(msgId, convId, senderLabel, ts, msgType, textContent, direction, msg.key_id);
        msgCount++;

        if (textContent) {
          lastPreview = textContent.substring(0, 80);
        } else if (msgType !== 'text') {
          lastPreview = `[${msgType}]`;
        }
        lastTime = ts;
        progress.imported_messages++;

        // Try to find associated media
        if (msgType !== 'text' && msgType !== 'system') {
          try {
            const mediaInfo = waDb.prepare(`
              SELECT file_path, file_size, mime_type, media_name
              FROM message_media WHERE message_row_id = ?
            `).get(msg._id) as {
              file_path: string | null; file_size: number;
              mime_type: string | null; media_name: string | null;
            } | undefined;

            if (mediaInfo) {
              const attId = uuid();
              let availability: 'available' | 'missing' = 'missing';
              let relativePath = '';
              let fileSize = mediaInfo.file_size || 0;
              const originalName = mediaInfo.media_name || path.basename(mediaInfo.file_path || 'unknown');
              const mimeType = mediaInfo.mime_type || 'application/octet-stream';

              if (mediaInfo.file_path && mediaPath) {
                const possiblePaths = findMediaFile(mediaInfo.file_path, mediaPath);
                if (possiblePaths) {
                  const destName = `${attId}_${originalName}`;
                  const destPath = path.join(mediaDir, destName);
                  try {
                    fs.copyFileSync(possiblePaths, destPath);
                    relativePath = path.join(MEDIA_DIR, destName);
                    fileSize = fs.statSync(destPath).size;
                    availability = 'available';
                    progress.imported_media++;
                  } catch {
                    relativePath = path.join(MEDIA_DIR, destName);
                  }
                } else {
                  relativePath = mediaInfo.file_path;
                }
              } else {
                relativePath = mediaInfo.file_path || 'unknown';
              }

              insertAtt.run(attId, msgId, convId, relativePath, originalName, mimeType, fileSize, availability);
            }
          } catch {
            // message_media table might not exist or have different schema
          }
        }
      }

      updateConvMeta.run(msgCount, lastPreview, lastTime, convId);
    });

    batchInsert();
    progress.imported_chats++;
    progress.processed++;

    if (progress.processed % 5 === 0 || progress.processed === progress.total) {
      onProgress({ ...progress });
    }
  }

  // Step: Import remaining media files not linked to messages
  if (mediaPath && fs.existsSync(mediaPath)) {
    progress.phase = 'importing_media';
    onProgress({ ...progress });
    importMediaFolder(mediaPath, archivePath, progress);
  }
}

function importOldSchema(
  waDb: Database.Database,
  appDb: Database.Database,
  mediaPath: string | undefined,
  archivePath: string,
  jobId: string,
  progress: BackupProgress,
  onProgress: (p: BackupProgress) => void
) {
  const chats = waDb.prepare(`
    SELECT key_remote_jid as jid, subject
    FROM chat_list
    ORDER BY sort_timestamp DESC
  `).all() as { jid: string; subject: string | null }[];

  progress.total = chats.length;
  progress.phase = 'importing_chats';
  onProgress({ ...progress });

  const insertConv = appDb.prepare(`
    INSERT OR IGNORE INTO conversations
    (conversation_id, source_type, display_name, conversation_type, created_at, updated_at, import_job_id, message_count, unread_count)
    VALUES (?, 'imported', ?, ?, datetime('now'), datetime('now'), ?, 0, 0)
  `);

  const insertMsg = appDb.prepare(`
    INSERT INTO messages
    (message_id, conversation_id, sender_label, timestamp, message_type, text_content, direction, source_reference, is_local)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
  `);

  const insertAtt = appDb.prepare(`
    INSERT INTO attachments
    (attachment_id, message_id, conversation_id, relative_path, original_name, mime_type, size_bytes, availability_status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `);

  const updateConvMeta = appDb.prepare(`
    UPDATE conversations SET message_count = ?, last_message_preview = ?, last_message_time = ?, updated_at = datetime('now')
    WHERE conversation_id = ?
  `);

  const mediaDir = path.join(archivePath, MEDIA_DIR);
  fs.mkdirSync(mediaDir, { recursive: true });

  // Contact names from wa_contacts
  const contactNames = new Map<string, string>();
  try {
    const contacts = waDb.prepare(`SELECT jid, display_name FROM wa_contacts WHERE jid IS NOT NULL`).all() as { jid: string; display_name: string }[];
    for (const c of contacts) {
      if (c.display_name) contactNames.set(c.jid, c.display_name);
    }
  } catch { /* ignore */ }

  for (const chat of chats) {
    if (cancelledJobs.has(jobId)) { progress.status = 'cancelled'; break; }

    const convId = uuid();
    const isGroup = chat.jid.endsWith('@g.us');
    const phone = chat.jid.replace(/@.*/, '');
    const displayName = chat.subject || contactNames.get(chat.jid) || formatPhone(phone) || chat.jid;

    insertConv.run(convId, displayName, isGroup ? 'group' : 'individual', jobId);

    const messages = waDb.prepare(`
      SELECT _id, key_from_me, key_id, timestamp, data, media_mime_type,
             media_size, media_name, media_url, remote_resource
      FROM messages
      WHERE key_remote_jid = ?
      ORDER BY timestamp ASC
    `).all(chat.jid) as {
      _id: number; key_from_me: number; key_id: string; timestamp: number;
      data: string | null; media_mime_type: string | null;
      media_size: number; media_name: string | null; media_url: string | null;
      remote_resource: string | null;
    }[];

    const batchInsert = appDb.transaction(() => {
      let msgCount = 0;
      let lastPreview = '';
      let lastTime = '';

      for (const msg of messages) {
        if (cancelledJobs.has(jobId)) break;

        const msgId = uuid();
        const ts = new Date(msg.timestamp < 1e12 ? msg.timestamp * 1000 : msg.timestamp).toISOString();
        const direction = msg.key_from_me ? 'outgoing' : 'incoming';
        const msgType = msg.media_mime_type ? mapMimeToType(msg.media_mime_type) : 'text';

        let senderLabel: string;
        if (msg.key_from_me) {
          senderLabel = 'You';
        } else if (isGroup && msg.remote_resource) {
          senderLabel = contactNames.get(msg.remote_resource) || formatPhone(msg.remote_resource.replace(/@.*/, ''));
        } else {
          senderLabel = displayName;
        }

        insertMsg.run(msgId, convId, senderLabel, ts, msgType, msg.data, direction, msg.key_id);
        msgCount++;

        if (msg.data) lastPreview = msg.data.substring(0, 80);
        else if (msgType !== 'text') lastPreview = `[${msgType}]`;
        lastTime = ts;
        progress.imported_messages++;

        if (msg.media_name || msg.media_mime_type) {
          const attId = uuid();
          const originalName = msg.media_name || `media_${msg._id}`;
          const mimeType = msg.media_mime_type || 'application/octet-stream';
          let availability: 'available' | 'missing' = 'missing';
          let relativePath = path.join(MEDIA_DIR, originalName);

          if (mediaPath && msg.media_name) {
            const found = findMediaFile(msg.media_name, mediaPath);
            if (found) {
              const destName = `${attId}_${originalName}`;
              const destPath = path.join(mediaDir, destName);
              try {
                fs.copyFileSync(found, destPath);
                relativePath = path.join(MEDIA_DIR, destName);
                availability = 'available';
                progress.imported_media++;
              } catch { /* skip */ }
            }
          }

          insertAtt.run(attId, msgId, convId, relativePath, originalName, mimeType, msg.media_size || 0, availability);
        }
      }

      updateConvMeta.run(msgCount, lastPreview, lastTime, convId);
    });

    batchInsert();
    progress.imported_chats++;
    progress.processed++;

    if (progress.processed % 5 === 0 || progress.processed === progress.total) {
      onProgress({ ...progress });
    }
  }

  if (mediaPath && fs.existsSync(mediaPath)) {
    progress.phase = 'importing_media';
    onProgress({ ...progress });
    importMediaFolder(mediaPath, archivePath, progress);
  }
}

function findMediaFile(fileName: string, mediaRoot: string): string | null {
  // Direct match
  const directPath = path.join(mediaRoot, fileName);
  if (fs.existsSync(directPath)) return directPath;

  // Try just the basename
  const baseName = path.basename(fileName);
  const directBasePath = path.join(mediaRoot, baseName);
  if (fs.existsSync(directBasePath)) return directBasePath;

  // Search in WhatsApp Media subdirectories
  const subdirs = [
    'WhatsApp Images', 'WhatsApp Video', 'WhatsApp Audio',
    'WhatsApp Voice Notes', 'WhatsApp Documents', 'WhatsApp Stickers',
    'WhatsApp Animated Gifs', 'WhatsApp Images/Sent', 'WhatsApp Video/Sent',
  ];

  for (const sub of subdirs) {
    const subPath = path.join(mediaRoot, sub, baseName);
    if (fs.existsSync(subPath)) return subPath;
  }

  // Recursive search (limited depth)
  return searchFile(mediaRoot, baseName, 3);
}

function searchFile(dir: string, fileName: string, maxDepth: number): string | null {
  if (maxDepth <= 0) return null;
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isFile() && entry.name === fileName) return fullPath;
      if (entry.isDirectory() && !entry.name.startsWith('.')) {
        const found = searchFile(fullPath, fileName, maxDepth - 1);
        if (found) return found;
      }
    }
  } catch { /* inaccessible */ }
  return null;
}

function importMediaFolder(mediaRoot: string, archivePath: string, progress: BackupProgress): void {
  const mediaDir = path.join(archivePath, MEDIA_DIR);
  const subdirs = [
    'WhatsApp Images', 'WhatsApp Video', 'WhatsApp Audio',
    'WhatsApp Voice Notes', 'WhatsApp Documents', 'WhatsApp Stickers',
  ];

  for (const sub of subdirs) {
    const subPath = path.join(mediaRoot, sub);
    if (!fs.existsSync(subPath)) continue;

    try {
      const files = fs.readdirSync(subPath);
      for (const file of files) {
        const srcPath = path.join(subPath, file);
        try {
          const stat = fs.statSync(srcPath);
          if (!stat.isFile()) continue;
          const destPath = path.join(mediaDir, file);
          if (!fs.existsSync(destPath)) {
            fs.copyFileSync(srcPath, destPath);
          }
        } catch { /* skip */ }
      }
    } catch { /* inaccessible */ }
  }

  // Also copy Sent subfolders
  for (const sub of ['WhatsApp Images/Sent', 'WhatsApp Video/Sent']) {
    const subPath = path.join(mediaRoot, sub);
    if (!fs.existsSync(subPath)) continue;
    try {
      const files = fs.readdirSync(subPath);
      for (const file of files) {
        const srcPath = path.join(subPath, file);
        try {
          if (fs.statSync(srcPath).isFile()) {
            const destPath = path.join(mediaDir, file);
            if (!fs.existsSync(destPath)) fs.copyFileSync(srcPath, destPath);
          }
        } catch { /* skip */ }
      }
    } catch { /* skip */ }
  }
}

function mapMessageType(waType: number): string {
  switch (waType) {
    case 0: return 'text';
    case 1: return 'image';
    case 2: return 'audio';
    case 3: return 'video';
    case 4: return 'text';  // vcard/contact
    case 5: return 'text';  // location
    case 7: return 'system';
    case 8: return 'audio'; // voice note
    case 9: return 'document';
    case 13: return 'image'; // gif
    case 15: return 'sticker';
    case 16: return 'text';  // live location
    default: return 'text';
  }
}

function mapMimeToType(mime: string): string {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.startsWith('application/')) return 'document';
  return 'document';
}

function formatPhone(phone: string | null): string {
  if (!phone) return 'Unknown';
  if (phone.length > 10) {
    return '+' + phone.substring(0, phone.length - 10) + ' ' + phone.substring(phone.length - 10);
  }
  return phone;
}

function finishJob(appDb: Database.Database, jobId: string, progress: BackupProgress): void {
  cancelledJobs.delete(jobId);
  appDb.prepare(`
    UPDATE import_jobs SET status = ?, completed_at = datetime('now'),
    processed_files = ?, imported_messages = ?, imported_media = ?,
    skipped_items = ?, warnings = ?, errors = ?
    WHERE job_id = ?
  `).run(
    progress.status, progress.processed, progress.imported_messages,
    progress.imported_media, progress.skipped,
    JSON.stringify(progress.warnings), JSON.stringify(progress.errors), jobId
  );
}
