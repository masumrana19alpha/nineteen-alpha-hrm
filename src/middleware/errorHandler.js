import multer from 'multer';
import { env } from '../config/env.js';
import { AppError } from '../utils/errors.js';

export function notFoundHandler(req, res, _next) {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.originalUrl} not found`,
    },
  });
}

export function errorHandler(err, _req, res, _next) {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'UPLOAD_ERROR',
        message: err.message,
      },
    });
  }

  if (err?.code === '23505') {
    return res.status(409).json({
      success: false,
      error: {
        code: 'DUPLICATE_RECORD',
        message: 'A record with this unique identifier already exists',
        details: err.detail || null,
      },
    });
  }

  if (err?.code === '23503') {
    return res.status(400).json({
      success: false,
      error: {
        code: 'FOREIGN_KEY_VIOLATION',
        message: 'Referenced record does not exist or cannot be removed while referenced',
        details: err.detail || null,
      },
    });
  }

  if (err?.code === '22P02') {
    return res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_INPUT_SYNTAX',
        message: 'Invalid identifier or input format',
      },
    });
  }

  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
        details: err.details || null,
      },
    });
  }

  console.error('Unhandled BMS Error:', err);

  return res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: env.isProduction
        ? 'An unexpected error occurred on the server'
        : err.message || 'Internal server error',
    },
  });
}
