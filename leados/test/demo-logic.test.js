// Unit tests for demo/logic.js — the pure rules behind the calendar add-on mockup.
import { test } from 'node:test';
import assert from 'node:assert/strict';

await import('../demo/logic.js');
const L = globalThis.LeadOSLogic;

test('exposes the operating stack: five tiers, ten systems S0-S9', () => {
  assert.equal(L.TIERS.length, 5);
  assert.deepEqual(L.TIERS.map((t) => t.name), ['Lead Yourself', 'Set the Standard', 'Develop People', 'Hold the Standard', 'Grow & Sustain']);
  assert.deepEqual(Object.keys(L.SYS), ['S0', 'S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8', 'S9']);
  assert.equal(L.SYS.S5.name, '1:1 System');
  assert.equal(L.SYS.S5.tier, 'develop-people');
});

test('moment types feed the right systems', () => {
  assert.equal(L.TYPES.one_to_one.sys, 'S5');
  assert.equal(L.TYPES.team.sys, 'S4');
  assert.equal(L.TYPES.planning.sys, 'S3');
  assert.equal(L.TYPES.difficult.sys, 'S6');
});

test('systems unlock by programme week', () => {
  assert.equal(L.isUnlocked(L.SYS.S6, 5), true);
  assert.equal(L.isUnlocked(L.SYS.S7, 5), false);
  assert.equal(L.isUnlocked(L.SYS.S7, 6), true);
  assert.equal(L.isUnlocked(L.SYS.S8, 9), false);
  assert.equal(L.isUnlocked(L.SYS.S9, 12), true);
});

test('momentStatus: past, now or later relative to the clock', () => {
  const e = { start: '10:00', end: '10:30' };
  assert.equal(L.momentStatus(e, '09:59'), 'later');
  assert.equal(L.momentStatus(e, '10:00'), 'now');
  assert.equal(L.momentStatus(e, '10:29'), 'now');
  assert.equal(L.momentStatus(e, '10:30'), 'past');
});

test('nextMomentId skips non-moments and anything already started', () => {
  const events = [
    { id: 'a', start: '09:00', end: '09:30', type: 'team' },
    { id: 'lunch', start: '12:00', end: '13:00', type: null },
    { id: 'b', start: '13:00', end: '13:30', type: 'one_to_one' },
  ];
  assert.equal(L.nextMomentId(events, '09:10'), 'b');
  assert.equal(L.nextMomentId(events, '08:00'), 'a');
  assert.equal(L.nextMomentId(events, '14:00'), null);
});

test('isCaptured needs both taps', () => {
  assert.equal(L.isCaptured(undefined), false);
  assert.equal(L.isCaptured({ rating: 'well' }), false);
  assert.equal(L.isCaptured({ rating: 'well', next: 'none' }), true);
});

const week = [
  { day: 0, title: 'CX team stand-up', type: 'team', rating: 'mixed', next: 'revisit', note: 'Ran over again.' },
  { day: 1, title: 'Attendance concerns: Dan', type: 'difficult', rating: 'hard', next: 'follow_up', note: null },
  { day: 2, title: 'Focus time', type: 'planning', rating: null, next: null, note: null },
];
const today = [
  { id: 'sam', start: '10:00', end: '10:30', title: '1:1 Jordan / Sam', type: 'one_to_one' },
  { id: 'lunch', start: '13:00', end: '13:45', title: 'Lunch', type: null },
  { id: 'ellie', start: '14:30', end: '15:00', title: '1:1 Jordan / Ellie', type: 'one_to_one' },
];

test('weekSummary counts moments up to now plus anything captured later', () => {
  let s = L.weekSummary(week, today, {}, '11:20');
  assert.equal(s.moments.length, 4); // 3 earlier + Sam (started); Ellie is later and uncaptured; lunch is not a moment
  assert.equal(s.captured.length, 2);
  assert.equal(s.open.length, 2);
  assert.equal(s.hard.length, 1);

  s = L.weekSummary(week, today, { sam: { rating: 'well', next: 'none' }, ellie: { rating: 'well', next: 'follow_up' } }, '11:20');
  assert.equal(s.moments.length, 5);
  assert.equal(s.captured.length, 4);
  assert.equal(s.well.length, 2);
  assert.equal(s.open.length, 3);
});

test('reflectionQuestions: questions only, at most three, drawn from the week', () => {
  const s = L.weekSummary(week, today, {}, '11:20');
  const qs = L.reflectionQuestions(s, 'End stand-ups at 15 minutes');
  assert.ok(qs.length >= 2 && qs.length <= 3);
  for (const q of qs) assert.match(q, /\?$/);
  assert.match(qs[0], /Attendance concerns: Dan/);
  assert.ok(qs.some((q) => q.includes('End stand-ups at 15 minutes') && /ran over once/.test(q)));
});

test('systemUses adds this week’s captures and the energy check-in to the baseline', () => {
  const base = { S0: 1, S1: 0, S2: 0, S3: 0, S4: 0, S5: 0, S6: 0, S7: 0, S8: 0, S9: 0 };
  const s = L.weekSummary(week, today, { sam: { rating: 'well', next: 'none' } }, '11:20');
  const u = L.systemUses(base, s, 'High');
  assert.equal(u.S0, 2);
  assert.equal(u.S4, 1);
  assert.equal(u.S5, 1);
  assert.equal(u.S6, 1);
  assert.equal(u.S3, 0); // Focus time was never captured
  assert.equal(base.S0, 1, 'baseline is not mutated');
});

test('hrSnapshot counts the demo manager in this week’s cohort, aggregates only', () => {
  const weeks = [{ w: 'Wk 5', active: 19, three: 15 }];
  assert.deepEqual(L.hrSnapshot(weeks, 0), { w: 'Wk 5', active: 19, three: 15 });
  assert.deepEqual(L.hrSnapshot(weeks, 2), { w: 'Wk 5', active: 20, three: 15 });
  assert.deepEqual(L.hrSnapshot(weeks, 3), { w: 'Wk 5', active: 20, three: 16 });
  assert.equal(weeks[0].active, 19, 'input is not mutated');
});

test('esc escapes HTML', () => {
  assert.equal(L.esc('<b>"A" & \'B\'</b>'), '&lt;b&gt;&quot;A&quot; &amp; &#39;B&#39;&lt;/b&gt;');
  assert.equal(L.esc(null), '');
});
