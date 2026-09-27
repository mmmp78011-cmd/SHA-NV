import { firebaseAuth } from '../config/firebase.js';
import { AppError, unauthorized } from '../utils/errors.js';

function isLocalOrigin(origin = '') {
  try {
    const url = new URL(origin);
    return url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname);
  } catch {
    return false;
  }
}

export async function authMiddleware(req, _res, next) {
  try {
    const authorization = req.get('authorization') || '';
    const match = authorization.match(/^Bearer\s+([^\s]+)$/i);
    if (!match) throw unauthorized('Connecte-toi pour continuer.');
    const decoded = await firebaseAuth.verifyIdToken(match[1]);
    req.user = { uid: decoded.uid, email: decoded.email || null };
    next();
  } catch (error) {
    if (error instanceof AppError) return next(error);
    console.error('[auth] Firebase ID token verification failed:', error.code || error.message);
    const isLocalRequest = ['localhost', '127.0.0.1'].includes(req.hostname)
      || isLocalOrigin(req.get('origin'));
    if (process.env.NODE_ENV !== 'production' || isLocalRequest) {
      return next(unauthorized(`Session Firebase rejetée (${error.code || 'erreur inconnue'}).`));
    }
    next(unauthorized('Session invalide ou expirée. Reconnecte-toi.'));
  }
}
