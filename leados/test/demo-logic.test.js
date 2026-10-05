// Unit tests for demo/logic.js (the rules) and demo/scenario.js (Jordan's week).
import { test } from 'node:test';
import assert from 'node:assert/strict';

await import('../demo/logic.js');
await import('../demo/scenario.js');
const L = globalThis.LeadOSLogic;
const SC = globalThis.LeadOSScenario;

// ---- framework ---------------------------------------------------------------

test('canonical framework: five pillars in order, ten systems', () => {
  assert.deepEqual(L.TIERS.map((t) => [t.id, t.name]), [
    ['lead-yourself', 'Lead Yourself'],
    ['set-standard', 'Set the Standard'],
    ['develop-people', 'Develop People'],
    ['hold-standard', 'Hold the Standard'],
    ['sustain-grow', 'Sustain & Grow'],
  ]);
  assert.deepEqual(L.TIERS.flatMap((t) => t.systems.map((s) => `${s.code} ${s.name}`)), [
    'S0 Energy', 'S1 Decisions', 'S2 Clarity', 'S3 Planning', 'S4 Communication',
    'S5 1:1s', 'S6 Feedback', 'S7 Performance', 'S8 Growth', 'S9 Reflection',
  ]);
  assert.equal(L.SYS.S5.tier, 'develop-people');
  assert.equal(L.SYS.S9.tier, 'sustain-grow');
});

test('no week-based unlocks remain in the framework', () => {
  for (const s of Object.values(L.SYS)) assert.equal(s.unlock, undefined, s.code);
  assert.equal(L.isUnlocked, undefined);
});

test('every moment type feeds one system, and every pillar has a moment type', () => {
  assert.deepEqual(Object.fromEntries(Object.entries(L.TYPES).map(([k, v]) => [k, v.sys])), {
    energy: 'S0', decision: 'S1', clarity: 'S2', planning: 'S3', team: 'S4',
    one_to_one: 'S5', difficult: 'S7', career: 'S8', lookback: 'S9',
  });
  const pillars = new Set(Object.values(L.TYPES).map((t) => L.SYS[t.sys].tier));
  for (const t of L.TIERS) if (t.id !== 'hold-standard') assert.ok(pillars.has(t.id), t.id);
  assert.equal(L.pillarOf('difficult').name, 'Hold the Standard');
  assert.equal(L.pillarOf('career').name, 'Sustain & Grow');
});

// ---- classification from title and attendee count only ----------------------

test('classify: title and attendee count map to moment types', () => {
  const cases = [
    ['Focus: decide on weekend rota', 1, 'decision'],
    ['Decision time: vendor shortlist', 1, 'decision'],
    ['Q4 goals kick-off', 8, 'clarity'],
    ['Team kickoff: new chat channel', 6, 'clarity'],
    ['Plan the week', 1, 'planning'],
    ['Focus time', 1, 'planning'],
    ['CX team stand-up', 8, 'team'],
    ['Team retro', 8, 'team'],
    ['1:1 Jordan / Sam', 2, 'one_to_one'],
    ['Catch-up with Head of CX', 2, 'one_to_one'],
    ['Attendance concerns: Dan', 2, 'difficult'],
    ['Tough feedback: Marcus (missed SLAs)', 2, 'difficult'],
    ['Career chat: Aisha', 2, 'career'],
    ['Development conversation – Tom', 2, 'career'],
    ['Lunch', 1, null],
    ['Interview: CX Advisor', 3, null],
    ['Ops review with Facilities', 5, null],
    ['Vendor demo: new ticketing tool', 6, null],
  ];
  for (const [title, n, want] of cases) assert.equal(L.classify(title, n), want, `${title} (${n})`);
});

// ---- status and capture --------------------------------------------------------

test('momentStatus: past, now or later relative to the clock', () => {
  const e = { start: '10:00', end: '10:30' };
  assert.equal(L.momentStatus(e, '09:59'), 'later');
  assert.equal(L.momentStatus(e, '10:00'), 'now');
  assert.equal(L.momentStatus(e, '10:30'), 'past');
});

test('nextMomentId skips non-moments and anything already started', () => {
  const events = [
    { id: 'a', start: '09:00', end: '09:30', type: 'team' },
    { id: 'lunch', start: '12:00', end: '13:00', type: null },
    { id: 'b', start: '13:00', end: '13:30', type: 'one_to_one' },
  ];
  assert.equal(L.nextMomentId(events, '09:10'), 'b');
  assert.equal(L.nextMomentId(events, '14:00'), null);
});

test('capture is one tap when it went well; "what next" only after mixed or hard', () => {
  assert.equal(L.needsNextStep('well'), false);
  assert.equal(L.needsNextStep('mixed'), true);
  assert.equal(L.needsNextStep('hard'), true);
  assert.equal(L.isCaptured(undefined), false);
  assert.equal(L.isCaptured({ rating: 'well' }), true);
  assert.equal(L.isCaptured({ rating: 'mixed' }), false);
  assert.equal(L.isCaptured({ rating: 'mixed', next: 'follow_up' }), true);
});

test('rowStatus: Now, Up next, a tick, a quiet ask, or nothing', () => {
  const today = [
    { id: 'done', start: '09:30', end: '09:45', type: 'team' },
    { id: 'ask', start: '10:00', end: '10:45', type: 'clarity' },
    { id: 'now', start: '11:00', end: '11:30', type: 'one_to_one' },
    { id: 'next', start: '12:00', end: '12:30', type: 'difficult' },
    { id: 'later', start: '15:30', end: '16:00', type: 'planning' },
  ];
  const captures = { done: { rating: 'well' } };
  const st = (id) => L.rowStatus(today.find((e) => e.id === id), today, captures, '11:20');
  assert.equal(st('done'), 'captured');
  assert.equal(st('ask'), 'ask');
  assert.equal(st('now'), 'now');
  assert.equal(st('next'), 'next');
  assert.equal(st('later'), null);
});

// ---- the week -------------------------------------------------------------------

const week = [
  { day: 0, title: 'CX team stand-up', type: 'team', rating: 'mixed', next: 'revisit', note: 'Ran over again.' },
  { day: 1, title: 'Attendance concerns: Dan', type: 'difficult', rating: 'hard', next: 'follow_up', note: null },
  { day: 1, title: '1:1 Jordan / Aisha', type: 'one_to_one', rating: 'mixed', next: 'follow_up', note: null },
  { day: 2, title: 'Focus time', type: 'planning', rating: null, next: null, note: null },
];
const today = [
  { id: 'sam', start: '10:00', end: '10:30', title: '1:1 Jordan / Sam', type: 'one_to_one' },
  { id: 'lunch', start: '13:00', end: '13:45', title: 'Lunch', type: null },
  { id: 'aisha', start: '14:30', end: '15:00', title: 'Career chat: Aisha', type: 'career' },
];

test('weekSummary counts moments up to now plus anything captured later', () => {
  let s = L.weekSummary(week, today, {}, '11:20');
  assert.equal(s.moments.length, 5);
  assert.equal(s.captured.length, 3);
  assert.equal(s.hard.length, 1);
  s = L.weekSummary(week, today, { sam: { rating: 'well' }, aisha: { rating: 'well' } }, '11:20');
  assert.equal(s.moments.length, 6);
  assert.equal(s.well.length, 2);
});

test('feedback moments: a follow-up after a hard or mixed moment', () => {
  const s = L.weekSummary(week, today, {}, '11:20');
  assert.deepEqual(L.feedbackMoments(s).map((m) => m.title), ['Attendance concerns: Dan', '1:1 Jordan / Aisha']);
});

test('reflectionQuestions: questions only, at most three, drawn from the week', () => {
  const s = L.weekSummary(week, today, {}, '11:20');
  const qs = L.reflectionQuestions(s, 'End stand-ups at 15 minutes');
  assert.ok(qs.length >= 2 && qs.length <= 3);
  for (const q of qs) assert.match(q, /\?$/);
  assert.match(qs[0], /Attendance concerns: Dan/);
  assert.ok(qs.some((q) => q.includes('End stand-ups at 15 minutes') && /ran over once/.test(q)));
});

test('systemUses: captures, feedback follow-ups, energy check-in and look-back', () => {
  const base = Object.fromEntries(Object.keys(L.SYS).map((k) => [k, 0]));
  const s = L.weekSummary(week, today, { sam: { rating: 'well' } }, '11:20');
  const u = L.systemUses(base, s, { energy: 'High', lookbackSaved: true });
  assert.equal(u.S0, 1);
  assert.equal(u.S4, 1);
  assert.equal(u.S5, 2);
  assert.equal(u.S6, 2);
  assert.equal(u.S7, 1);
  assert.equal(u.S9, 1);
  assert.equal(u.S3, 0);
  assert.equal(base.S0, 0, 'baseline is not mutated');
});

test('pillarWeekCounts: moments this week per pillar', () => {
  const s = L.weekSummary(week, today, { sam: { rating: 'well' } }, '11:20');
  assert.deepEqual(L.pillarWeekCounts(s, { energy: 'Low', lookbackSaved: false }), {
    'lead-yourself': 1, 'set-standard': 1, 'develop-people': 3, 'hold-standard': 1, 'sustain-grow': 0,
  });
});

test('promptDepth: Performance prompts deepen after several Feedback moments, never by calendar week', () => {
  assert.equal(L.promptDepth('S7', { S6: 2 }), 'starter');
  assert.equal(L.promptDepth('S7', { S6: 3 }), 'deeper');
  assert.equal(L.promptDepth('S5', { S6: 9 }), 'starter');
});

test('hrSnapshot counts the demo manager in this week’s cohort, aggregates only', () => {
  const weeks = [{ w: 'Wk 5', active: 19, three: 15 }];
  assert.deepEqual(L.hrSnapshot(weeks, 0), { w: 'Wk 5', active: 19, three: 15 });
  assert.deepEqual(L.hrSnapshot(weeks, 3), { w: 'Wk 5', active: 20, three: 16 });
  assert.equal(weeks[0].active, 19);
});

test('esc escapes HTML', () => {
  assert.equal(L.esc('<b>"A" & \'B\'</b>'), '&lt;b&gt;&quot;A&quot; &amp; &#39;B&#39;&lt;/b&gt;');
  assert.equal(L.esc(null), '');
});

// ---- Jordan's scenario ---------------------------------------------------------

test('scenario events are tagged by the same rules, not by hand', () => {
  for (const e of SC.EVENTS) assert.equal(e.type, L.classify(e.title, e.n), e.title);
});

test('Friday touches at least four pillars, with no more than one ordinary 1:1', () => {
  const friday = SC.EVENTS.filter((e) => e.day === SC.TODAY_IDX && e.type);
  const pillars = new Set(friday.map((e) => L.pillarOf(e.type).id));
  pillars.add('lead-yourself'); // the energy check-in
  assert.ok(pillars.size >= 4, [...pillars].join(', '));
  assert.ok(friday.filter((e) => e.type === 'one_to_one').length <= 1);
});

test('context carries across the week: Friday prep cites earlier captures', () => {
  const marcus = SC.EVENTS.find((e) => /Marcus \(missed SLAs\)/.test(e.title));
  assert.match(marcus.context, /Monday/);
  assert.match(marcus.context, new RegExp(SC.SEED_CAPTURES['mon-marcus'].note.replace(/[.]/g, '\\.')));
  const aisha = SC.EVENTS.find((e) => /Career chat: Aisha/.test(e.title));
  assert.match(aisha.context, /Tuesday/);
});

test('prep cards ask questions, never scripts', () => {
  for (const e of SC.EVENTS.filter((x) => x.prep)) {
    for (const q of [...e.prep.questions, ...(e.prep.deeper ?? [])]) assert.match(q, /\?$/, `${e.title}: ${q}`);
    assert.ok(e.prep.questions.length >= 2 && e.prep.questions.length <= 3);
  }
});
