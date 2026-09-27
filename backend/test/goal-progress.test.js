import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateGoalProgress, completeGoalTask } from '../src/utils/goalProgress.js';

const plan = {
  weeks: [
    { week: 1, objective: 'Comprendre les bases', days: [
      { day: 1, title: 'Variables', focus: 'Stocker des valeurs', activities: ['Lire la leçon', 'Faire un exercice'] },
      { day: 2, title: 'Conditions', focus: 'Choisir une action', activities: ['Étudier SI/SINON'] }
    ] },
    { week: 2, objective: 'Pratiquer', days: [
      { day: 1, title: 'Révision', focus: 'Réutiliser les notions', activities: ['Résoudre un problème'] }
    ] }
  ]
};

test('calcule séparément les progressions globale, hebdomadaire et quotidienne', () => {
  const progress = calculateGoalProgress(plan);
  assert.equal(progress.overallProgress, 0);
  assert.equal(progress.weeklyProgress, 0);
  assert.equal(progress.dailyProgress, 0);
  assert.equal(progress.currentWeek, 1);
  assert.equal(progress.currentDay, 1);
  assert.equal(progress.taskStatuses['week-1-day-1-task-1'], 'in_progress');
  assert.equal(progress.taskStatuses['week-1-day-1-task-2'], 'available');
  assert.equal(progress.taskStatuses['week-1-day-2-task-1'], 'locked');
});

test('débloque le jour suivant et recalcule les trois progressions après une tâche terminée', () => {
  const first = completeGoalTask(plan, {}, 'week-1-day-1-task-1');
  assert.equal(first.days[0].percentage, 50);
  assert.equal(first.weeks[0].percentage, 33);
  assert.equal(first.overallProgress, 25);
  assert.equal(first.taskStatuses['week-1-day-1-task-2'], 'in_progress');
  const afterReload = calculateGoalProgress(plan, first.taskStatuses);
  assert.equal(afterReload.dailyProgress, first.dailyProgress);
  assert.equal(afterReload.weeklyProgress, first.weeklyProgress);
  assert.equal(afterReload.overallProgress, first.overallProgress);
  assert.deepEqual(afterReload.taskStatuses, first.taskStatuses);

  const second = completeGoalTask(plan, first.taskStatuses, 'week-1-day-1-task-2');
  assert.equal(second.currentWeek, 1);
  assert.equal(second.currentDay, 2);
  assert.equal(second.taskStatuses['week-1-day-2-task-1'], 'in_progress');
  assert.equal(second.days[0].percentage, 100);
});

test('refuse qu’une tâche verrouillée soit terminée avant le jour actif', () => {
  assert.throws(() => completeGoalTask(plan, {}, 'week-1-day-2-task-1'), { code: 'GOAL_TASK_LOCKED', status: 409 });
});

test('reconnaît la fin complète du programme à 100%', () => {
  let progress = calculateGoalProgress(plan);
  const taskIds = progress.days.flatMap(day => day.tasks.map(task => task.id));
  for (const taskId of taskIds) {
    if (progress.taskStatuses[taskId] !== 'locked') progress = completeGoalTask(plan, progress.taskStatuses, taskId);
  }
  assert.equal(progress.overallProgress, 100);
  assert.equal(progress.remainingTasks, 0);
  assert.equal(progress.currentWeek, null);
  assert.ok(Object.values(progress.taskStatuses).every(status => status === 'completed'));
});
