import { AppError } from '../utils/errors.js';
import { assistantConfig } from '../config/assistant.js';
import { getRecentMessages, getStudentContext } from './firestore.service.js';
import { downloadStudentAttachment, extractPdfText } from './supabase.service.js';
import { assistantPrompt, buildAssistantSystemPrompt } from '../utils/prompts.js';
import { getRelevantMemory } from './memory.service.js';

const stopWords = new Set(['avec', 'dans', 'pour', 'mais', 'donc', 'alors', 'cette', 'cela', 'comment', 'pourquoi', 'explique', 'montre', 'aide', 'moi', 'une', 'des', 'les', 'est', 'que', 'quoi', 'sur', 'the', 'this', 'that', 'have', 'what', 'from']);

function keywords(value) {
  return new Set(String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().match(/[a-z0-9]{3,}/g)?.filter(word => !stopWords.has(word)) || []);
}

function isShortFollowUp(message) {
  const text = String(message || '').trim().toLowerCase();
  return text.length < 55 && /^(je n['’]?ai pas compris|j['’]?ai rien compris|pas compris|je ne comprends pas|et |pourquoi|comment ça|encore|continue|oui|non|d['’]accord|exact|la suite|explique encore|plus simple|réexplique)/i.test(text);
}

export function findCurrentTopic(messages, userMessage) {
  if (!isShortFollowUp(userMessage)) return String(userMessage).trim().slice(0, 240);
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].role === 'user' && messages[index].content.trim().length > 12) return messages[index].content.trim().slice(0, 240);
  }
  return String(userMessage).trim();
}

export function selectRelevantMemory(memory, topic, userMessage) {
  const queryWords = keywords(`${topic} ${userMessage}`);
  const result = { ...memory };
  for (const field of ['learningGoals', 'studiedSubjects', 'difficultTopics', 'masteredTopics']) {
    const items = Array.isArray(memory[field]) ? memory[field] : [];
    result[field] = queryWords.size
      ? items.filter(item => [...keywords(typeof item === 'string' ? item : JSON.stringify(item))].some(word => queryWords.has(word))).slice(0, 5)
      : items.slice(0, 3);
  }
  return result;
}

export function selectDocumentExcerpts(text, query, maxChars = 14000) {
  const source = String(text || '').replace(/\r/g, '').slice(0, 100000);
  const segments = source.split(/\n{2,}|(?<=[.!?])\s+(?=[A-ZÀ-Ý0-9])/u).map(value => value.trim()).filter(value => value.length > 25);
  const queryWords = keywords(query);
  const ranked = segments.map((content, index) => {
    const words = keywords(content);
    let score = 0;
    for (const word of queryWords) if (words.has(word)) score += 1;
    return { content, index, score };
  }).sort((a, b) => b.score - a.score || a.index - b.index);
  const selected = [];
  let length = 0;
  for (const segment of ranked) {
    if (selected.length && length + segment.content.length > maxChars) continue;
    selected.push(segment);
    length += segment.content.length;
    if (length >= maxChars) break;
  }
  return selected.sort((a, b) => a.index - b.index).map(item => item.content).join('\n\n').slice(0, maxChars);
}

function compactProgress(progress = {}) {
  const result = {};
  for (const key of ['subjects', 'topics', 'completedExercises', 'weakTopics', 'strongTopics']) {
    if (Array.isArray(progress[key]) && progress[key].length) result[key] = progress[key].slice(-8);
  }
  return result;
}

function trimMessage(message) {
  const text = String(message.content || '');
  return { ...message, content: text.length > 1500 ? `[message ancien raccourci] ${text.slice(-1450)}` : text };
}

export function estimateTokens(value) {
  // Conservative approximation for mixed French text; exact tokenization is provider-specific.
  return Math.ceil(String(value).length / 3);
}

function composePrompt({ profile, memory, progress, messages, userMessage, currentTopic, documentText, mode }) {
  return assistantPrompt({ profile, memory, progress, messages, userMessage, currentTopic, documentText, mode });
}

export function fitAssistantContext(context) {
  const messages = context.messages.slice(-assistantConfig.maxContextMessages).map(trimMessage);
  let documentText = context.documentText;
  let prompt = composePrompt({ ...context, messages, documentText });
  const systemPrompt = buildAssistantSystemPrompt(context.mode);
  while (estimateTokens(systemPrompt) + estimateTokens(prompt) > assistantConfig.maxContextTokens) {
    if (messages.length > 0) {
      messages.shift();
    } else if (documentText.length > 300) {
      documentText = documentText.slice(0, Math.max(300, Math.floor(documentText.length * 0.7)));
    } else {
      break; // The current user message and essential student context are never dropped.
    }
    prompt = composePrompt({ ...context, messages, documentText });
  }
  return { prompt, systemPrompt, messages, documentText, estimatedInputTokens: estimateTokens(systemPrompt) + estimateTokens(prompt) };
}

export async function buildAssistantContext({ uid, conversationId, message, mode, attachments }) {
  const [{ profile, memory: rawMemory, progress: rawProgress }, storedMessages] = await Promise.all([
    getStudentContext(uid), getRecentMessages(uid, conversationId, assistantConfig.maxContextMessages)
  ]);
  const currentTopic = findCurrentTopic(storedMessages, message);
  const memory = selectRelevantMemory(await getRelevantMemory(rawMemory), currentTopic, message);
  const progress = compactProgress(rawProgress);
  let documentText = '';
  for (const attachment of attachments) {
    const file = await downloadStudentAttachment(uid, conversationId, attachment);
    if (file.fileType.startsWith('image/')) {
      const fitted = fitAssistantContext({ profile, memory, progress, messages: storedMessages, userMessage: message, currentTopic, documentText: '', mode });
      return { ...fitted, image: file, profile, memory, progress, currentTopic };
    }
    if (file.fileType === 'application/pdf') {
      const extracted = await extractPdfText(file.buffer);
      if (!extracted.text.trim()) throw new AppError(422, 'Aucun texte lisible n’a été trouvé dans ce PDF.', 'DOCUMENT_UNREADABLE');
      documentText = selectDocumentExcerpts(extracted.text, `${currentTopic} ${message}`);
    }
  }
  const fitted = fitAssistantContext({ profile, memory, progress, messages: storedMessages, userMessage: message, currentTopic, documentText, mode });
  return { ...fitted, profile, memory, progress, currentTopic };
}
