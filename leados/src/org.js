import { readFileSync } from 'node:fs';

const path = process.env.ORG_CONTEXT_PATH ?? new URL('../config/org-context.json', import.meta.url);

export const orgContext = JSON.parse(readFileSync(path, 'utf8'));

export const pillars = orgContext.pillars;
export const momentTypes = orgContext.momentTypes;
export const TZ = orgContext.org.timezone ?? 'Europe/London';

export const lookbackSystem = orgContext.lookbackSystem;

export function pillarById(id) {
  return pillars.find((p) => p.id === id);
}

export function systemById(pillarId, systemId) {
  return pillarById(pillarId)?.systems.find((s) => s.id === systemId);
}
