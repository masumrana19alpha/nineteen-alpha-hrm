import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// .env ফাইলটি রুট ডিরেক্টরি থেকে লোড করা হচ্ছে
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',
  port: parseInt(process.env.PORT || '3000', 10),
  host: process.env.HOST || '0.0.0.0',
  corsOrigin: process.env.CORS_ORIGIN || '*',

  db: {
    connectionString: process.env.DATABASE_URL || 'postgresql://bms_user:change_me_strong_password@localhost:5432/nineteen_alpha_bms',
    ssl: process.env.DB_SSL === 'true',
    poolMax: parseInt(process.env.DB_POOL_MAX || '15', 10),
  },

  auth: {
    jwtSecret: process.env.JWT_SECRET || 'dev_secret_replace_in_production_32chars_min',
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '12h',
    bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS || '12', 10),
  },

  upload: {
    dir: process.env.UPLOAD_DIR || 'uploads',
    maxFileSizeMb: parseInt(process.env.MAX_FILE_SIZE_MB || '10', 10),
  },

  biometric: {
    webhookKey: process.env.BIOMETRIC_WEBHOOK_KEY || '',
  },

  company: {
    name: process.env.COMPANY_NAME || 'Nineteen Alpha',
    location: process.env.COMPANY_LOCATION || 'Dhaka-1216, Bangladesh',
    systemName: process.env.SYSTEM_NAME || 'Business Management System (BMS)',
  }
};
