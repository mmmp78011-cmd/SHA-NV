import test from 'node:test';
import assert from 'node:assert/strict';
import {
  estimateTokens,
  findCurrentTopic,
  fitAssistantContext,
  selectDocumentExcerpts,
  selectRelevantMemory
} from '../src/services/context.service.js';
import { assistantConfig } from '../src/config/assistant.js';
import { buildAssistantSystemPrompt } from '../src/utils/prompts.js';

test('a short follow-up keeps the previous learning topic', () => {
  const topic = findCurrentTopic([
    { role: 'user', content: 'Explique-moi les pointeurs en C.' },
    { role: 'assistant', content: 'Un pointeur garde une adresse mémoire.' }
  ], 'J’ai rien compris.');
  assert.match(topic, /pointeurs en C/);
});

test('assistant memory is filtered toward the current subject', () => {
  const memory = selectRelevantMemory({
    learningGoals: ['réussir le cours de biologie'],
    studiedSubjects: ['mathématiques', 'informatique'],
    difficultTopics: ['boucles Python', 'mitochondrie'],
    masteredTopics: ['fractions'],
    preferredExplanationStyle: 'simple et progressif'
  }, 'boucles Python', 'Je bloque sur une boucle.');
  assert.deepEqual(memory.difficultTopics, ['boucles Python']);
  assert.deepEqual(memory.masteredTopics, []);
  assert.equal(memory.preferredExplanationStyle, 'simple et progressif');
});

test('document excerpt selection favors paragraphs related to the question', () => {
  const text = [
    'Les volcans se forment lorsque le magma remonte à la surface et produit une éruption.',
    'La mitochondrie produit une partie de l’énergie de la cellule grâce à la respiration cellulaire.',
    'Les plaques tectoniques se déplacent lentement à la surface de la Terre.'
  ].join('\n\n');
  const excerpt = selectDocumentExcerpts(text, 'Explique le rôle de la mitochondrie dans la cellule.', 110);
  assert.match(excerpt, /mitochondrie/);
  assert.doesNotMatch(excerpt, /volcans/);
});

test('system instructions are specific to the selected assistant mode', () => {
  const exercise = buildAssistantSystemPrompt('exercice');
  const quiz = buildAssistantSystemPrompt('controle');
  assert.match(exercise, /attends la réponse/i);
  assert.match(quiz, /cinq questions, une seule question à la fois/i);
  assert.notEqual(exercise, quiz);
});

test('context fitting drops old messages first and preserves the current request', () => {
  const messages = Array.from({ length: 20 }, (_, index) => ({
    role: index % 2 ? 'assistant' : 'user',
    content: `${index === 0 ? 'ANCIEN_MESSAGE_A_RETIRER' : `message_${index}`} ${'détail '.repeat(750)}`
  }));
  const fitted = fitAssistantContext({
    profile: { firstName: 'Lina', schoolLevel: 'Terminale', fieldOfStudy: 'Sciences', schoolName: 'Lycée', age: 17 },
    memory: { learningGoals: [], studiedSubjects: [], difficultTopics: [], masteredTopics: [] },
    progress: {}, messages, userMessage: 'Explique-moi la notion actuelle.', currentTopic: 'notion actuelle',
    documentText: 'Extrait pertinent. '.repeat(1000), mode: 'explication'
  });
  assert.match(fitted.prompt, /Explique-moi la notion actuelle/);
  assert.doesNotMatch(fitted.prompt, /ANCIEN_MESSAGE_A_RETIRER/);
  assert.ok(fitted.estimatedInputTokens <= assistantConfig.maxContextTokens);
});
