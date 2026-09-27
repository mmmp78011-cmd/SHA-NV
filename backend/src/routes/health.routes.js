import { Router } from 'express';
import { NVIDIA_TEXT_MODEL, NVIDIA_TEXT_NIM_URL, redactNimUrl } from '../config/nvidia.js';
import { checkNim } from '../services/nvidia.service.js';
const router = Router();
router.get('/', (_req, res) => {
  res.status(200).json({
    success: true,
    status: 'ok',
    message: 'AI backend is running',
    aiProvider: 'nvidia-nim',
    model: NVIDIA_TEXT_MODEL
  });
});
router.get('/ai', async (_req, res) => {
  const result = await checkNim();
  const modelAvailable = result.ok && result.modelAvailable;
  res.status(modelAvailable ? 200 : 503).json({
    success: modelAvailable,
    status: modelAvailable ? 'ok' : result.ok ? 'model_unavailable' : 'unreachable',
    aiProvider: 'nvidia-nim',
    url: redactNimUrl(NVIDIA_TEXT_NIM_URL),
    model: NVIDIA_TEXT_MODEL,
    ...(result.ok ? { availableModels: result.models } : { reason: result.reason })
  });
});
export default router;
