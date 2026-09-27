import { buildAssistantContext } from '../services/context.service.js';
import { analyzeDocument, generateAssistantResponse } from '../services/nvidia.service.js';
import { saveAssistantExchange } from '../services/firestore.service.js';
import { assistantOutputLimit, assistantReasoningEffort } from '../config/assistant.js';
import { validateChat, validateDocumentRequest } from '../utils/validation.js';

export async function chat(req, res) {
  const input = validateChat(req.body);
  const conversationId = input.conversationId || crypto.randomUUID();
  const context = await buildAssistantContext({ uid: req.user.uid, conversationId: input.conversationId, ...input });
  let response;
  if (context.image) {
    response = await analyzeDocument({ buffer: context.image.buffer, fileType: context.image.fileType, prompt: context.prompt, systemPrompt: context.systemPrompt, maxTokens: assistantOutputLimit(input.message, input.mode) });
  } else {
    response = await generateAssistantResponse({ systemPrompt: context.systemPrompt, userPrompt: context.prompt, maxTokens: assistantOutputLimit(input.message, input.mode), reasoningEffort: assistantReasoningEffort(input.message, input.mode) });
  }
  const saved = await saveAssistantExchange(req.user.uid, {
    conversationId, userMessage: input.message, mode: input.mode, attachments: input.attachments, response
  });
  res.json({ success: true, conversationId, message: { role: 'assistant', content: response, timestamp: saved.timestamp } });
}

export async function analyzeDocumentRequest(req, res) {
  const { attachment, mode, prompt: question } = validateDocumentRequest(req.body);
  const conversationId = attachment.storagePath.split('/')[1];
  const context = await buildAssistantContext({
    uid: req.user.uid,
    conversationId,
    message: question || `Analyse le document ${attachment.fileName}.`,
    mode,
    attachments: [attachment]
  });
  const response = context.image
    ? await analyzeDocument({ buffer: context.image.buffer, fileType: context.image.fileType, prompt: context.prompt, systemPrompt: context.systemPrompt, maxTokens: assistantOutputLimit(question || `Analyse le document ${attachment.fileName}.`, mode) })
    : await generateAssistantResponse({ systemPrompt: context.systemPrompt, userPrompt: context.prompt, maxTokens: assistantOutputLimit(question || `Analyse le document ${attachment.fileName}.`, mode), reasoningEffort: assistantReasoningEffort(question, mode) });
  res.json({ success: true, analysis: response });
}
