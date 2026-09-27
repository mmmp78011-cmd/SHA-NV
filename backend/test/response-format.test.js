import test from 'node:test';
import assert from 'node:assert/strict';
import { renderMarkdown } from '../../public/markdown.js';
import { formatProgramMarkdown } from '../../public/goal-format.js';

class TestNode {
  constructor(tagName, text = '') { this.tagName = tagName; this.children = []; this.value = text; this.className = ''; }
  append(...nodes) { this.children.push(...nodes); }
  get textContent() { return this.children.length ? this.children.map(child => child.textContent).join('') : this.value; }
  set textContent(value) { this.children = []; this.value = String(value); }
}

globalThis.document = {
  createElement: tagName => new TestNode(tagName),
  createTextNode: value => new TestNode('#text', value)
};

function allNodes(node) { return [node, ...node.children.flatMap(allNodes)]; }

test('Assistant Markdown renders concise answers, bold, inline code, lists and fenced code safely', () => {
  const short = renderMarkdown('💡 **Une variable**\n\nElle mémorise une valeur comme `age`.');
  assert.ok(allNodes(short).some(node => node.tagName === 'strong'));
  assert.ok(allNodes(short).some(node => node.tagName === 'code' && node.textContent === 'age'));

  const detailed = renderMarkdown('## Les boucles\n\nUne boucle répète une instruction tant qu’une condition est vraie. Elle évite de recopier plusieurs fois le même code.\n\n### Exemple\n\n```pseudo\nPOUR i DE 1 À 3\n    AFFICHER i\nFIN POUR\n```\n\n### Exercice\n\n- Affiche les nombres de 1 à 5\n- Recommence avec un pas de 2\n\n```html\n<script>alert(1)</script>\n```');
  const nodes = allNodes(detailed);
  assert.ok(nodes.some(node => node.tagName === 'h3'));
  assert.equal(nodes.filter(node => node.tagName === 'li').length, 2);
  assert.equal(nodes.filter(node => node.tagName === 'pre').length, 2);
  assert.equal(nodes.some(node => node.tagName === 'script'), false);
  assert.ok(detailed.textContent.includes('<script>'));
});

test('Goal AI responses render short, explanatory, exercise, quiz and multi-section Markdown', () => {
  const short = renderMarkdown('Oui, cette méthode convient.');
  assert.equal(allNodes(short).filter(node => node.tagName === 'p').length, 1);

  const explanation = renderMarkdown('## 💡 Explication\n\nUne condition teste une expression.\n\n### Exemple\n\n`age >= 18`');
  assert.ok(allNodes(explanation).some(node => node.tagName === 'h3'));
  assert.ok(allNodes(explanation).some(node => node.tagName === 'h4'));
  assert.ok(allNodes(explanation).some(node => node.tagName === 'code'));

  const exercise = renderMarkdown('## ✏️ Exercice\n\n- 🎯 Objectif : pratiquer\n- 📚 Notion : variables\n- 💡 Indice : utilise `age`');
  assert.equal(allNodes(exercise).filter(node => node.tagName === 'li').length, 3);

  const quiz = renderMarkdown('## 🧪 Mini-test\n\n1. Que stocke une variable ?\n2. À quoi sert une condition ?');
  assert.equal(allNodes(quiz).filter(node => node.tagName === 'ol').length, 1);
  assert.equal(allNodes(quiz).filter(node => node.tagName === 'li').length, 2);

  const sections = renderMarkdown('## ✅ Maîtrisé\n\nVariables.\n\n---\n\n## ⚠️ À revoir\n\n- Conditions imbriquées');
  assert.equal(allNodes(sections).filter(node => node.tagName === 'hr').length, 1);
});

test('Goal AI 10-day programs format as separate weeks and days without repeated labels', () => {
  const days = (start, count) => Array.from({ length: count }, (_, index) => ({
    day: index + 1,
    title: `Jour ${index + 1} — Jour ${index + 1} — Variables ${start + index}`,
    focus: `Objectif : pratiquer les variables ${start + index}`,
    estimatedMinutes: 60,
    activities: ['• Faire un exercice', 'Réviser les notions']
  }));
  const output = formatProgramMarkdown({
    goalSummary: 'Objectif : apprendre le pseudo-code',
    strategy: 'Stratégie : avancer par étapes',
    duration: { value: 10, unit: 'days' },
    weeks: [
      { week: 1, objective: 'Semaine 1 — Acquérir les bases', days: days(1, 7) },
      { week: 2, objective: 'Semaine 2 — Consolider', days: days(8, 3) }
    ]
  });
  assert.equal((output.match(/## 📆 Semaine/g) || []).length, 2);
  assert.equal((output.match(/### 📅 Jour/g) || []).length, 10);
  assert.match(output, /### 📅 Jour 1 — Variables 1/);
  assert.doesNotMatch(output, /Jour 1 — Jour 1/);
  assert.match(output, /\*\*📚 Activités\*\*/);
  assert.match(output, /- Faire un exercice\n- Réviser les notions/);
  assert.match(output, /⏱️ \*\*Durée :\*\* 10 jours/);
});
