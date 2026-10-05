import { readFileSync } from 'node:fs';

const path = process.env.ORG_CONTEXT_PATH ?? new URL('../config/org-context.json', import.meta.url);

export const orgContext = JSON.parse(readFileSync(path, 'utf8'));

export const pillars = orgContext.pillars;
export const momentTypes = orgContext.momentTypes;
export const TZ = orgContext.org.timezone ?? 'Europe/London';

export const lookbackSystem = orgContext.lookbackSystem;

/** Programme week (1-based) for a manager, from the Monday their programme started. */
export function programmeWeek(startedOn, todayKey) {
  if (!startedOn) return 1;
  const days = (Date.parse(todayKey) - Date.parse(startedOn)) / 86_400_000;
  return Math.max(1, Math.floor(days / 7) + 1);
}

export function pillarById(id) {
  return pillars.find((p) => p.id === id);
}

export function systemById(pillarId, systemId) {
  return pillarById(pillarId)?.systems.find((s) => s.id === systemId);
}
