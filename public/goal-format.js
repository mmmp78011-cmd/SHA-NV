function removeRepeatedLabel(value, expression) {
  let cleaned = String(value || '').trim();
  let previous;
  while (cleaned !== previous) {
    previous = cleaned;
    cleaned = cleaned.replace(expression, '').trim();
  }
  return cleaned;
}

export function formatProgramMarkdown(plan) {
  const durationValue = Number(plan.duration?.value) || 0;
  const durationUnit = plan.duration?.unit === 'days' ? (durationValue > 1 ? 'jours' : 'jour')
    : plan.duration?.unit === 'weeks' ? (durationValue > 1 ? 'semaines' : 'semaine')
      : plan.duration?.unit === 'months' ? 'mois' : plan.duration?.unit || '';
  const sections = [
    `## 🎯 Objectif\n\n${removeRepeatedLabel(plan.goalSummary, /^(?:🎯\s*)?(?:objectif\s*:?)\s*/i)}`,
    durationValue ? `⏱️ **Durée :** ${durationValue} ${durationUnit}` : '',
    plan.strategy ? `### 📌 Stratégie\n\n${removeRepeatedLabel(plan.strategy, /^(?:📌\s*)?(?:stratégie\s*:?)\s*/i)}` : ''
  ];

  for (const week of plan.weeks) {
    const weekObjective = removeRepeatedLabel(
      removeRepeatedLabel(week.objective, /^\s*(?:📆\s*)?(?:semaine\s+\d+\s*[:—–-]?\s*)/i),
      /^\s*(?:🎯\s*)?(?:objectif\s*:?)\s*/i
    );
    const weekSection = [`## 📆 Semaine ${week.week}`, weekObjective ? `**🎯 Objectif**\n\n${weekObjective}` : ''];
    for (const day of week.days) {
      const title = removeRepeatedLabel(day.title, /^\s*(?:📅\s*)?(?:jour\s+\d+\s*[:—–-]?\s*)/i);
      const focus = removeRepeatedLabel(day.focus, /^\s*(?:🎯\s*)?(?:objectif\s*:?)\s*/i);
      const activities = day.activities.map(activity => `- ${String(activity).replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '')}`).join('\n');
      weekSection.push([
        `### 📅 Jour ${day.day}${title ? ` — ${title}` : ''}`,
        `⏱️ **Durée : ${day.estimatedMinutes} min**`,
        focus && focus.toLocaleLowerCase() !== title.toLocaleLowerCase() ? `**🎯 Objectif**\n\n${focus}` : '',
        activities ? `**📚 Activités**\n\n${activities}` : ''
      ].filter(Boolean).join('\n\n'));
    }
    sections.push(weekSection.filter(Boolean).join('\n\n'), '---');
  }
  if (sections.at(-1) === '---') sections.pop();
  return sections.filter(Boolean).join('\n\n');
}
