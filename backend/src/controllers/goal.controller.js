import { completeGoalTaskForUser, deleteCurrentGoal, getCurrentGoal, initializeGoalProgress, saveCurrentGoal, saveStudyPlan } from '../services/firestore.service.js';
import { generateGoalChatResponse, generateGoalProgram } from '../services/nvidia.service.js';
import { goalProgramOutputLimit } from '../config/goal.js';
import { buildGoalChatPrompt, buildGoalContext, buildGoalProgramPrompt } from '../utils/goalPrompt.js';
import { badRequest } from '../utils/errors.js';
import { goalDurationInDays, validateGoal, validateStudyPlan } from '../utils/validation.js';
import { calculateGoalProgress } from '../utils/goalProgress.js';

export async function generateGoal(req, res) {
  const goal = validateGoal(req.body.goal || req.body);
  const goalContext = buildGoalContext(goal);
  const durationDays = goalDurationInDays(goal.duration);
  const expectedWeeks = Math.ceil(durationDays / 7);
  let feedback = '';
  let plan = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const rawPlan = await generateGoalProgram(
        buildGoalProgramPrompt(goalContext, feedback),
        goalProgramOutputLimit(durationDays)
      );
      plan = validateStudyPlan(rawPlan, expectedWeeks, durationDays, goal);
      break;
    } catch (error) {
      if (!['GOAL_PLAN_INVALID', 'AI_INVALID_GOAL_JSON'].includes(error.code) || attempt === 1) throw error;
      feedback = error.message;
    }
  }
  const progress = await saveStudyPlan(req.user.uid, plan, goal);
  res.json({ success: true, goal, program: plan, progress });
}

export async function getGoal(req, res) {
  const goal = await initializeGoalProgress(req.user.uid);
  res.json({ success: true, goal });
}

export async function deleteGoal(req, res) {
  await deleteCurrentGoal(req.user.uid);
  res.json({ success: true });
}

export async function updateGoal(req, res) {
  const goal = validateGoal(req.body.goal || req.body);
  const saved = await saveCurrentGoal(req.user.uid, goal);
  res.json({ success: true, goal: saved });
}

export async function goalChat(req, res) {
  const message = typeof req.body.message === 'string' ? req.body.message.trim() : '';
  if (!message || message.length > 4000) throw badRequest('Écris un message de 1 à 4 000 caractères.');
  const quizContext = typeof req.body.quizContext === 'string' ? req.body.quizContext.trim().slice(0, 4000) : '';
  const goal = await getCurrentGoal(req.user.uid);
  if (!goal) throw badRequest('Crée un objectif avant de discuter avec Goal AI.');
  const progress = goal.generatedPlan
    ? (goal.progress?.taskStatuses && Array.isArray(goal.progress.days) && Array.isArray(goal.progress.weeks)
      ? goal.progress
      : calculateGoalProgress(goal.generatedPlan, goal.progress?.taskStatuses))
    : null;
  const response = await generateGoalChatResponse(buildGoalChatPrompt(buildGoalContext(goal, progress), goal.generatedPlan, message, quizContext));
  res.json({ success: true, message: { role: 'assistant', content: response, timestamp: new Date().toISOString() } });
}

export async function completeTask(req, res) {
  if (typeof req.params.taskId !== 'string' || req.params.taskId.length > 128) throw badRequest('Identifiant de tâche invalide.');
  const progress = await completeGoalTaskForUser(req.user.uid, req.params.taskId);
  res.json({ success: true, progress });
}
