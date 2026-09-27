import { AppError } from '../utils/errors.js';

export function notFoundHandler(_req, _res, next) {
  next(new AppError(404, 'Cette route est introuvable.', 'NOT_FOUND'));
}

export function errorHandler(error, _req, res, _next) {
  const status = error instanceof AppError ? error.status : Number(error.status) || 500;
  if (status >= 500) console.error('[backend]', error);
  res.status(status).json({
    success: false,
    error: {
      code: error instanceof AppError ? error.code : status === 429 ? 'RATE_LIMITED' : 'SERVER_ERROR',
      message: error instanceof AppError ? error.message : status >= 500 ? 'Une erreur est survenue. Réessaie plus tard.' : error.message
    }
  });
}
