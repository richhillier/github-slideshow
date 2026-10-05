import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.LEADOS_DB = ':memory:';
process.env.LEADOS_AI = 'off';

const { classifyMoment } = await import('../src/moments.js');
const { toLeadOsEvent } = await import('../src/calendar.js');
const { londonTime, weekStart, dayKey } = await import('../src/time.js');
const { libraryPrep } = await import('../src/prep.js');
const { seedDemo } = await import('../src/seed.js');
const { hrOverview } = await import('../src/insights.js');
const { hrPage } = await import('../src/views.js');
const { db } = await import('../src/db.js');

test('classifies moments from title and attendee count', () => {
  const cases = [
    ['1:1 Jordan / Priya', 2, 'one_to_one'],
    ['Priya <> Jordan 1-1', 2, 'one_to_one'],
    ['Weekly catch-up', 2, 'one_to_one'],
    ['Coffee', 2, 'one_to_one'],
    ['Room 11 booking', 3, null],
    ['CX team stand-up', 8, 'team_meeting'],
    ['Team retro', 2, 'one_to_one'],
    ['Plan the week', 1, 'planning'],
    ['Focus time', 1, 'planning'],
    ['Q4 planning with Finance', 6, null],
    ['Attendance concerns: Dan', 2, 'difficult'],
    ['Performance review – Sam', 3, 'difficult'],
    ['Lunch', 1, null],
    ['Interview: CX Advisor', 3, null],
    ['Vendor demo', 6, null],
  ];
  for (const [title, attendeeCount, expected] of cases) {
    assert.equal(classifyMoment({ title, attendeeCount }), expected, title);
  }
});

test('Google events are reduced to title, time and attendee count', () => {
  const e = toLeadOsEvent({
    id: 'abc',
    status: 'confirmed',
    summary: '1:1 Jordan / Priya',
    description: 'SECRET agenda',
    start: { dateTime: '2026-10-06T10:00:00+01:00' },
    end: { dateTime: '2026-10-06T10:30:00+01:00' },
    attendees: [{ self: true, responseStatus: 'accepted' }, { responseStatus: 'accepted' }, { resource: true }],
  });
  assert.deepEqual(e, {
    extId: 'google-abc',
    title: '1:1 Jordan / Priya',
    start: '2026-10-06T09:00:00.000Z',
    end: '2026-10-06T09:30:00.000Z',
    attendeeCount: 2,
  });
  assert.equal(toLeadOsEvent({ id: 'x', start: { date: '2026-10-06' }, end: { date: '2026-10-07' } }), null);
  assert.equal(toLeadOsEvent({ id: 'y', status: 'cancelled', start: { dateTime: 'x' }, end: { dateTime: 'x' } }), null);
  assert.equal(toLeadOsEvent({
    id: 'z', summary: 'Team sync', start: { dateTime: '2026-10-06T10:00:00Z' }, end: { dateTime: '2026-10-06T11:00:00Z' },
    attendees: [{ self: true, responseStatus: 'declined' }, {}, {}],
  }), null);
});

test('London time handles BST and GMT', () => {
  assert.equal(londonTime('2026-10-05', '09:30').toISOString(), '2026-10-05T08:30:00.000Z');
  assert.equal(londonTime('2026-12-07', '09:30').toISOString(), '2026-12-07T09:30:00.000Z');
  assert.equal(weekStart('2026-10-11'), '2026-10-05');
  assert.equal(weekStart('2026-10-05'), '2026-10-05');
});

test('library prep returns two or three questions and picks up an open follow-up', () => {
  const p = libraryPrep({ id: 1, ext_id: 'a', moment_type: 'difficult' });
  assert.equal(p.questions.length, 3);
  const withFollowUp = libraryPrep({ id: 1, ext_id: 'a', moment_type: 'one_to_one' }, [{ next_step: 'follow_up' }]);
  assert.match(withFollowUp.questions[2], /follow up/);
  const stale = libraryPrep({ id: 1, ext_id: 'a', moment_type: 'one_to_one' }, [{ next_step: 'none' }, { next_step: 'follow_up' }]);
  assert.doesNotMatch(stale.questions.join(' '), /Last time/);
});

test('HR view never contains notes or meeting titles', () => {
  seedDemo(dayKey());
  const notes = db.prepare('SELECT note FROM captures WHERE note IS NOT NULL').all().map((r) => r.note);
  const titles = db.prepare('SELECT DISTINCT title FROM events').all().map((r) => r.title);
  assert.ok(notes.length > 0, 'demo seeds some notes');
  const page = hrPage({ manager: { name: 'HR', calendar_source: 'demo' }, overview: hrOverview() });
  const body = page.split('<main>')[1].split('</main>')[0];
  for (const s of [...notes, ...titles]) assert.ok(!body.includes(s), `HR view leaked: ${s}`);
});

test('canonical pillars and systems, with no week-based gating', async () => {
  const { pillars } = await import('../src/org.js');
  assert.deepEqual(pillars.map((p) => p.name), ['Lead Yourself', 'Set the Standard', 'Develop People', 'Hold the Standard', 'Sustain & Grow']);
  assert.deepEqual(pillars.flatMap((p) => p.systems.map((s) => s.name)),
    ['Energy', 'Decisions', 'Clarity', 'Planning', 'Communication', '1:1s', 'Feedback', 'Performance', 'Growth', 'Reflection']);
  for (const s of pillars.flatMap((p) => p.systems)) assert.equal(s.unlockWeek, undefined, s.name);
});

test('manager pages show pillars, never system codes or week unlocks', async () => {
  const { pillarProgress } = await import('../src/insights.js');
  const { pillarsPage } = await import('../src/views.js');
  seedDemo(dayKey());
  const html = pillarsPage({ manager: { name: 'Jordan', calendar_source: 'demo' }, progress: pillarProgress(1) });
  const main = html.split('<main>')[1].split('</main>')[0].replace(/<[^>]+>/g, ' ');
  assert.match(main, /Your pillars/);
  assert.match(main, /Sustain &amp; Grow/);
  assert.doesNotMatch(main, /\bS\d\b/);
  assert.doesNotMatch(main, /\bweek \d+\b|switches on|unlock|programme/i);
});

test('difficult conversations feed Performance, not Feedback', async () => {
  const { momentTypes } = await import('../src/org.js');
  assert.deepEqual(momentTypes.difficult, { label: 'Difficult conversation', pillar: 'hold-standard', system: 'performance' });
});
