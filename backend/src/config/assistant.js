function boundedInteger(value, fallback, min, max) {
  const parsed = Number.parseInt(value || '', 10);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

export const assistantConfig = Object.freeze({
  maxContextMessages: boundedInteger(process.env.ASSISTANT_MAX_CONTEXT_MESSAGES || process.env.MAX_CONTEXT_MESSAGES, 12, 1, 30),
  maxContextTokens: boundedInteger(process.env.ASSISTANT_MAX_CONTEXT_TOKENS, 12000, 2000, 50000),
  maxOutputTokens: boundedInteger(process.env.ASSISTANT_MAX_OUTPUT_TOKENS, 1500, 128, 4096),
  temperature: 0.55
});

export function assistantOutputLimit(message, mode) {
  const text = String(message || '').trim();
  const words = text.split(/\s+/).filter(Boolean).length;
  if (mode === 'controle') return Math.min(350, assistantConfig.maxOutputTokens);
  if (mode === 'exercice') return Math.min(500, assistantConfig.maxOutputTokens);
  if (mode === 'resume') return Math.min(450, assistantConfig.maxOutputTokens);
  if (/\b(cours complet|en détail|en profondeur|étape par étape|développe|longuement|compare ces|analyse approfondie)\b/i.test(text)) return assistantConfig.maxOutputTokens;
  if (words <= 7 || /^(je n['’]?ai pas compris|j['’]?ai rien compris|pas compris|plus simple|explique encore|et .{1,35}\??)$/i.test(text)) return Math.min(130, assistantConfig.maxOutputTokens);
  return Math.min(750, assistantConfig.maxOutputTokens);
}
