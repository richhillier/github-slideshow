// Seeds one demo manager with a realistic fortnight: last week (mostly captured, with a look-back)
// and this week (captured up to yesterday, today left open to try the loop).
import { pathToFileURL } from 'node:url';
import { ensureManager, clearManagerData, upsertEvents, saveCapture, saveLookback, setCalendarSource, setProgrammeStart, savePrep } from './store.js';
import { db } from './db.js';
import { addDays, dayKey, londonTime, weekStart } from './time.js';
import { libraryPrep } from './prep.js';

export const DEMO_MANAGER = { id: 1, name: 'Jordan Reid', team: 'Customer Support, Leeds (7 reports)' };

// [weekday 0-4, start, minutes, title, attendees]
const WEEK = [
  [0, '08:30', 30, 'Plan the week', 1],
  [0, '09:30', 15, 'CX team stand-up', 8],
  [0, '11:00', 30, '1:1 Jordan / Priya', 2],
  [0, '13:00', 45, 'Lunch', 1],
  [0, '14:00', 60, 'Ops review with Facilities', 5],
  [0, '15:30', 30, '1:1 Jordan / Marcus', 2],
  [1, '09:30', 15, 'CX team stand-up', 8],
  [1, '10:00', 60, 'Q4 priorities planning block', 1],
  [1, '11:30', 30, '1:1 Jordan / Aisha', 2],
  [1, '14:00', 30, 'Attendance concerns: Dan', 2],
  [1, '16:00', 45, 'Vendor demo: new ticketing tool', 6],
  [2, '09:30', 15, 'CX team stand-up', 8],
  [2, '10:00', 30, '1:1 Jordan / Tom', 2],
  [2, '13:30', 60, 'Team retro', 8],
  [2, '15:00', 90, 'Focus time', 1],
  [3, '09:00', 45, 'Interview: CX Advisor', 3],
  [3, '09:30', 15, 'CX team stand-up', 8],
  [3, '11:00', 30, '1:1 Jordan / Ellie', 2],
  [3, '14:00', 30, 'Catch-up with Head of CX', 2],
  [4, '09:30', 15, 'CX team stand-up', 8],
  [4, '10:00', 30, '1:1 Jordan / Sam', 2],
  [4, '12:00', 30, 'Tough feedback: Marcus (missed SLAs)', 2],
  [4, '15:00', 30, 'Weekly wrap-up and plan next week', 1],
];

const NOTES = {
  '1:1 Jordan / Priya': ['Wants to lead the chat-channel pilot. Find her a stretch piece.', 'Asked about promotion criteria; I was vague.'],
  '1:1 Jordan / Marcus': ['Quiet, low energy. Did not get to SLAs.', 'Better. Agreed a weekly check on queue times.'],
  '1:1 Jordan / Aisha': ['Struggling with the late shift pattern.', null],
  'Attendance concerns: Dan': ['Third Monday absence. Stated facts, he opened up about childcare. Speak to HRBP.', 'Agreed a review date. Felt fair.'],
  'CX team stand-up': [null, 'Ran over again, too much status.'],
  'Team retro': ['Good energy; actions had no owners again.', null],
  'Tough feedback: Marcus (missed SLAs)': ['Too soft. He left unsure what needs to change.', 'Clear this time: two examples, one ask.'],
  '1:1 Jordan / Tom': [null, null],
  '1:1 Jordan / Ellie': ['Wants more customer escalations to learn from.', null],
};

// Deterministic "random" so the demo looks the same on every reseed.
function pick(seed, options) {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return options[h % options.length];
}

function weekEvents(monday) {
  return WEEK.map(([d, start, mins, title, attendeeCount]) => {
    const day = addDays(monday, d);
    const s = londonTime(day, start);
    return {
      extId: `demo-${day}-${start}-${title}`,
      title, attendeeCount,
      start: s.toISOString(),
      end: new Date(s.getTime() + mins * 60_000).toISOString(),
    };
  });
}

export function seedDemo(today = dayKey()) {
  const m = ensureManager(DEMO_MANAGER);
  clearManagerData(m.id);
  setCalendarSource(m.id, 'demo');

  const thisMonday = weekStart(today);
  const lastMonday = addDays(thisMonday, -7);
  // Jordan is in week 5 of the programme: S7 Performance unlocks next week.
  setProgrammeStart(m.id, addDays(thisMonday, -28), { overwrite: true });
  const todayStart = londonTime(today).toISOString();

  upsertEvents(m.id, [...weekEvents(lastMonday), ...weekEvents(thisMonday)]);

  const moments = db.prepare(`SELECT * FROM events WHERE manager_id = ? AND moment_type IS NOT NULL ORDER BY start_utc`).all(m.id);
  const titleSeen = {};
  for (const e of moments) {
    if (e.start_utc >= todayStart) continue; // leave today and later open
    const seed = `${e.ext_id}`;
    if (pick(seed, [1, 1, 1, 0]) === 0) continue; // ~1 in 4 moments goes uncaptured, as in real life
    const occurrence = (titleSeen[e.title] = (titleSeen[e.title] ?? -1) + 1);
    savePrep(e.id, { ...libraryPrep(e), source: 'library' });
    db.prepare('UPDATE preps SET opened_at = ? WHERE event_id = ?').run(e.start_utc, e.id);
    saveCapture(m.id, e.id, {
      rating: e.moment_type === 'difficult' ? pick(seed, ['hard', 'mixed']) : pick(seed, ['well', 'well', 'mixed', 'hard']),
      next_step: pick(seed + 'n', ['none', 'none', 'follow_up', 'revisit']),
      note: NOTES[e.title]?.[occurrence % 2] ?? null,
    });
  }

  // Five weeks of earlier self-ratings so the pillar trends have a shape.
  const history = [
    { 'lead-yourself': 2, 'set-standard': 2, 'develop-people': 3, 'hold-standard': 1, 'grow-sustain': 2 },
    { 'lead-yourself': 2, 'set-standard': 2, 'develop-people': 3, 'hold-standard': 2, 'grow-sustain': 2 },
    { 'lead-yourself': 3, 'set-standard': 3, 'develop-people': 3, 'hold-standard': 2 },
    { 'lead-yourself': 3, 'set-standard': 3, 'develop-people': 4, 'hold-standard': 2, 'grow-sustain': 3 },
  ];
  history.forEach((pillarScores, i) => saveLookback(m.id, addDays(lastMonday, -7 * (history.length - i)), { pillarScores, win: null, tryNext: null }));

  saveLookback(m.id, lastMonday, {
    pillarScores: { 'lead-yourself': 3, 'set-standard': 3, 'develop-people': 4, 'hold-standard': 3, 'grow-sustain': 3 },
    win: 'Had the attendance conversation with Dan instead of putting it off.',
    tryNext: 'End stand-ups at 15 minutes and give every retro action an owner.',
  });

  return m;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const m = seedDemo();
  console.log(`Seeded demo manager ${m.name} (id ${m.id}).`);
}
