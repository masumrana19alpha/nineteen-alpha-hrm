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

app.use(helmet({ crossOriginResourcePolicy: false }));
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

// ============================================================================
// ফ্রন্টএন্ড (index.html) সার্ভ করার কোড
// এটি public ফোল্ডার থেকে index.html খুঁজবে
// ============================================================================
const publicDir = path.resolve(__dirname, '..', 'public'); // src/app.js থেকে এক ধাপ উপরে গিয়ে public ফোল্ডার
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

// SPA Fallback: API ছাড়া অন্য যেকোনো লিংকে গেলে index.html দেখাবে
if (indexHtmlPath) {
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    return res.sendFile(indexHtmlPath);
  });
}

// 404 এবং Error Handler (সবশেষে থাকতে হবে)
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
