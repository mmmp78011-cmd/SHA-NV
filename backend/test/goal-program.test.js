import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGoalChatPrompt, buildGoalContext, buildGoalProgramPrompt } from '../src/utils/goalPrompt.js';
import { goalDurationInDays, validateStudyPlan } from '../src/utils/validation.js';

function makePlan(goal, topicsForDay) {
  const totalDays = goalDurationInDays(goal.duration);
  const weeks = [];
  for (let week = 0; week < Math.ceil(totalDays / 7); week += 1) {
    const days = [];
    const count = Math.min(7, totalDays - week * 7);
    for (let day = 0; day < count; day += 1) {
      const topic = topicsForDay(week * 7 + day);
      days.push({
        day: day + 1,
        title: `Pratique ${topic}`,
        focus: topic,
        activities: [`Étudier ${topic}`, `Faire un exercice sur ${topic}`],
        estimatedMinutes: 60
      });
    }
    weeks.push({ week: week + 1, objective: `Progresser sur ${goal.goalTitle}`, days });
  }
  return {
    goalSummary: goal.goalTitle,
    strategy: `Programme progressif pour ${goal.goalTitle}`,
    duration: goal.duration,
    weeks
  };
}

const examGoal = {
  type: 'exam',
  goalTitle: 'Réussir mon examen',
  description: 'Je veux surtout faire des exercices.',
  level: 'Terminale',
  duration: { value: 7, unit: 'days' },
  chapters: [
    { name: 'Algèbre', difficulty: 'easy' },
    { name: 'Probabilités', difficulty: 'medium' },
    { name: 'Fonctions', difficulty: 'hard' }
  ]
};

test('7-day exam plan has exactly seven scheduled days and rejects missing or extra days', () => {
  const plan = makePlan(examGoal, index => index === 0 ? 'Algèbre' : index === 1 ? 'Probabilités' : 'Fonctions');
  const valid = validateStudyPlan(plan, 1, 7, examGoal);
  assert.equal(valid.weeks.flatMap(week => week.days).length, 7);
  const short = structuredClone(plan);
  short.weeks[0].days.pop();
  assert.throws(() => validateStudyPlan(short, 1, 7, examGoal), /exactement les jours attendus/);
  const long = structuredClone(plan);
  long.weeks[0].days.push({ ...long.weeks[0].days[6], day: 8 });
  assert.throws(() => validateStudyPlan(long, 1, 7, examGoal), /exactement les jours attendus/);
});

test('hard exam chapter receives more planned days than an easy chapter', () => {
  const weighted = makePlan(examGoal, index => index === 0 ? 'Algèbre' : index === 1 ? 'Probabilités' : 'Fonctions');
  assert.doesNotThrow(() => validateStudyPlan(weighted, 1, 7, examGoal));
  const evenlySplit = makePlan(examGoal, index => ['Algèbre', 'Probabilités', 'Fonctions'][index % 3]);
  assert.throws(() => validateStudyPlan(evenlySplit, 1, 7, examGoal), /chapitres difficiles/);
});

test('different descriptions produce different prompts and the supplied preferences are included', () => {
  const practiceFirst = buildGoalContext({ ...examGoal, description: 'Je préfère beaucoup d’exercices guidés.' });
  const reviewFirst = buildGoalContext({ ...examGoal, description: 'Je suis déjà à l’aise et veux surtout réviser avec des quiz.' });
  const firstPrompt = buildGoalProgramPrompt(practiceFirst);
  const secondPrompt = buildGoalProgramPrompt(reviewFirst);
  assert.notEqual(firstPrompt, secondPrompt);
  assert.match(firstPrompt, /beaucoup d’exercices guidés/);
  assert.match(secondPrompt, /surtout réviser avec des quiz/);
});

test('beginner Python plan covers exactly 30 days and the prompt requires a fundamentals-first progression', () => {
  const goal = { type: 'programming', goalTitle: 'Apprendre Python', description: 'Je débute.', language: 'Python', level: 'beginner', duration: { value: 30, unit: 'days' } };
  const context = buildGoalContext(goal);
  assert.equal(context.durationDays, 30);
  assert.match(buildGoalProgramPrompt(context), /un débutant commence par les fondamentaux/i);
  const plan = makePlan(goal, () => 'Python, variables et bases');
  assert.equal(validateStudyPlan(plan, 5, 30, goal).weeks.flatMap(week => week.days).length, 30);
  assert.equal(plan.weeks[4].days.length, 2);
  assert.match(plan.weeks[0].days[0].focus, /variables et bases/);
});

test('English A2 plan for two months contains about eight weeks with an exact day count', () => {
  const goal = { type: 'language', goalTitle: 'Parler anglais en voyage', description: 'Je veux surtout converser.', language: 'Anglais', level: 'A2', targetLevel: 'B1', duration: { value: 2, unit: 'months' } };
  const context = buildGoalContext(goal);
  assert.equal(context.durationDays, 56);
  assert.match(buildGoalProgramPrompt(context), /niveau actuel et le niveau cible/i);
  const plan = makePlan(goal, () => 'Anglais A2 conversation');
  assert.equal(validateStudyPlan(plan, 8, 56, goal).weeks.flatMap(week => week.days).length, 56);
  assert.equal(plan.weeks.length, 8);
  assert.equal(plan.weeks[7].days.length, 7);
});

test('a supplied weakness and practice preference are carried into Goal AI context', () => {
  const goal = {
    type: 'programming',
    goalTitle: 'Réussir mon examen de programmation',
    description: 'Je maîtrise les variables et conditions, mais les fonctions et tableaux me posent problème.',
    additionalDetails: 'Je veux surtout m’entraîner avec des exercices.',
    language: 'Python',
    level: 'beginner',
    duration: { value: 30, unit: 'days' }
  };
  const context = buildGoalContext(goal);
  const prompt = buildGoalProgramPrompt(context);
  assert.match(prompt, /fonctions et tableaux me posent problème/);
  assert.match(prompt, /surtout m’entraîner avec des exercices/);
  assert.match(prompt, /un débutant commence par les fondamentaux/i);
});

test('Goal AI coaching context includes application progress and keeps the plan stable', () => {
  const progress = {
    currentWeek: 2, currentDay: 3, dailyProgress: 50, weeklyProgress: 70, overallProgress: 60,
    completedTasks: 12, remainingTasks: 8, totalTasks: 20,
    weeks: [{ week: 2, objective: 'Maîtriser les conditions', completed: 7, total: 10 }],
    days: [{ week: 2, day: 3, total: 4, completed: 2, tasks: [{ title: 'Exercice guidé', status: 'in_progress' }] }]
  };
  const context = buildGoalContext(examGoal, progress);
  assert.equal(context.progress.weeklyObjective, 'Maîtriser les conditions');
  assert.equal(context.progress.currentTask.title, 'Exercice guidé');
  assert.equal(context.progress.remainingWeeklyTasks, 3);
  const prompt = buildGoalChatPrompt(context, makePlan(examGoal, index => index ? 'Probabilités' : 'Algèbre'), 'Aide-moi');
  assert.match(prompt, /Never regenerate, restart, reorder/);
  assert.match(prompt, /application-calculated progress/);
  assert.match(prompt, /"weeklyProgress":70/);
});
