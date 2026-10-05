// Weekly look-back, pillar progress and HR aggregates. Everything here is computed from captures.
import { momentTypes, pillars, lookbackSystem, programmeWeek } from './org.js';
import { momentsForWeek, getLookback, allLookbacks, allCapturedMoments, weeklyUsage, lookbackCount, getManager } from './store.js';
import { addDays, dayKey, weekStart } from './time.js';

// ---- weekly look-back -----------------------------------------------------

export function weekSummary(managerId, monday, nowIso = new Date().toISOString()) {
  const moments = momentsForWeek(managerId, monday).filter((m) => m.start_utc <= nowIso);
  const captured = moments.filter((m) => m.rating);
  const byPillar = Object.fromEntries(pillars.map((p) => [p.id, { moments: 0, captured: 0, well: 0, mixed: 0, hard: 0 }]));
  for (const m of moments) {
    const b = byPillar[momentTypes[m.moment_type].pillar];
    b.moments++;
    if (m.rating) { b.captured++; b[m.rating]++; }
  }
  return {
    monday,
    moments,
    captured,
    openFollowUps: captured.filter((m) => m.next_step === 'follow_up' || m.next_step === 'revisit'),
    hard: captured.filter((m) => m.rating === 'hard'),
    notes: captured.filter((m) => m.note),
    byPillar,
    lookback: getLookback(managerId, monday),
    previousLookback: getLookback(managerId, addDays(monday, -7)),
  };
}

/** Reflection questions drawn from the week's captures. Questions only; the manager does the thinking. */
export function reflectionQuestions(summary) {
  const qs = [];
  if (summary.hard.length) {
    const first = summary.hard[0];
    qs.push(`"${first.title}" felt hard. What would you do differently if it happened again on Monday?`);
  }
  if (summary.openFollowUps.length) {
    qs.push(`You marked ${summary.openFollowUps.length} moment${summary.openFollowUps.length > 1 ? 's' : ''} to follow up. Which one matters most, and when will you do it?`);
  }
  const momentPillars = new Set(Object.values(momentTypes).map((t) => t.pillar));
  const quiet = pillars.filter((p) => momentPillars.has(p.id) && summary.byPillar[p.id].moments === 0);
  if (quiet.length) {
    qs.push(`Nothing this week touched ${quiet.map((p) => p.name).join(' or ')}. Is that a choice or a gap?`);
  }
  if (summary.previousLookback?.try_next) {
    qs.push(`Last week you said you'd try: "${summary.previousLookback.try_next.replace(/[.!\s]+$/, '')}". How did it go?`);
  }
  if (summary.captured.length < summary.moments.length / 2) {
    qs.push('Fewer than half your moments were captured. What got in the way?');
  }
  qs.push('Which moment this week are you proudest of, and why?');
  return qs.slice(0, 3);
}

// ---- pillar view ----------------------------------------------------------

/**
 * The operating stack for one manager: per tier, captured moments, share that went well and weekly
 * self-ratings; per system, its unlock state for the manager's programme week and how often it was used.
 */
export function pillarProgress(managerId, weeks = 6) {
  const today = dayKey();
  const thisMonday = weekStart(today);
  const mondays = Array.from({ length: weeks }, (_, i) => addDays(thisMonday, -7 * (weeks - 1 - i)));
  const captured = allCapturedMoments(managerId);
  const lookbackRows = allLookbacks(managerId);
  const lookbacks = Object.fromEntries(lookbackRows.map((l) => [l.week_start, l.pillar_scores]));
  const week = programmeWeek(getManager(managerId)?.started_on, today);

  const tiers = pillars.map((p) => {
    const mine = captured.filter((c) => momentTypes[c.moment_type].pillar === p.id);
    const systems = p.systems.map((s) => {
      const unlockWeek = s.unlockWeek ?? 1;
      const isLookback = lookbackSystem?.pillar === p.id && lookbackSystem?.system === s.id;
      return {
        ...s,
        unlockWeek,
        unlocked: week >= unlockWeek,
        uses: isLookback ? lookbackRows.length : mine.filter((c) => momentTypes[c.moment_type].system === s.id).length,
        unit: isLookback ? 'look-back' : 'moment',
      };
    });
    return {
      ...p,
      systems,
      captured: mine.length,
      wellShare: mine.length ? mine.filter((c) => c.rating === 'well').length / mine.length : null,
      selfRatings: mondays.map((m) => ({ week: m, score: lookbacks[m]?.[p.id] ?? null })),
    };
  });
  return { week, tiers };
}

// ---- HR view: aggregates only ---------------------------------------------

// Below this many managers in a group, the HR view shows no breakdown (prevents identifying individuals).
export const MIN_GROUP = 5;

// Mocked cohort so the HR stub looks like a real pilot. Deterministic per week.
function mockCohort(monday, size = 23) {
  let seed = [...monday].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);
  const rand = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32);
  const types = Object.keys(momentTypes);
  const weights = [0.45, 0.3, 0.15, 0.1];
  return Array.from({ length: size }, () => {
    const active = rand() < 0.78;
    const n = active ? 1 + Math.floor(rand() * 7) : 0;
    const moments = Array.from({ length: n }, () => {
      let r = rand(), i = 0;
      while (r > weights[i] && i < weights.length - 1) r -= weights[i++];
      return types[i];
    });
    return { moments, lookback: active && rand() < 0.55 };
  });
}

export function hrOverview(weeks = 6) {
  const thisMonday = weekStart(dayKey());
  const mondays = Array.from({ length: weeks }, (_, i) => addDays(thisMonday, -7 * (weeks - 1 - i)));

  const series = mondays.map((monday) => {
    // Real managers: a moment counts as "used" if prep was opened or it was captured.
    const real = {};
    for (const row of weeklyUsage(monday)) {
      if (!(row.prepped || row.captured)) continue;
      (real[row.manager_id] ??= []).push(row.moment_type);
    }
    const cohort = [...mockCohort(monday), ...Object.values(real).map((m) => ({ moments: m }))];
    const managers = cohort.length;
    const active = cohort.filter((c) => c.moments.length > 0);
    const byType = Object.fromEntries(Object.keys(momentTypes).map((t) => [t, 0]));
    for (const c of cohort) for (const t of c.moments) byType[t]++;
    const totalMoments = Object.values(byType).reduce((a, b) => a + b, 0);
    const lookbacks = cohort.filter((c) => c.lookback).length + lookbackCount(monday);
    return {
      monday,
      managers,
      active: active.length,
      threePlus: cohort.filter((c) => c.moments.length >= 3).length,
      avgMoments: active.length ? totalMoments / active.length : 0,
      lookbackRate: managers ? Math.min(1, lookbacks / managers) : 0,
      byPillar: pillars.map((p) => ({
        id: p.id,
        name: p.name,
        share: totalMoments ? Object.entries(byType).filter(([t]) => momentTypes[t].pillar === p.id).reduce((s, [, n]) => s + n, 0) / totalMoments : 0,
      })),
    };
  });

  return { series, current: series.at(-1), groupTooSmall: series.at(-1).managers < MIN_GROUP };
}
