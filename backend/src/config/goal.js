export const goalConfig = Object.freeze({
  temperature: 0.25,
  chatMaxOutputTokens: 800,
  maxProgramOutputTokens: 24000,
  minProgramOutputTokens: 4096,
  tokensPerProgramDay: 150
});

export function goalProgramOutputLimit(durationDays) {
  const requested = Math.max(goalConfig.minProgramOutputTokens, durationDays * goalConfig.tokensPerProgramDay);
  return Math.min(goalConfig.maxProgramOutputTokens, requested);
}
