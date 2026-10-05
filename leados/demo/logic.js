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
      const times = overran === 1 ? 'once' : overran === 2 ? 'twice' : `${overran} times`;
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

  /** This week per system: every moment that happened, Feedback follow-ups, the energy check-in and the look-back. */
  function systemWeekCounts(summary, { energy = null, lookbackSaved = false } = {}) {
    const counts = Object.fromEntries(Object.keys(SYS).map((k) => [k, 0]));
    for (const m of summary.moments) counts[TYPES[m.type].sys] += 1;
    counts.S6 += feedbackMoments(summary).length;
    if (energy) counts.S0 += 1;
    if (lookbackSaved) counts.S9 += 1;
    return counts;
  }

  /** This week per pillar: always the sum of its two systems, so the numbers add up. */
  function pillarWeekCounts(summary, extras) {
    const sys = systemWeekCounts(summary, extras);
    return Object.fromEntries(TIERS.map((t) => [t.id, t.systems.reduce((n, s) => n + sys[s.code], 0)]));
  }

  /** Short form of a calendar title for a one-line hint: "Career chat: Aisha" -> "Career chat". */
  const shortTitle = (title) => title.split(':')[0].trim();

  /** The next thing for a pillar still to come today (not yet started), or the Friday look-back. */
  function pillarNextUp(pillarId, todayEvents, now, { lookbackAt = null, lookbackSaved = false } = {}) {
    const options = todayEvents
      .filter((e) => e.type && e.start > now && pillarOf(e.type).id === pillarId)
      .map((e) => ({ title: shortTitle(e.title), time: e.start }));
    if (pillarId === pillarOf('lookback').id && lookbackAt && !lookbackSaved && lookbackAt > now) {
      options.push({ title: 'Look-back', time: lookbackAt });
    }
    options.sort((a, b) => (a.time < b.time ? -1 : 1));
    return options[0] ?? null;
  }

  /** The count line under a pillar name. Never "0 this week". */
  const pillarCountLine = (count, next) => (count > 0 ? `${count} this week` : next ? `Next: ${next.title} at ${next.time}` : '');

  /**
   * How to draw a trend with missing weeks: solid between neighbouring known weeks, dashed across a gap
   * between known weeks, and nothing that dangles off the last known point.
   */
  function sparkSegments(values) {
    const points = values.map((v, i) => (v == null ? null : i)).filter((i) => i !== null);
    const solid = [], dashed = [];
    for (let k = 1; k < points.length; k++) (points[k] - points[k - 1] === 1 ? solid : dashed).push([points[k - 1], points[k]]);
    return { points, solid, dashed };
  }

  /**
   * Cohort self-ratings per pillar per pilot week: the average, or null when fewer than minRaters rated
   * it that week (so no individual can be singled out). extra adds the demo manager's saved look-back.
   */
  function cohortSelfRatings(weeks, { minRaters = 5, extra = null } = {}) {
    const out = Object.fromEntries(TIERS.map((t) => [t.id, []]));
    for (const w of weeks) {
      for (const t of TIERS) {
        const ratings = [...(w.ratings[t.id] ?? [])];
        if (extra && extra.week === w.week && extra.scores[t.id] != null) ratings.push(extra.scores[t.id]);
        const n = ratings.length;
        const avg = n >= minRaters ? Math.round((ratings.reduce((a, b) => a + b, 0) / n) * 10) / 10 : null;
        out[t.id].push({ week: w.week, avg, n });
      }
    }
    return out;
  }

  /** Use-based depth, never calendar weeks: Performance prompts deepen once Feedback is a habit. */
  const promptDepth = (code, uses) => (code === 'S7' && (uses.S6 ?? 0) >= 3 ? 'deeper' : 'starter');

  /**
   * A deeper set adds to the starter card, never replaces its humanity: same focus line, at least one
   * question about the person ('person') plus consequence or process questions ('process').
   */
  const isValidDeeper = (prep) => Boolean(prep.deeper
    && prep.deeper.focus === prep.focus
    && prep.deeper.questions.some((q) => q.kind === 'person')
    && prep.deeper.questions.some((q) => q.kind === 'process'));

  const DEEPER_META = 'Building on your feedback habit';

  /** The card to show: the starter set, or the deeper set (with a quiet meta line) when depth allows. */
  function prepCard(prep, depth) {
    if (depth === 'deeper' && isValidDeeper(prep)) {
      return { focus: prep.deeper.focus, questions: prep.deeper.questions.map((q) => q.text), meta: DEEPER_META };
    }
    return { focus: prep.focus, questions: prep.questions, meta: null };
  }

  /** The Claude prompt for a prep card. Questions only, and always one about the person. */
  function prepPrompt(event, { orgBlock, depth = 'starter' }) {
    const sys = SYS[TYPES[event.type].sys];
    const deeper = depth === 'deeper'
      ? '\nThis manager gives feedback regularly, so go one level deeper on consequence and process, but keep the person question.'
      : '';
    return `You write prep cards for LeadOS, a read-only Google Calendar add-on that helps first-time and frontline managers lead well in moments already on their calendar. A prep card is read in the two minutes before a meeting.

Rules: ask questions; never write a script, talking points or words for the manager to say. Give one short focus line (under 15 words) and exactly three questions, each under 25 words, concrete to this moment. At least one question must be about the person, not the process: how they are, or what might be going on for them. Use the organisation's values or standards, in their own words, only where they genuinely apply. Don't invent facts about anyone. British English. No emoji.${deeper}

${orgBlock}

Moment: ${TYPES[event.type].label}, pillar ${pillarOf(event.type).name}, system ${sys.code} ${sys.name}.
Calendar title: ${event.title}
Time: Friday ${event.start}\u2013${event.end}. Attendees including the manager: ${event.n}.
${event.context ? `From the manager's own earlier capture: ${event.context.replace(/<[^>]+>/g, '')}` : 'No earlier captures for this meeting.'}

Reply with only JSON: {"focus": "...", "questions": ["...", "...", "..."]}`;
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
    TIERS, TIER, SYS, TYPES, RATING, NEXT, WEEKDAYS,
    pillarOf, classify, momentStatus, nextMomentId, needsNextStep, isCaptured, rowStatus,
    weekSummary, feedbackMoments, reflectionQuestions, systemUses, systemWeekCounts, pillarWeekCounts, promptDepth,
    isValidDeeper, prepCard, prepPrompt, pillarNextUp, pillarCountLine, sparkSegments, cohortSelfRatings, hrSnapshot, esc,
  };
})();
