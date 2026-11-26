import fs from 'node:fs';
import path from 'node:path';
import { env } from './env.js';

// আপলোড ডিরেক্টরি রিজলভ করা হচ্ছে
export const UPLOAD_ROOT = path.resolve(process.cwd(), env.upload?.dir || 'uploads');

// সার্ভার স্টার্ট হওয়ার সময় ডিরেক্টরিটি আছে কি না তা চেক করা হচ্ছে, না থাকলে তৈরি করা হবে
if (!fs.existsSync(UPLOAD_ROOT)) {
  try {
    fs.mkdirSync(UPLOAD_ROOT, { recursive: true });
    console.log(`✔ Upload directory created at: ${UPLOAD_ROOT}`);
  } catch (err) {
    console.error('❌ Failed to create upload directory:', err);
  }
}
