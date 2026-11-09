export const APP_NAME = 'WhatsApp Offline Archive';
export const DB_FILENAME = 'archive.db';
export const MEDIA_DIR = 'media';
export const THUMBNAILS_DIR = 'thumbnails';
export const BACKUP_DIR = 'backups';
export const DEFAULT_PAGE_SIZE = 50;
export const SEARCH_DEBOUNCE_MS = 300;
export const MAX_PREVIEW_LENGTH = 80;

export const SUPPORTED_IMAGE_TYPES = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'];
export const SUPPORTED_VIDEO_TYPES = ['.mp4', '.avi', '.mkv', '.mov', '.3gp', '.webm'];
export const SUPPORTED_AUDIO_TYPES = ['.mp3', '.ogg', '.opus', '.m4a', '.aac', '.wav', '.amr'];
export const SUPPORTED_DOCUMENT_TYPES = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.csv'];

export const MIME_MAP: Record<string, string> = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp',
  '.mp4': 'video/mp4', '.avi': 'video/x-msvideo', '.mkv': 'video/x-matroska',
  '.mov': 'video/quicktime', '.3gp': 'video/3gpp', '.webm': 'video/webm',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.opus': 'audio/opus',
  '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.wav': 'audio/wav', '.amr': 'audio/amr',
  '.pdf': 'application/pdf', '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.txt': 'text/plain', '.csv': 'text/csv',
};
