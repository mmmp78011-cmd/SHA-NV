const normalizeUrl = value => String(value || '').trim().replace(/\/+$/, '');

export const NVIDIA_TEXT_NIM_URL = normalizeUrl(process.env.NVIDIA_TEXT_NIM_URL || process.env.NVIDIA_NIM_URL || 'http://localhost:8000');
export const NVIDIA_TEXT_MODEL = process.env.NVIDIA_TEXT_MODEL || process.env.NVIDIA_MODEL || 'openai/gpt-oss-20b';
export const NVIDIA_VISION_NIM_URL = normalizeUrl(process.env.NVIDIA_VISION_NIM_URL || '');
export const NVIDIA_VISION_MODEL = process.env.NVIDIA_VISION_MODEL || '';
export const NVIDIA_NIM_TIMEOUT_MS = Math.max(1000, Number.parseInt(process.env.NVIDIA_NIM_TIMEOUT_MS || '180000', 10) || 180000);

export function redactNimUrl(value) {
  try {
    const url = new URL(value);
    return url.origin + url.pathname;
  } catch {
    return 'configured-nim-url';
  }
}
