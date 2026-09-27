import { AppError } from './errors.js';

function planTasks(plan) {
  return (plan?.weeks || []).flatMap(week => (week.days || []).map(day => ({
    week: week.week,
    day: day.day,
    title: day.title,
    focus: day.focus,
    activities: (day.activities || []).map((title, index) => ({
      id: `week-${week.week}-day-${day.day}-task-${index + 1}`,
      title: String(title)
    }))
  })));
}

export function calculateGoalProgress(plan, storedStatuses = {}) {
  const days = planTasks(plan);
  const activeDayIndex = days.findIndex(day => day.activities.some(task => storedStatuses[task.id] !== 'completed'));
  const tasks = {};
  const dayProgress = days.map((day, index) => {
    let firstIncomplete = true;
    const activities = day.activities.map(task => {
      let status = 'completed';
      if (storedStatuses[task.id] !== 'completed') {
        if (index < activeDayIndex) status = 'completed';
        else if (index > activeDayIndex) status = 'locked';
        else if (firstIncomplete) { status = 'in_progress'; firstIncomplete = false; }
        else status = 'available';
      }
      tasks[task.id] = status;
      return { ...task, status };
    });
    const completed = activities.filter(task => task.status === 'completed').length;
    const total = activities.length;
    return { week: day.week, day: day.day, title: day.title, focus: day.focus, total, completed, percentage: total ? Math.round(completed / total * 100) : 0, tasks: activities };
  });

  const weeks = (plan?.weeks || []).map(week => {
    const weekDays = dayProgress.filter(day => day.week === week.week);
    const total = weekDays.reduce((sum, day) => sum + day.total, 0);
    const completed = weekDays.reduce((sum, day) => sum + day.completed, 0);
    return { week: week.week, objective: week.objective, total, completed, percentage: total ? Math.round(completed / total * 100) : 0 };
  });
  const total = dayProgress.reduce((sum, day) => sum + day.total, 0);
  const completed = dayProgress.reduce((sum, day) => sum + day.completed, 0);
  const active = activeDayIndex < 0 ? null : dayProgress[activeDayIndex];
  const currentWeek = active?.week ?? null;
  const weekly = weeks.find(week => week.week === currentWeek) || null;

  return {
    taskStatuses: tasks,
    currentWeek,
    currentDay: active?.day ?? null,
    dailyProgress: active?.percentage ?? 100,
    weeklyProgress: weekly?.percentage ?? 100,
    overallProgress: total ? Math.round(completed / total * 100) : 0,
    completedTasks: completed,
    remainingTasks: Math.max(0, total - completed),
    totalTasks: total,
    weeks,
    days: dayProgress
  };
}

export function completeGoalTask(plan, storedStatuses, taskId) {
  const progress = calculateGoalProgress(plan, storedStatuses);
  const status = progress.taskStatuses[taskId];
  if (!status) throw new AppError(404, 'Cette tâche ne fait pas partie du programme.', 'GOAL_TASK_NOT_FOUND');
  if (status === 'locked') throw new AppError(409, 'Termine d’abord les tâches du jour en cours.', 'GOAL_TASK_LOCKED');
  return calculateGoalProgress(plan, { ...progress.taskStatuses, [taskId]: 'completed' });
}
