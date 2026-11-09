import fs from 'fs';
import crypto from 'crypto';

export function decryptCrypt14(encryptedPath: string, keyInput: string | undefined, outputPath: string): void {
  const encData = fs.readFileSync(encryptedPath);

  const headerSize = 67;
  if (encData.length < headerSize + 16) {
    throw new Error('Encrypted file is too small to be a valid crypt14 backup.');
  }

  let aesKey: Buffer;

  if (keyInput && fs.existsSync(keyInput) && fs.statSync(keyInput).isFile()) {
    const keyData = fs.readFileSync(keyInput);
    if (keyData.length >= 158) {
      aesKey = keyData.subarray(126, 158);
    } else if (keyData.length >= 62) {
      aesKey = keyData.subarray(30, 62);
    } else {
      throw new Error('Invalid key file. File is too small.');
    }
  } else if (keyInput) {
    const hexKey = keyInput.replace(/\s/g, '');
    if (hexKey.length !== 64) {
      throw new Error('Key must be 64 hex characters (32 bytes).');
    }
    aesKey = Buffer.from(hexKey, 'hex');
  } else {
    throw new Error(
      'A decryption key is required for crypt14 files.\n\n' +
      'How to get your key:\n' +
      '1. Key file: Connect phone via USB, check Android/media/com.whatsapp/WhatsApp/Databases/ for a "key" or "encrypted_backup.key" file\n' +
      '2. ADB method: Use "WhatsApp Key/DB Extractor" tool (no root needed) — search GitHub\n' +
      '3. If your phone is rooted: /data/data/com.whatsapp/files/key\n' +
      '4. Alternative: Use WhatsApp\'s built-in "Export Chat" to create .txt files instead (no key needed)'
    );
  }

  const iv = encData.subarray(51, 67);
  const encrypted = encData.subarray(headerSize, encData.length - 16);
  const authTag = encData.subarray(encData.length - 16);

  const decipher = crypto.createDecipheriv('aes-256-gcm', aesKey, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);

  try {
    const zlib = require('zlib');
    const decompressed = zlib.inflateSync(decrypted);
    fs.writeFileSync(outputPath, decompressed);
  } catch {
    fs.writeFileSync(outputPath, decrypted);
  }
}

export function decryptCrypt15(encryptedPath: string, keyInput: string, outputPath: string): void {
  const encData = fs.readFileSync(encryptedPath);

  let aesKey: Buffer;

  if (fs.existsSync(keyInput) && fs.statSync(keyInput).isFile()) {
    const keyData = fs.readFileSync(keyInput);
    if (keyData.length >= 131) {
      aesKey = keyData.subarray(99, 131);
    } else {
      throw new Error('Invalid key file for crypt15.');
    }
  } else {
    // 64-character hex backup key from WhatsApp settings
    const hexKey = keyInput.replace(/\s/g, '');
    if (hexKey.length !== 64) {
      throw new Error('Backup key must be 64 hex characters. Find it in WhatsApp > Settings > Chats > Chat Backup > End-to-end encrypted backup.');
    }
    aesKey = Buffer.from(hexKey, 'hex');
  }

  const headerSize = 67;
  if (encData.length < headerSize + 16) {
    throw new Error('Encrypted file is too small to be a valid crypt15 backup.');
  }

  const iv = encData.subarray(51, 67);
  const encrypted = encData.subarray(headerSize, encData.length - 16);
  const authTag = encData.subarray(encData.length - 16);

  const decipher = crypto.createDecipheriv('aes-256-gcm', aesKey, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);

  try {
    const zlib = require('zlib');
    const decompressed = zlib.inflateSync(decrypted);
    fs.writeFileSync(outputPath, decompressed);
  } catch {
    fs.writeFileSync(outputPath, decrypted);
  }
}

export function detectEncryptionType(filePath: string): 'crypt14' | 'crypt15' | 'plain' | 'unknown' {
  if (filePath.endsWith('.crypt14')) return 'crypt14';
  if (filePath.endsWith('.crypt15')) return 'crypt15';
  if (filePath.endsWith('.db')) {
    // Check if it's a valid SQLite file
    const header = Buffer.alloc(16);
    const fd = fs.openSync(filePath, 'r');
    fs.readSync(fd, header, 0, 16, 0);
    fs.closeSync(fd);
    if (header.toString('ascii', 0, 6) === 'SQLite') return 'plain';
  }
  return 'unknown';
}
