import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { env } from '../config/env.js';
import { ValidationError } from '../utils/errors.js';

const uploadRoot = path.resolve(env.upload.dir);
if (!fs.existsSync(uploadRoot)) {
  fs.mkdirSync(uploadRoot, { recursive: true });
}

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
  'text/plain',
]);

const ALLOWED_EXTENSIONS = new Set([
  '.pdf',
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.csv',
  '.txt',
]);

const storage = multer.diskStorage({
  destination(_req, _file, cb) {
    cb(null, uploadRoot);
  },
  filename(_req, file, cb) {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const safeExt = ALLOWED_EXTENSIONS.has(ext) ? ext : '';
    cb(null, `${uuidv4()}${safeExt}`);
  },
});

function fileFilter(_req, file, cb) {
  const ext = path.extname(file.originalname || '').toLowerCase();
  if (!ALLOWED_MIME_TYPES.has(file.mimetype) || !ALLOWED_EXTENSIONS.has(ext)) {
    return cb(
      new ValidationError(
        `Unsupported file type (${file.originalname}). Allowed formats: PDF, JPG, PNG, WEBP, DOC, DOCX, XLS, XLSX, CSV, TXT.`
      ),
      false
    );
  }
  return cb(null, true);
}

export const vaultUpload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: env.upload.maxFileSizeMb * 1024 * 1024,
  },
});
