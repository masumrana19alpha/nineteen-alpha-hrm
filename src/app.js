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

// FIX: Helmet-এর ডিফল্ট Content Security Policy (CSP) Tailwind CDN এবং inline script ব্লক করে।
// তাই contentSecurityPolicy: false করে দেওয়া হলো, যাতে ফ্রন্টএন্ডের ডিজাইন লোড হয়।
app.use(helmet({ 
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: false 
}));

app.use(
  cors({
    origin: env.corsOrigin === '*' ? true : env.corsOrigin.split(',').map((s) => s.trim()),
    credentials: true,
  })
);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// আপলোড ফোল্ডার সার্ভ করা
app.use('/uploads', express.static(path.resolve(UPLOAD_ROOT)));

// API রাউটস
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

// SPA Fallback
if (indexHtmlPath) {
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    
    // ব্রাউজার যাতে পুরানো index.html ক্যাশ না করে
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    return res.sendFile(indexHtmlPath);
  });
}

// 404 এবং Error Handler
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
