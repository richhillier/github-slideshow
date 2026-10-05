// LeadOS demo: the pure rules behind the calendar add-on mockup.
// A classic script that sets globalThis.LeadOSLogic, so the page can load it with <script src>
// and the Node tests can import it for its side effect. Unit tests: test/demo-logic.test.js.
(() => {
  const TIERS = [
    { id: 'lead-yourself', tier: 'S0·S1', name: 'Lead Yourself', summary: 'Manage your own energy and decisions before you lead anyone else.',
      systems: [{ code: 'S0', name: 'Energy System' }, { code: 'S1', name: 'Decision System' }] },
    { id: 'set-standard', tier: 'S2·S3', name: 'Set the Standard', summary: 'The team knows what good looks like and what matters most.',
      systems: [{ code: 'S2', name: 'Clarity System' }, { code: 'S3', name: 'Planning System' }] },
    { id: 'develop-people', tier: 'S4·S5', name: 'Develop People', summary: 'Each person hears what they need to and grows through regular 1:1s.',
      systems: [{ code: 'S4', name: 'Communication System' }, { code: 'S5', name: '1:1 System' }] },
    { id: 'hold-standard', tier: 'S6·S7', name: 'Hold the Standard', summary: 'Feedback is timely; performance gaps are dealt with early and fairly.',
      systems: [{ code: 'S6', name: 'Feedback System' }, { code: 'S7', name: 'Performance System', unlock: 6 }] },
    { id: 'grow-sustain', tier: 'S8·S9', name: 'Grow & Sustain', summary: 'The team keeps getting better and the manager keeps learning.',
      systems: [{ code: 'S8', name: 'Growth System', unlock: 10 }, { code: 'S9', name: 'Reflection System', unlock: 12 }] },
  ];

  const SYS = Object.fromEntries(TIERS.flatMap((t) => t.systems.map((s) => [s.code, { ...s, tier: t.id }])));

  const TYPES = {
    one_to_one: { label: '1:1', sys: 'S5' },
    team: { label: 'Team meeting', sys: 'S4' },
    planning: { label: 'Planning block', sys: 'S3' },
    difficult: { label: 'Difficult conversation', sys: 'S6' },
  };

  const RATING = { well: 'Went well', mixed: 'Mixed', hard: 'Hard' };
  const NEXT = { none: 'Nothing', follow_up: 'Follow up', revisit: 'Revisit' };
  const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

  const isUnlocked = (system, week) => week >= (system.unlock ?? 1);

  /** Times are "HH:MM" strings, which compare correctly as text. */
  function momentStatus(event, now) {
    if (event.end <= now) return 'past';
    if (event.start <= now) return 'now';
    return 'later';
  }

  function nextMomentId(events, now) {
    return events.find((e) => e.type && e.start > now)?.id ?? null;
  }

  const isCaptured = (c) => Boolean(c && c.rating && c.next);

  /**
   * The week so far: earlier days' moments, today's moments that have started, and any later
   * moment the manager has already captured.
   */
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
      qs.push(`You marked ${summary.open.length} moment${summary.open.length === 1 ? '' : 's'} to follow up. Which one matters most, and when will you do it?`);
    }
    if (qs.length < 3) qs.push('Which moment this week are you proudest of, and why?');
    return qs.slice(0, 3);
  }

  function systemUses(base, summary, energy) {
    const uses = { ...base };
    for (const m of summary.captured) uses[TYPES[m.type].sys] += 1;
    if (energy) uses.S0 += 1;
    return uses;
  }

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
    TIERS, SYS, TYPES, RATING, NEXT, WEEKDAYS,
    isUnlocked, momentStatus, nextMomentId, isCaptured, weekSummary, reflectionQuestions, systemUses, hrSnapshot, esc,
  };
})();
