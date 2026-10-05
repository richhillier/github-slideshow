import express from 'express';
import { getManager, eventsForDay, getEvent, previousCaptures, savePrep, markPrepOpened, saveCapture, saveLookback, getLookback, allLookbacks, ensureManager } from './src/store.js';
import { buildPrep, aiEnabled } from './src/prep.js';
import { seedDemo, DEMO_MANAGER } from './src/seed.js';
import { googleConfigured, authUrl, handleCallback, syncGoogle } from './src/calendar.js';
import { weekSummary, reflectionQuestions, pillarProgress, hrOverview } from './src/insights.js';
import { welcomePage, todayPage, lookbackPage, pillarsPage, hrPage } from './src/views.js';
import { addDays, dayKey, isDayKey, weekStart } from './src/time.js';
import { pillars } from './src/org.js';

const GOOGLE_MANAGER = { id: 2, name: 'You', team: null };

const app = express();
app.disable('x-powered-by');
app.use(express.static(new URL('./public', import.meta.url).pathname));
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// Single-user prototype: the current manager is a cookie, not an account.
app.use((req, res, next) => {
  const id = Number(/(?:^|;\s*)mid=(\d+)/.exec(req.headers.cookie ?? '')?.[1]);
  const m = id ? getManager(id) : null;
  req.manager = m?.calendar_source ? m : null;
  next();
});
const setManager = (res, id) => res.cookie('mid', String(id), { httpOnly: true, sameSite: 'lax', maxAge: 1000 * 60 * 60 * 24 * 90 });
const requireManager = (req, res, next) => (req.manager ? next() : res.redirect('/welcome'));
const html = (res, page) => res.type('html').send(page);

app.get('/', (req, res) => res.redirect(req.manager ? '/today' : '/welcome'));

app.get('/welcome', (req, res) => html(res, welcomePage({ googleReady: googleConfigured(), error: req.query.error })));

app.post('/demo/start', (req, res) => {
  const m = getManager(DEMO_MANAGER.id)?.calendar_source ? getManager(DEMO_MANAGER.id) : seedDemo();
  setManager(res, m.id);
  res.redirect('/today');
});

app.post('/demo/reset', (req, res) => {
  const m = seedDemo();
  setManager(res, m.id);
  res.redirect('/today');
});

app.post('/signout', (req, res) => {
  res.clearCookie('mid');
  res.redirect('/welcome');
});

// ---- Google Calendar --------------------------------------------------------

app.get('/connect/google', (req, res) => {
  if (!googleConfigured()) return res.redirect('/welcome?error=Google+Calendar+is+not+configured');
  res.redirect(authUrl());
});

app.get('/oauth/google/callback', async (req, res) => {
  if (req.query.error) return res.redirect(`/welcome?error=${encodeURIComponent(`Google said: ${req.query.error}`)}`);
  try {
    ensureManager(GOOGLE_MANAGER);
    await handleCallback(GOOGLE_MANAGER.id, req.query);
    setManager(res, GOOGLE_MANAGER.id);
    res.redirect('/today');
  } catch (err) {
    console.error('[google]', err);
    res.redirect(`/welcome?error=${encodeURIComponent(err.message)}`);
  }
});

// Re-sync on each Today visit for Google calendars (cheap; one or two API pages).
async function refreshCalendar(manager) {
  if (manager.calendar_source !== 'google') return;
  try { await syncGoogle(manager.id); } catch (err) { console.warn('[google] sync failed:', err.message); }
}

// ---- pages ------------------------------------------------------------------

app.get('/today', requireManager, async (req, res) => {
  const day = isDayKey(req.query.date) ? req.query.date : dayKey();
  await refreshCalendar(req.manager);
  html(res, todayPage({ manager: req.manager, day, events: eventsForDay(req.manager.id, day), nowIso: new Date().toISOString() }));
});

// Look-backs are a Friday habit: early in the week, default to last week until it's done.
function defaultLookbackWeek(managerId) {
  const today = dayKey();
  const thisMonday = weekStart(today);
  const dow = new Date(`${today}T12:00:00Z`).getUTCDay();
  const lastMonday = addDays(thisMonday, -7);
  return dow >= 1 && dow <= 3 && !getLookback(managerId, lastMonday) ? lastMonday : thisMonday;
}

app.get('/lookback', requireManager, (req, res) => {
  const monday = isDayKey(req.query.week) ? weekStart(req.query.week) : defaultLookbackWeek(req.manager.id);
  const summary = weekSummary(req.manager.id, monday);
  html(res, lookbackPage({ manager: req.manager, summary, questions: reflectionQuestions(summary), saved: 'saved' in req.query }));
});

app.post('/lookback', requireManager, (req, res) => {
  const monday = weekStart(isDayKey(req.query.week) ? req.query.week : dayKey());
  const pillarScores = {};
  for (const p of pillars) {
    const n = Number(req.body[`score_${p.id}`]);
    if (n >= 1 && n <= 5) pillarScores[p.id] = n;
  }
  const text = (v) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 500) : null);
  saveLookback(req.manager.id, monday, { pillarScores, win: text(req.body.win), tryNext: text(req.body.try_next) });
  res.redirect(`/lookback?week=${monday}&saved`);
});

app.get('/pillars', requireManager, (req, res) => {
  html(res, pillarsPage({ manager: req.manager, progress: pillarProgress(req.manager.id), lookbacksDone: allLookbacks(req.manager.id).length }));
});

app.get('/hr', requireManager, (req, res) => html(res, hrPage({ manager: req.manager, overview: hrOverview() })));

// ---- JSON API used by public/app.js -----------------------------------------

const inflight = new Map();

app.get('/api/prep/:id', requireManager, async (req, res) => {
  const event = getEvent(req.manager.id, Number(req.params.id));
  if (!event?.moment_type) return res.status(404).json({ error: 'Not a moment' });
  if (!event.prep_questions) {
    // De-duplicate concurrent requests for the same card.
    if (!inflight.has(event.id)) {
      inflight.set(event.id, buildPrep(event, previousCaptures(req.manager.id, event))
        .then((prep) => savePrep(event.id, prep))
        .finally(() => inflight.delete(event.id)));
    }
    await inflight.get(event.id);
  }
  markPrepOpened(event.id);
  const fresh = getEvent(req.manager.id, event.id);
  res.json({ focus: fresh.prep_focus, questions: fresh.prep_questions, source: fresh.prep_source });
});

app.post('/api/capture/:id', requireManager, (req, res) => {
  const event = getEvent(req.manager.id, Number(req.params.id));
  if (!event?.moment_type) return res.status(404).json({ error: 'Not a moment' });
  const { rating, next_step: nextStep, note } = req.body ?? {};
  const fields = {};
  if (rating !== undefined) {
    if (!['well', 'mixed', 'hard'].includes(rating)) return res.status(400).json({ error: 'Bad rating' });
    fields.rating = rating;
  }
  if (nextStep !== undefined) {
    if (!['none', 'follow_up', 'revisit'].includes(nextStep)) return res.status(400).json({ error: 'Bad next step' });
    fields.next_step = nextStep;
  }
  if (note !== undefined) fields.note = typeof note === 'string' && note.trim() ? note.trim().slice(0, 500) : null;
  res.json(saveCapture(req.manager.id, event.id, fields));
});

export default app;

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const port = Number(process.env.PORT ?? 3000);
  app.listen(port, () => {
    console.log(`LeadOS running on http://localhost:${port}`);
    console.log(`  Prep questions: ${aiEnabled() ? 'Claude API' : 'built-in library (set ANTHROPIC_API_KEY for Claude)'}`);
    console.log(`  Google Calendar: ${googleConfigured() ? 'configured' : 'not configured (demo week only)'}`);
  });
}
