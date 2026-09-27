import { Router } from 'express';
import { chat } from '../controllers/assistant.controller.js';
import { authMiddleware } from '../middleware/authMiddleware.js';
const router = Router();
router.post('/chat', authMiddleware, chat);
export default router;
