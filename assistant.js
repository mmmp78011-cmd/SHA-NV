function boundedInteger(value, fallback, min, max) {
  const parsed = Number.parseInt(value || '', 10);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

export const assistantConfig = Object.freeze({
  maxContextMessages: boundedInteger(process.env.ASSISTANT_MAX_CONTEXT_MESSAGES || process.env.MAX_CONTEXT_MESSAGES, 12, 1, 30),
  maxContextTokens: boundedInteger(process.env.ASSISTANT_MAX_CONTEXT_TOKENS, 12000, 2000, 50000),
  maxOutputTokens: boundedInteger(process.env.ASSISTANT_MAX_OUTPUT_TOKENS, 8000, 512, 12000),
  outputBudgets: Object.freeze({
    simple: boundedInteger(process.env.ASSISTANT_SIMPLE_MAX_OUTPUT_TOKENS, 3000, 512, 8000),
    explanation: boundedInteger(process.env.ASSISTANT_EXPLANATION_MAX_OUTPUT_TOKENS, 5000, 512, 8000),
    exercise: boundedInteger(process.env.ASSISTANT_EXERCISE_MAX_OUTPUT_TOKENS, 4500, 512, 8000),
    control: boundedInteger(process.env.ASSISTANT_CONTROL_MAX_OUTPUT_TOKENS, 4500, 512, 8000),
    summary: boundedInteger(process.env.ASSISTANT_SUMMARY_MAX_OUTPUT_TOKENS, 4000, 512, 8000),
    complex: boundedInteger(process.env.ASSISTANT_COMPLEX_MAX_OUTPUT_TOKENS, 6500, 512, 8000),
    programming: boundedInteger(process.env.ASSISTANT_PROGRAMMING_MAX_OUTPUT_TOKENS, 7000, 512, 8000)
  }),
  reasoningEffortEnabled: process.env.NVIDIA_REASONING_EFFORT_ENABLED === 'true',
  temperature: 0.55
});

export function assistantOutputLimit(message, mode) {
  const text = String(message || '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+([?!.,])/g, '$1');
  const budgets = assistantConfig.outputBudgets;
  if (/\b(code|programme|programmer|fonction|classe|debug|corrige|erreur|script|algorithme|python|javascript|java|c\+\+)\b/i.test(text)) {
    return Math.min(assistantConfig.maxOutputTokens, budgets.programming);
  }
  if (/\b(matrice|matrices|demonstration|preuve|calcul|equation|mathematique|maths|physique|etape par etape|en detail|en profondeur|cours complet|analyse approfondie)\b/i.test(text)) {
    return Math.min(assistantConfig.maxOutputTokens, budgets.complex);
  }
  if (/^(bonjour|merci|salut|ca va|pourquoi\??|comment ca\??|plus simple|pas compris|explique encore|j'ai rien compris)[.!?]*$/i.test(text)) {
    return Math.min(assistantConfig.maxOutputTokens, budgets.simple);
  }
  if (mode === 'controle') return Math.min(assistantConfig.maxOutputTokens, budgets.control);
  if (mode === 'exercice') return Math.min(assistantConfig.maxOutputTokens, budgets.exercise);
  if (mode === 'resume') return Math.min(assistantConfig.maxOutputTokens, budgets.summary);
  if (mode === 'explication') return Math.min(assistantConfig.maxOutputTokens, budgets.explanation);
  return Math.min(assistantConfig.maxOutputTokens, budgets.explanation);
}

export function assistantReasoningEffort(message, mode) {
  const text = String(message || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (/\b(code|programme|debug|corrige|preuve|demonstration|analyse approfondie|en profondeur)\b/i.test(text)) return 'high';
  if (mode === 'exercice' || mode === 'controle' || mode === 'resume' || /\b(explique|pourquoi|comment|calcul|etape par etape)\b/i.test(text)) return 'medium';
  return 'low';
}
