import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import aiRoutes from './routes/ai.routes.js';
import assistantRoutes from './routes/assistant.routes.js';
import goalRoutes from './routes/goal.routes.js';
import healthRoutes from './routes/health.routes.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { AppError } from './utils/errors.js';

const app = express();
// One Cloudflare Quick Tunnel proxy forwards X-Forwarded-For to this origin.
app.set('trust proxy', 1);
const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:5500,http://127.0.0.1:5500,https://school-helping-ai.web.app')
  .split(',').map(origin => origin.trim()).filter(Boolean);
const isAllowedLocalOrigin = origin => {
  try {
    const url = new URL(origin);
    return url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname);
  } catch {
    return false;
  }
};

app.disable('x-powered-by');
app.use(helmet());
app.use(cors({ origin(origin, callback) {
  if (!origin || allowedOrigins.includes(origin) || isAllowedLocalOrigin(origin)) return callback(null, true);
  callback(new AppError(403, 'Cette origine n’est pas autorisée.', 'CORS_ORIGIN_DENIED'));
} }));
app.use(express.json({ limit: process.env.MAX_REQUEST_SIZE || '128kb' }));
app.use('/api', rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: 'draft-8', legacyHeaders: false }));
app.use('/api/health', healthRoutes);
app.use('/api/assistant', assistantRoutes);
app.use('/api/goal', goalRoutes);
app.use('/api/ai', aiRoutes);
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
