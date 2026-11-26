import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import { env } from './config/env.js';
import { UPLOAD_ROOT } from './config/storage.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import apiRoutes from './routes/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Helmet ফিক্স (Tailwind এবং API রেসপন্সের জন্য)
app.use(helmet({ 
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: false 
}));

// CORS ফিক্স (নিশ্চিত করা যে ফ্রন্টএন্ড থেকে রিকোয়েস্ট ব্লক না হয়)
app.use(
  cors({
    origin: true,
    credentials: true,
  })
);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// আপলোড ফোল্ডার সার্ভ করা
app.use('/uploads', express.static(path.resolve(UPLOAD_ROOT)));

// ============================================================================
// HEALTH CHECK ROUTE (সার্ভার ঠিক আছে কিনা চেক করার জন্য)
// ============================================================================
app.get('/api/health', (_req, res) => {
  res.json({
    success: true,
    service: '19-alpha-bms-api',
    timestamp: new Date().toISOString(),
  });
});

// মূল API রাউটস
app.use('/api', apiRoutes);

// ফ্রন্টএন্ড (index.html) সার্ভ করার কোড
const publicDir = path.resolve(__dirname, '..', 'public');
const publicIndexHtml = path.join(publicDir, 'index.html');
const rootIndexHtml = path.resolve(__dirname, '..', 'index.html');

const indexHtmlPath = fs.existsSync(publicIndexHtml)
  ? publicIndexHtml
  : fs.existsSync(rootIndexHtml)
    ? rootIndexHtml
    : null;

if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir));
}

// SPA Fallback (index.html সার্ভ করা)
if (indexHtmlPath) {
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    return res.sendFile(indexHtmlPath);
  });
}

// 404 এবং Error Handler
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
