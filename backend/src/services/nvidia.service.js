import { AppError } from '../utils/errors.js';
import {
  NVIDIA_NIM_TIMEOUT_MS,
  NVIDIA_TEXT_MODEL,
  NVIDIA_TEXT_NIM_URL,
  NVIDIA_VISION_MODEL,
  NVIDIA_VISION_NIM_URL,
  redactNimUrl
} from '../config/nvidia.js';
import { assistantConfig } from '../config/assistant.js';
import { goalConfig } from '../config/goal.js';

function providerError(status) {
  if (status === 401 || status === 403) return new AppError(502, 'NVIDIA NIM a refusé la requête. Vérifie la configuration d’accès au service.', 'AI_PROVIDER_ERROR');
  if (status === 404) return new AppError(503, 'Le modèle NVIDIA demandé est introuvable ou indisponible.', 'AI_MODEL_UNAVAILABLE');
  if (status === 429) return new AppError(429, 'NVIDIA NIM est temporairement surchargé. Réessaie dans quelques instants.', 'AI_PROVIDER_ERROR');
  if (status === 400 || status === 422) return new AppError(502, 'NVIDIA NIM a refusé le format de la requête.', 'AI_PROVIDER_ERROR');
  if (status >= 500) return new AppError(503, 'NVIDIA NIM est temporairement indisponible.', 'AI_PROVIDER_ERROR');
  return new AppError(502, 'Impossible de contacter NVIDIA NIM.', 'AI_PROVIDER_ERROR');
}

async function postCompletion({ baseUrl, model, messages, temperature, maxTokens, responseFormat }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), NVIDIA_NIM_TIMEOUT_MS);
  const startedAt = Date.now();
  const url = baseUrl + '/v1/chat/completions';
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        ...(maxTokens ? { max_tokens: maxTokens } : {}),
        ...(responseFormat ? { response_format: responseFormat } : {})
      }),
      signal: controller.signal
    });
    if (!response.ok) {
      console.error('[nvidia] NIM request failed', { url: redactNimUrl(url), model, status: response.status, durationMs: Date.now() - startedAt });
      throw providerError(response.status);
    }
    let data;
    try {
      data = await response.json();
    } catch {
      throw new AppError(502, 'NVIDIA NIM a retourné une réponse JSON illisible.', 'AI_INVALID_RESPONSE');
    }
    const content = data?.choices?.[0]?.message?.content;
    const text = typeof content === 'string'
      ? content.trim()
      : Array.isArray(content)
        ? content.map(part => typeof part?.text === 'string' ? part.text : '').join('').trim()
        : '';
    if (!text) throw new AppError(502, 'NVIDIA NIM n’a pas retourné de réponse.', 'AI_EMPTY_RESPONSE');
    console.info('[nvidia] NIM request completed', { url: redactNimUrl(url), model, durationMs: Date.now() - startedAt });
    return text;
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (error?.name === 'AbortError') throw new AppError(504, 'La requête NVIDIA NIM a dépassé le délai autorisé.', 'AI_TIMEOUT');
    console.error('[nvidia] NIM connection failed', { url: redactNimUrl(url), model, durationMs: Date.now() - startedAt, error: error?.name || 'Error' });
    throw new AppError(503, 'Impossible de joindre NVIDIA NIM. Vérifie son URL et son état.', 'AI_UNAVAILABLE');
  } finally {
    clearTimeout(timeout);
  }
}

async function complete({ systemPrompt, userPrompt, model = NVIDIA_TEXT_MODEL, responseFormat, temperature = 0.7, maxTokens }) {
  const messages = [
    ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
    { role: 'user', content: userPrompt }
  ];
  return postCompletion({ baseUrl: NVIDIA_TEXT_NIM_URL, model, messages, temperature, maxTokens, responseFormat });
}

export function generateAIResponse({ systemPrompt, userPrompt, temperature, maxTokens }) {
  return complete({ systemPrompt, userPrompt, temperature, maxTokens });
}

export function generateAssistantResponse({ systemPrompt, userPrompt, maxTokens }) {
  return complete({
    systemPrompt,
    userPrompt,
    temperature: assistantConfig.temperature,
    maxTokens: maxTokens || assistantConfig.maxOutputTokens
  });
}

export function generateText(prompt) {
  return generateAIResponse({
    systemPrompt: 'Tu es un assistant pédagogique précis et bienveillant. Suis les consignes et le contexte fournis. N’invente pas d’informations sur l’élève.',
    userPrompt: prompt
  });
}

function parseJson(text, code, message) {
  const fence = String.fromCharCode(96).repeat(3);
  const cleaned = text.replace(new RegExp('^\\s*' + fence + '(?:json)?\\s*', 'i'), '').replace(new RegExp('\\s*' + fence + '\\s*$'), '').trim();
  try { return JSON.parse(cleaned); }
  catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try { return JSON.parse(cleaned.slice(start, end + 1)); } catch { /* use the standard error below */ }
    }
    throw new AppError(502, message, code);
  }
}

export async function generateStructuredJSON(prompt) {
  const text = await complete({
    systemPrompt: 'Retourne uniquement un objet JSON valide qui respecte exactement la structure demandée. N’ajoute pas de texte autour.',
    userPrompt: prompt,
    temperature: 0.3,
    responseFormat: { type: 'json_object' }
  });
  return parseJson(text, 'AI_INVALID_JSON', 'Le JSON généré par NVIDIA était illisible.');
}

export async function generateGoalProgram(prompt, maxTokens) {
  const text = await complete({
    systemPrompt: 'You are Goal AI, an educational program planner. Return only valid JSON matching the requested schema. Do not add markdown or text outside the JSON.',
    userPrompt: prompt,
    temperature: goalConfig.temperature,
    maxTokens,
    responseFormat: { type: 'json_object' }
  });
  return parseJson(text, 'AI_INVALID_GOAL_JSON', 'Goal AI a retourné un programme JSON invalide.');
}

export function generateGoalChatResponse(userPrompt) {
  return complete({
    systemPrompt: 'Tu es Goal AI, un coach spécialisé dans les programmes d’apprentissage. Réponds en français avec une étape concrète liée au but et au programme fournis. N’invente jamais une progression.',
    userPrompt,
    temperature: goalConfig.temperature,
    maxTokens: goalConfig.chatMaxOutputTokens
  });
}

export async function analyzeDocument({ buffer, fileType, prompt, systemPrompt = '', maxTokens = assistantConfig.maxOutputTokens }) {
  if (!fileType.startsWith('image/')) {
    throw new AppError(415, 'Le modèle vision analyse les images ; le texte des PDF doit être extrait avant l’envoi.', 'UNSUPPORTED_DOCUMENT_TYPE');
  }
  if (!NVIDIA_VISION_NIM_URL || !NVIDIA_VISION_MODEL) {
    throw new AppError(503, 'Le modèle vision NVIDIA n’est pas configuré. Renseigne NVIDIA_VISION_NIM_URL et NVIDIA_VISION_MODEL.', 'AI_VISION_NOT_CONFIGURED');
  }

  const imageUrl = 'data:' + fileType + ';base64,' + buffer.toString('base64');
  const visionDescription = await postCompletion({
    baseUrl: NVIDIA_VISION_NIM_URL,
    model: NVIDIA_VISION_MODEL,
    temperature: assistantConfig.temperature,
    maxTokens: Math.min(assistantConfig.maxOutputTokens, Math.max(512, maxTokens || 0)),
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: 'Décris précisément cette image pour un assistant pédagogique. Reproduis les énoncés, formules et éléments visuels utiles sans inventer. Question de l’élève : ' + (prompt || 'Analyse cette image.') },
        { type: 'image_url', image_url: { url: imageUrl } }
      ]
    }]
  });

  return complete({
    systemPrompt: [systemPrompt, 'Une analyse visuelle préliminaire a été faite par un modèle vision. Utilise-la comme contexte, réponds directement à l’élève dans le style pédagogique demandé et signale toute ambiguïté au lieu d’inventer.'].filter(Boolean).join('\n\n'),
    userPrompt: 'Question de l’élève :\n' + (prompt || 'Analyse cette image.') + '\n\nAnalyse textuelle de l’image :\n' + visionDescription,
    temperature: assistantConfig.temperature,
    maxTokens: maxTokens || assistantConfig.maxOutputTokens
  });
}

export async function checkNim({ baseUrl = NVIDIA_TEXT_NIM_URL, expectedModel = NVIDIA_TEXT_MODEL } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.min(NVIDIA_NIM_TIMEOUT_MS, 10000));
  try {
    const response = await fetch(baseUrl + '/v1/models', { signal: controller.signal, headers: { Accept: 'application/json' } });
    if (!response.ok) return { ok: false, reason: 'http_' + response.status };
    const data = await response.json();
    const models = Array.isArray(data?.data) ? data.data.map(item => item?.id).filter(Boolean) : [];
    return { ok: true, modelAvailable: models.includes(expectedModel), models };
  } catch (error) {
    return { ok: false, reason: error?.name === 'AbortError' ? 'timeout' : 'unreachable' };
  } finally {
    clearTimeout(timeout);
  }
}
