import fs from 'fs';
import path from 'path';
import { v4 as uuid } from 'uuid';
import { getDb } from './database';
import { MIME_MAP, SUPPORTED_IMAGE_TYPES, SUPPORTED_VIDEO_TYPES, SUPPORTED_AUDIO_TYPES, SUPPORTED_DOCUMENT_TYPES, MEDIA_DIR } from '../shared/constants';
import type { ImportJob, ImportPreview } from '../shared/types';

const WHATSAPP_LINE_REGEX = /^\[?(\d{1,2}\/\d{1,2}\/\d{2,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM|am|pm)?)\]?\s*-?\s*([^:]+?):\s(.+)$/;
const SYSTEM_MSG_REGEX = /^\[?(\d{1,2}\/\d{1,2}\/\d{2,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM|am|pm)?)\]?\s*-?\s*(.+)$/;
const ATTACHMENT_REGEX = /<attached:\s*(.+?)>|([^\s]+\.(jpg|jpeg|png|gif|webp|mp4|avi|mkv|mov|3gp|mp3|ogg|opus|m4a|aac|wav|pdf|doc|docx|xls|xlsx|ppt|pptx))\s*\(file attached\)/i;
const OMITTED_REGEX = /(?:image|video|audio|document|sticker|GIF)\s+omitted/i;

interface ParsedMessage {
  date: string;
  time: string;
  sender: string;
  content: string;
  isSystem: boolean;
  attachmentName: string | null;
  isOmitted: boolean;
}

function parseTimestamp(date: string, time: string): string {
  const parts = date.split('/');
  let day: string, month: string, year: string;

  if (parts.length === 3) {
    if (parseInt(parts[2]) > 31) {
      month = parts[0].padStart(2, '0');
      day = parts[1].padStart(2, '0');
      year = parts[2].length === 2 ? '20' + parts[2] : parts[2];
    } else if (parseInt(parts[0]) > 12) {
      day = parts[0].padStart(2, '0');
      month = parts[1].padStart(2, '0');
      year = parts[2].length === 2 ? '20' + parts[2] : parts[2];
    } else {
      month = parts[0].padStart(2, '0');
      day = parts[1].padStart(2, '0');
      year = parts[2].length === 2 ? '20' + parts[2] : parts[2];
    }
  } else {
    return new Date().toISOString();
  }

  let timeStr = time.trim();
  let hours = 0, minutes = 0, seconds = 0;
  const isPM = /pm/i.test(timeStr);
  const isAM = /am/i.test(timeStr);
  timeStr = timeStr.replace(/\s*(AM|PM|am|pm)/i, '');
  const timeParts = timeStr.split(':');
  hours = parseInt(timeParts[0]);
  minutes = parseInt(timeParts[1]);
  if (timeParts.length > 2) seconds = parseInt(timeParts[2]);

  if (isPM && hours !== 12) hours += 12;
  if (isAM && hours === 12) hours = 0;

  return `${year}-${month}-${day}T${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.000Z`;
}

function parseLine(line: string): ParsedMessage | null {
  const msgMatch = line.match(WHATSAPP_LINE_REGEX);
  if (msgMatch) {
    const content = msgMatch[4];
    const attachmentMatch = content.match(ATTACHMENT_REGEX);
    const isOmitted = OMITTED_REGEX.test(content);

    return {
      date: msgMatch[1],
      time: msgMatch[2],
      sender: msgMatch[3].trim(),
      content,
      isSystem: false,
      attachmentName: attachmentMatch ? (attachmentMatch[1] || attachmentMatch[2]) : null,
      isOmitted,
    };
  }

  const sysMatch = line.match(SYSTEM_MSG_REGEX);
  if (sysMatch) {
    return {
      date: sysMatch[1],
      time: sysMatch[2],
      sender: 'System',
      content: sysMatch[3].trim(),
      isSystem: true,
      attachmentName: null,
      isOmitted: false,
    };
  }

  return null;
}

function detectMessageType(content: string, attachmentName: string | null): string {
  if (!attachmentName) return 'text';
  const ext = path.extname(attachmentName).toLowerCase();
  if (SUPPORTED_IMAGE_TYPES.includes(ext)) return 'image';
  if (SUPPORTED_VIDEO_TYPES.includes(ext)) return 'video';
  if (SUPPORTED_AUDIO_TYPES.includes(ext)) return 'audio';
  if (SUPPORTED_DOCUMENT_TYPES.includes(ext)) return 'document';
  return 'document';
}

export function previewImport(paths: string[]): ImportPreview {
  const preview: ImportPreview = {
    files: [],
    estimated_chats: 0,
    estimated_messages: 0,
    estimated_media: 0,
    total_size: 0,
    warnings: [],
  };

  const chatNames = new Set<string>();

  for (const filePath of paths) {
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      const files = fs.readdirSync(filePath);
      let mediaCount = 0;
      let totalSize = 0;
      for (const f of files) {
        const fPath = path.join(filePath, f);
        try {
          const fStat = fs.statSync(fPath);
          if (fStat.isFile()) {
            totalSize += fStat.size;
            const ext = path.extname(f).toLowerCase();
            if ([...SUPPORTED_IMAGE_TYPES, ...SUPPORTED_VIDEO_TYPES, ...SUPPORTED_AUDIO_TYPES, ...SUPPORTED_DOCUMENT_TYPES].includes(ext)) {
              mediaCount++;
            }
          }
        } catch { /* skip inaccessible */ }
      }
      preview.files.push({ name: path.basename(filePath), type: 'media_folder', size: totalSize });
      preview.estimated_media += mediaCount;
      preview.total_size += totalSize;
    } else if (filePath.endsWith('.txt')) {
      preview.files.push({ name: path.basename(filePath), type: 'chat_export', size: stat.size });
      preview.total_size += stat.size;

      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');
      let msgCount = 0;
      for (const line of lines) {
        const parsed = parseLine(line.trim());
        if (parsed) {
          msgCount++;
          if (!parsed.isSystem) chatNames.add(parsed.sender);
          if (parsed.attachmentName) preview.estimated_media++;
        }
      }
      preview.estimated_messages += msgCount;
      preview.estimated_chats++;
    } else {
      preview.warnings.push(`Unsupported file format: ${path.basename(filePath)}`);
    }
  }

  return preview;
}

export interface ImportProgress {
  jobId: string;
  status: ImportJob['status'];
  processed: number;
  total: number;
  imported_messages: number;
  imported_media: number;
  skipped: number;
  warnings: string[];
  errors: string[];
}

let cancelledJobs = new Set<string>();

export function cancelImport(jobId: string): void {
  cancelledJobs.add(jobId);
}

export function importFiles(
  paths: string[],
  mediaFolder: string | undefined,
  archivePath: string,
  onProgress: (progress: ImportProgress) => void
): string {
  const db = getDb();
  const jobId = uuid();
  const chatFiles = paths.filter(p => p.endsWith('.txt') && fs.statSync(p).isFile());
  const mediaFolders = paths.filter(p => fs.statSync(p).isDirectory());
  if (mediaFolder) mediaFolders.push(mediaFolder);

  const totalFiles = chatFiles.length + mediaFolders.length;

  db.prepare(`
    INSERT INTO import_jobs (job_id, source_path, status, total_files)
    VALUES (?, ?, 'running', ?)
  `).run(jobId, paths.join(';'), totalFiles);

  const progress: ImportProgress = {
    jobId,
    status: 'running',
    processed: 0,
    total: totalFiles,
    imported_messages: 0,
    imported_media: 0,
    skipped: 0,
    warnings: [],
    errors: [],
  };

  const mediaDir = path.join(archivePath, 'media');
  fs.mkdirSync(mediaDir, { recursive: true });

  const insertConversation = db.prepare(`
    INSERT OR IGNORE INTO conversations (conversation_id, source_type, display_name, conversation_type, created_at, updated_at, import_job_id, message_count, unread_count)
    VALUES (?, 'imported', ?, ?, ?, datetime('now'), ?, 0, 0)
  `);

  const insertMessage = db.prepare(`
    INSERT INTO messages (message_id, conversation_id, sender_label, timestamp, message_type, text_content, direction, source_reference, is_local)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
  `);

  const insertAttachment = db.prepare(`
    INSERT INTO attachments (attachment_id, message_id, conversation_id, relative_path, original_name, mime_type, size_bytes, availability_status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `);

  const updateConversationMeta = db.prepare(`
    UPDATE conversations SET message_count = ?, last_message_preview = ?, last_message_time = ?, updated_at = datetime('now')
    WHERE conversation_id = ?
  `);

  const mediaIndex = new Map<string, string>();

  for (const mf of mediaFolders) {
    if (cancelledJobs.has(jobId)) break;
    try {
      const files = fs.readdirSync(mf);
      for (const f of files) {
        const srcPath = path.join(mf, f);
        try {
          const stat = fs.statSync(srcPath);
          if (!stat.isFile()) continue;
          const destName = f;
          const destPath = path.join(mediaDir, destName);
          if (!fs.existsSync(destPath)) {
            fs.copyFileSync(srcPath, destPath);
          }
          mediaIndex.set(f.toLowerCase(), path.join('media', destName));
          progress.imported_media++;
        } catch (err: any) {
          progress.warnings.push(`Could not copy ${f}: ${err.message}`);
        }
      }
      progress.processed++;
      onProgress({ ...progress });
    } catch (err: any) {
      progress.errors.push(`Could not read folder ${mf}: ${err.message}`);
    }
  }

  for (const chatFile of chatFiles) {
    if (cancelledJobs.has(jobId)) break;

    try {
      const content = fs.readFileSync(chatFile, 'utf-8');
      const lines = content.split('\n');
      const chatName = path.basename(chatFile, '.txt').replace(/^WhatsApp Chat with\s*/i, '').replace(/_/g, ' ').trim() || 'Unknown Chat';

      const conversationId = uuid();
      const isGroup = lines.some(l => {
        const p = parseLine(l.trim());
        return p && !p.isSystem;
      });
      const senders = new Set<string>();
      const parsedMessages: ParsedMessage[] = [];

      let currentMessage: ParsedMessage | null = null;
      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) continue;

        const parsed = parseLine(line);
        if (parsed) {
          if (currentMessage) parsedMessages.push(currentMessage);
          currentMessage = parsed;
          if (!parsed.isSystem) senders.add(parsed.sender);
        } else if (currentMessage) {
          currentMessage.content += '\n' + line;
        }
      }
      if (currentMessage) parsedMessages.push(currentMessage);

      const convType = senders.size > 2 ? 'group' : 'individual';
      const firstTimestamp = parsedMessages.length > 0
        ? parseTimestamp(parsedMessages[0].date, parsedMessages[0].time)
        : new Date().toISOString();

      insertConversation.run(conversationId, chatName, convType, firstTimestamp, jobId);

      const insertMany = db.transaction(() => {
        let msgCount = 0;
        let lastPreview = '';
        let lastTime = '';

        for (const msg of parsedMessages) {
          if (cancelledJobs.has(jobId)) break;

          const messageId = uuid();
          const timestamp = parseTimestamp(msg.date, msg.time);
          const msgType = msg.isSystem ? 'system' : detectMessageType(msg.content, msg.attachmentName);
          const direction = msg.isSystem ? 'unknown' : (msg.sender.toLowerCase() === 'you' ? 'outgoing' : 'incoming');

          insertMessage.run(
            messageId, conversationId, msg.sender, timestamp,
            msgType, msg.content, direction, chatFile
          );

          if (msg.attachmentName && !msg.isOmitted) {
            const attachId = uuid();
            const lowerName = msg.attachmentName.toLowerCase();
            const relativePath = mediaIndex.get(lowerName) || path.join('media', msg.attachmentName);
            const ext = path.extname(msg.attachmentName).toLowerCase();
            const mimeType = MIME_MAP[ext] || 'application/octet-stream';
            const fullPath = path.join(archivePath, relativePath);
            const exists = fs.existsSync(fullPath);
            const size = exists ? fs.statSync(fullPath).size : 0;

            insertAttachment.run(
              attachId, messageId, conversationId, relativePath,
              msg.attachmentName, mimeType, size,
              exists ? 'available' : 'missing'
            );
          } else if (msg.isOmitted) {
            progress.skipped++;
          }

          msgCount++;
          lastPreview = (msg.content || '').substring(0, 80);
          lastTime = timestamp;
          progress.imported_messages++;
        }

        updateConversationMeta.run(msgCount, lastPreview, lastTime, conversationId);
      });

      insertMany();
      progress.processed++;
      onProgress({ ...progress });
    } catch (err: any) {
      progress.errors.push(`Failed to parse ${path.basename(chatFile)}: ${err.message}`);
    }
  }

  const finalStatus = cancelledJobs.has(jobId) ? 'cancelled' : 'completed';
  cancelledJobs.delete(jobId);

  db.prepare(`
    UPDATE import_jobs SET status = ?, completed_at = datetime('now'),
    processed_files = ?, imported_messages = ?, imported_media = ?,
    skipped_items = ?, warnings = ?, errors = ?
    WHERE job_id = ?
  `).run(
    finalStatus, progress.processed, progress.imported_messages,
    progress.imported_media, progress.skipped,
    JSON.stringify(progress.warnings), JSON.stringify(progress.errors), jobId
  );

  progress.status = finalStatus as ImportJob['status'];
  onProgress({ ...progress });

  return jobId;
}
