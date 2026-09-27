import { AppError, badRequest } from './errors.js';

const idPattern = /^[A-Za-z0-9_-]{1,128}$/;
export function requireId(value, label = 'Identifiant') {
  if (typeof value !== 'string' || !idPattern.test(value)) throw badRequest(`${label} invalide.`);
  return value;
}

export function validateChat(body = {}) {
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (!message || message.length > 8000) throw badRequest('Écris un message de 1 à 8 000 caractères.');
  const modes = new Set(['resume', 'explication', 'exercice', 'controle']);
  const mode = body.mode || 'explication';
  if (!modes.has(mode)) throw badRequest('Mode Assistant invalide.');
  const conversationId = body.conversationId == null ? '' : requireId(body.conversationId, 'Conversation');
  const attachments = body.attachments == null ? [] : body.attachments;
  if (!Array.isArray(attachments) || attachments.length > 1) throw badRequest('Ajoute un seul fichier à la fois.');
  return { message, mode, conversationId, attachments };
}

export function validateGoal(goal) {
  if (!goal || typeof goal !== 'object' || Array.isArray(goal)) throw badRequest('Objectif invalide.');
  const duration = goal.duration;
  if (!duration || !Number.isInteger(duration.value)) throw badRequest('Durée d’objectif invalide.');
  const optionalText = (value, label, maxLength) => {
    if (value == null || value === '') return null;
    if (typeof value !== 'string' || value.length > maxLength) throw badRequest(`${label} doit contenir au plus ${maxLength} caractères.`);
    return value.trim() || null;
  };
  const common = {
    goalTitle: optionalText(goal.goalTitle, 'Le but', 160),
    description: optionalText(goal.description, 'La description', 2000),
    additionalDetails: optionalText(goal.additionalDetails, 'Les détails', 1000)
  };
  if (goal.type === 'exam') {
    if (duration.unit !== 'days' || duration.value < 3 || duration.value > 30 || !Array.isArray(goal.chapters) || goal.chapters.length < 1 || goal.chapters.length > 6) throw badRequest('Objectif d’examen invalide.');
    const chapters = goal.chapters.map(chapter => {
      if (!chapter || typeof chapter.name !== 'string' || !chapter.name.trim() || chapter.name.length > 100 || !['easy', 'medium', 'hard'].includes(chapter.difficulty)) throw badRequest('Vérifie le nom et la difficulté de chaque chapitre.');
      return { name: chapter.name.trim(), difficulty: chapter.difficulty };
    });
    return { ...common, type: 'exam', duration, level: optionalText(goal.level, 'Le niveau', 100), chapters };
  }
  const programmingLanguages = ['C', 'Python', 'Pseudo-code'];
  const languages = ['Français', 'Anglais', 'Espagnol', 'French', 'English', 'Spanish'];
  if (goal.type === 'programming') {
    const validDuration = (duration.unit === 'days' && duration.value >= 3 && duration.value <= 90)
      || (duration.unit === 'weeks' && duration.value >= 3 && duration.value <= 12);
    if (!programmingLanguages.includes(goal.language) || !['beginner', 'intermediate', 'advanced'].includes(goal.level) || !validDuration) throw badRequest('Objectif de programmation invalide.');
    return { ...common, type: goal.type, language: goal.language, level: goal.level, duration };
  }
  if (goal.type === 'language') {
    if (!languages.includes(goal.language) || !['A1', 'A2', 'B1', 'B2', 'C'].includes(goal.level) || duration.unit !== 'months' || duration.value < 1 || duration.value > 6) throw badRequest('Objectif de langue invalide.');
    const targetLevel = goal.targetLevel == null || goal.targetLevel === '' ? null : goal.targetLevel;
    if (targetLevel && !['A1', 'A2', 'B1', 'B2', 'C'].includes(targetLevel)) throw badRequest('Choisis un niveau cible valide.');
    return { ...common, type: goal.type, language: goal.language, level: goal.level, targetLevel, duration };
  }
  throw badRequest('Type d’objectif invalide.');
}

export function goalDurationInDays(duration) {
  if (!duration || !Number.isInteger(duration.value)) throw badRequest('Durée d’objectif invalide.');
  if (duration.unit === 'days') return duration.value;
  if (duration.unit === 'weeks') return duration.value * 7;
  if (duration.unit === 'months') return duration.value * 28;
  throw badRequest('Unité de durée invalide.');
}

function invalidPlan(message) {
  throw new AppError(502, message, 'GOAL_PLAN_INVALID');
}

function normalizedText(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function validateStudyPlan(value, expectedWeeks, expectedDays, goal) {
  if (!value || typeof value.goalSummary !== 'string' || !value.goalSummary.trim() || value.goalSummary.length > 1000
      || typeof value.strategy !== 'string' || !value.strategy.trim() || value.strategy.length > 1400
      || !Array.isArray(value.weeks) || value.weeks.length !== expectedWeeks) invalidPlan('Le programme généré est incomplet ou ne respecte pas son format.');
  // The submitted goal is authoritative for duration metadata. The schedule is still validated below.
  const duration = { value: goal.duration.value, unit: goal.duration.unit };
  let scheduledDays = 0;
  for (const [weekIndex, week] of value.weeks.entries()) {
    const daysInWeek = Math.min(7, expectedDays - weekIndex * 7);
    if (week.week !== weekIndex + 1 || typeof week.objective !== 'string' || !week.objective.trim() || week.objective.length > 300
        || !Array.isArray(week.days) || week.days.length !== daysInWeek) invalidPlan(`La semaine ${weekIndex + 1} ne contient pas exactement les jours attendus.`);
    for (const [dayIndex, day] of week.days.entries()) {
      if (day.day !== dayIndex + 1 || typeof day.title !== 'string' || !day.title.trim() || day.title.length > 160
          || typeof day.focus !== 'string' || !day.focus.trim() || day.focus.length > 240
          || !Array.isArray(day.activities) || day.activities.length < 1 || day.activities.length > 5
          || day.activities.some(item => typeof item !== 'string' || !item.trim() || item.length > 300)
          || !Number.isInteger(day.estimatedMinutes) || day.estimatedMinutes < 5 || day.estimatedMinutes > 300) invalidPlan(`Le jour ${dayIndex + 1} de la semaine ${weekIndex + 1} est invalide.`);
      scheduledDays += 1;
    }
  }
  if (scheduledDays !== expectedDays) invalidPlan('Le programme généré ne respecte pas exactement la durée demandée.');

  const days = value.weeks.flatMap(week => week.days);
  const combined = normalizedText([value.goalSummary, value.strategy, ...value.weeks.map(week => week.objective), ...days.flatMap(day => [day.title, day.focus, ...day.activities])].join(' '));
  if (goal.type === 'exam') {
    const counts = goal.chapters.map(chapter => {
      const name = normalizedText(chapter.name);
      if (!name || !combined.includes(name)) invalidPlan(`Le chapitre « ${chapter.name} » n’est pas utilisé dans le programme.`);
      return { difficulty: chapter.difficulty, days: days.filter(day => normalizedText([day.title, day.focus, ...day.activities].join(' ')).includes(name)).length };
    });
    if (expectedDays >= goal.chapters.length * 2) {
      const hard = counts.filter(item => item.difficulty === 'hard').reduce((sum, item) => sum + item.days, 0);
      const easy = counts.filter(item => item.difficulty === 'easy').reduce((sum, item) => sum + item.days, 0);
      if (hard && easy && hard <= easy) invalidPlan('Les chapitres difficiles doivent recevoir plus de journées de pratique ou de révision que les chapitres faciles.');
    }
  } else if (goal.type === 'programming') {
    if (!combined.includes(normalizedText(goal.language))) invalidPlan('Le langage de programmation choisi doit apparaître dans le programme.');
  } else if (goal.type === 'language') {
    if (!combined.includes(normalizedText(goal.language))) invalidPlan('La langue choisie doit apparaître dans le programme.');
  }

  return { goalSummary: value.goalSummary.trim(), strategy: value.strategy.trim(), duration, weeks: value.weeks };
}

export function validateDocumentRequest(body = {}) {
  const attachment = validateAttachments(body.attachments);
  if (!attachment) throw badRequest('Ajoute un document valide à analyser.');
  const mode = body.mode || 'explication';
  if (!['resume', 'explication', 'exercice', 'controle'].includes(mode)) throw badRequest('Mode d’analyse invalide.');
  return { attachment, mode, prompt: typeof body.prompt === 'string' ? body.prompt.trim().slice(0, 4000) : '' };
}

function validateAttachments(attachments) {
  if (!Array.isArray(attachments) || attachments.length !== 1) return null;
  const item = attachments[0];
  if (!item || typeof item.storagePath !== 'string' || typeof item.fileName !== 'string' || typeof item.fileType !== 'string') return null;
  return { storagePath: item.storagePath, fileName: item.fileName.slice(0, 200), fileType: item.fileType, fileSize: Number(item.fileSize) || 0 };
}
