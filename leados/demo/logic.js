// LeadOS demo: the pure rules behind the calendar add-on mockup.
// A classic script that sets globalThis.LeadOSLogic, so the page can load it with <script src>
// and the Node tests can import it for its side effect. Unit tests: test/demo-logic.test.js.
(() => {
  // The canonical framework: five pillars, ten systems. Managers see pillars; systems stay underneath.
  const TIERS = [
    { id: 'lead-yourself', name: 'Lead Yourself', summary: 'Your own energy and decisions, before you lead anyone else.',
      systems: [{ code: 'S0', name: 'Energy' }, { code: 'S1', name: 'Decisions' }] },
    { id: 'set-standard', name: 'Set the Standard', summary: 'The team knows what good looks like and what matters most.',
      systems: [{ code: 'S2', name: 'Clarity' }, { code: 'S3', name: 'Planning' }] },
    { id: 'develop-people', name: 'Develop People', summary: 'Each person hears what they need to and grows through regular 1:1s.',
      systems: [{ code: 'S4', name: 'Communication' }, { code: 'S5', name: '1:1s' }] },
    { id: 'hold-standard', name: 'Hold the Standard', summary: 'Feedback is timely; performance gaps are dealt with early and fairly.',
      systems: [{ code: 'S6', name: 'Feedback' }, { code: 'S7', name: 'Performance' }] },
    { id: 'sustain-grow', name: 'Sustain & Grow', summary: 'The team keeps getting better and you keep learning.',
      systems: [{ code: 'S8', name: 'Growth' }, { code: 'S9', name: 'Reflection' }] },
  ];

  const SYS = Object.fromEntries(TIERS.flatMap((t) => t.systems.map((s) => [s.code, { ...s, tier: t.id }])));
  const TIER = Object.fromEntries(TIERS.map((t) => [t.id, t]));

  // Feedback (S6) has no moment type of its own: it comes from a follow-up after a hard or mixed moment.
  const TYPES = {
    energy: { label: 'Energy check-in', sys: 'S0' },
    decision: { label: 'Decision block', sys: 'S1' },
    clarity: { label: 'Goals and kick-offs', sys: 'S2' },
    planning: { label: 'Planning block', sys: 'S3' },
    team: { label: 'Team meeting', sys: 'S4' },
    one_to_one: { label: '1:1', sys: 'S5' },
    difficult: { label: 'Difficult conversation', sys: 'S7' },
    career: { label: 'Career conversation', sys: 'S8' },
    lookback: { label: 'Friday look-back', sys: 'S9' },
  };
  const pillarOf = (type) => TIER[SYS[TYPES[type].sys].tier];

  const RATING = { well: 'Went well', mixed: 'Mixed', hard: 'Hard' };
  const NEXT = { none: 'Nothing', follow_up: 'Follow up', revisit: 'Revisit' };
  const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

  // ---- classification: the calendar title and attendee count, nothing else ----
  const RULES = [
    { type: null, title: /\b(lunch|ooo|out of office|holiday|annual leave|commute|gym|dentist|doctor|travel|interview)\b/i },
    { type: 'difficult', max: 4, title: /\b(difficult|hard conversation|tough|performance (review|concern|chat|conversation)|pip|improvement plan|concerns?|disciplinary|grievance|investigation|absence (review|meeting)|probation)\b/i },
    { type: 'decision', max: 1, title: /\b(decide|decision)\b/i },
    { type: 'career', max: 3, title: /\b(career|development (chat|conversation)|growth (chat|conversation)|promotion|pdp)\b/i },
    { type: 'clarity', min: 3, title: /\b(kick-?off|goals?|okrs?|objectives)\b/i },
    { type: 'one_to_one', max: 2, title: /(\b1\s?(?:[:\-/]|on|to)\s?1\b|\bone[- ](?:on|to)[- ]one\b|\bcatch[- ]?up\b|\bcheck[- ]?in\b)/i },
    { type: 'planning', max: 1, title: /\b(planning|plan|priorit\w*|roadmap|focus (time|block)|prep)\b/i },
    { type: 'team', min: 3, title: /\b(team|stand[- ]?up|huddle|sync|retro\w*|all[- ]hands|town ?hall)\b/i },
  ];

  function classify(title = '', attendees = 1) {
    for (const r of RULES) {
      if (!r.title.test(title)) continue;
      if (r.max && attendees > r.max) continue;
      if (r.min && attendees < r.min) continue;
      return r.type;
    }
    return attendees === 2 ? 'one_to_one' : null;
  }

  // ---- time and status ----------------------------------------------------
  /** Times are "HH:MM" strings, which compare correctly as text. */
  function momentStatus(event, now) {
    if (event.end <= now) return 'past';
    if (event.start <= now) return 'now';
    return 'later';
  }

  function nextMomentId(events, now) {
    return events.find((e) => e.type && e.start > now)?.id ?? null;
  }

  const needsNextStep = (rating) => rating === 'mixed' || rating === 'hard';
  const isCaptured = (c) => Boolean(c?.rating && (!needsNextStep(c.rating) || c.next));

  /** What a moment row shows: 'captured' (a tick), 'now', 'next', 'ask' (a quiet "How did it go?"), or null. */
  function rowStatus(event, todayEvents, captures, now) {
    if (isCaptured(captures[event.id])) return 'captured';
    const st = momentStatus(event, now);
    if (st === 'now') return 'now';
    if (st === 'past') return 'ask';
    return event.id === nextMomentId(todayEvents, now) ? 'next' : null;
  }

  // ---- the week -----------------------------------------------------------
  /** Earlier days' moments, today's moments that have started, and any later moment already captured. */
  function weekSummary(weekItems, todayEvents, captures, now) {
    const todays = todayEvents
      .filter((e) => e.type && (e.start <= now || captures[e.id]?.rating))
      .map((e) => ({ day: 4, id: e.id, time: e.start, title: e.title, type: e.type, ...(captures[e.id] ?? {}) }));
    const moments = [...weekItems, ...todays];
    const captured = moments.filter((m) => m.rating);
    return {
      moments,
      captured,
      open: captured.filter((m) => m.next === 'follow_up' || m.next === 'revisit'),
      hard: captured.filter((m) => m.rating === 'hard'),
      well: captured.filter((m) => m.rating === 'well'),
    };
  }

  const feedbackMoments = (summary) => summary.captured.filter((m) => needsNextStep(m.rating) && m.next === 'follow_up');

  function reflectionQuestions(summary, lastTry) {
    const qs = [];
    if (summary.hard.length) {
      qs.push(`“${summary.hard[0].title}” felt hard. What would you do differently if it happened again on Monday?`);
    }
    if (lastTry) {
      const overran = summary.captured.filter((c) => /stand-up/i.test(c.title) && /ran over/i.test(c.note ?? '')).length;
      const times = overran === 1 ? 'once' : `${overran} times`;
      qs.push(`Last week you said you’d try: “${lastTry}”. ${overran ? `Stand-ups ran over ${times} this week. ` : ''}What got in the way?`);
    }
    if (summary.open.length) {
      qs.push(`You marked ${summary.open.length} moment${summary.open.length === 1 ? '' : 's'} to come back to. Which one matters most, and when will you do it?`);
    }
    if (qs.length < 3) qs.push('Which moment this week are you proudest of, and why?');
    return qs.slice(0, 3);
  }

  function systemUses(base, summary, { energy = null, lookbackSaved = false } = {}) {
    const uses = { ...base };
    for (const m of summary.captured) uses[TYPES[m.type].sys] += 1;
    uses.S6 += feedbackMoments(summary).length;
    if (energy) uses.S0 += 1;
    if (lookbackSaved) uses.S9 += 1;
    return uses;
  }

  /** Moments this week per pillar, including the energy check-in and the look-back. */
  function pillarWeekCounts(summary, { energy = null, lookbackSaved = false } = {}) {
    const counts = Object.fromEntries(TIERS.map((t) => [t.id, 0]));
    for (const m of summary.moments) counts[pillarOf(m.type).id] += 1;
    if (energy) counts['lead-yourself'] += 1;
    if (lookbackSaved) counts['sustain-grow'] += 1;
    return counts;
  }

  /** Use-based depth, never calendar weeks: Performance prompts deepen once Feedback is a habit. */
  const promptDepth = (code, uses) => (code === 'S7' && (uses.S6 ?? 0) >= 3 ? 'deeper' : 'starter');

  /** This week's cohort numbers with the demo manager counted in. Aggregates only. */
  function hrSnapshot(weeks, managerCapturedCount) {
    const cur = weeks.at(-1);
    return {
      ...cur,
      active: cur.active + (managerCapturedCount > 0 ? 1 : 0),
      three: cur.three + (managerCapturedCount >= 3 ? 1 : 0),
    };
  }

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  globalThis.LeadOSLogic = {
    TIERS, TIER, SYS, TYPES, RATING, NEXT, WEEKDAYS,
    pillarOf, classify, momentStatus, nextMomentId, needsNextStep, isCaptured, rowStatus,
    weekSummary, feedbackMoments, reflectionQuestions, systemUses, pillarWeekCounts, promptDepth, hrSnapshot, esc,
  };
})();
