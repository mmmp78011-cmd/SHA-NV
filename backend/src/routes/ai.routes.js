import { Router } from 'express';
import { analyzeDocument } from '../controllers/ai.controller.js';
import { authMiddleware } from '../middleware/authMiddleware.js';
const router = Router();
router.post('/analyze-document', authMiddleware, analyzeDocument);
export default router;
