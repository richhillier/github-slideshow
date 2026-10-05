import { db, now } from './db.js';
import { classifyMoment } from './moments.js';
import { dayRange, londonTime, addDays } from './time.js';

const json = (s, fallback) => (s ? JSON.parse(s) : fallback);

// ---- managers -------------------------------------------------------------

export function getManager(id) {
  return db.prepare('SELECT * FROM managers WHERE id = ?').get(id);
}

export function ensureManager({ id, name, team }) {
  db.prepare(`INSERT INTO managers (id, name, team) VALUES (?, ?, ?)
              ON CONFLICT(id) DO UPDATE SET name = excluded.name, team = excluded.team`).run(id, name, team);
  return getManager(id);
}

export function setProgrammeStart(managerId, mondayKey, { overwrite = false } = {}) {
  db.prepare(`UPDATE managers SET started_on = ? WHERE id = ?${overwrite ? '' : ' AND started_on IS NULL'}`).run(mondayKey, managerId);
}

export function setCalendarSource(managerId, source, tokens = null) {
  db.prepare('UPDATE managers SET calendar_source = ?, google_tokens = ?, connected_at = ? WHERE id = ?')
    .run(source, tokens ? JSON.stringify(tokens) : null, now(), managerId);
}

// ---- events ---------------------------------------------------------------

/** Upsert events, classifying each as a moment. Keeps prep/captures for events that already exist. */
export function upsertEvents(managerId, events) {
  const stmt = db.prepare(`
    INSERT INTO events (manager_id, ext_id, title, start_utc, end_utc, attendee_count, moment_type)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(manager_id, ext_id) DO UPDATE SET
      title = excluded.title, start_utc = excluded.start_utc, end_utc = excluded.end_utc,
      attendee_count = excluded.attendee_count, moment_type = excluded.moment_type`);
  db.exec('BEGIN');
  try {
    for (const e of events) {
      stmt.run(managerId, e.extId, e.title, e.start, e.end, e.attendeeCount,
        e.momentType !== undefined ? e.momentType : classifyMoment(e));
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export function clearManagerData(managerId) {
  db.prepare('DELETE FROM events WHERE manager_id = ?').run(managerId);
  db.prepare('DELETE FROM lookbacks WHERE manager_id = ?').run(managerId);
}

function hydrate(row) {
  if (!row) return row;
  return {
    ...row,
    prep_questions: json(row.prep_questions, null),
  };
}

const EVENT_SELECT = `
  SELECT e.*, c.rating, c.next_step, c.note, c.updated_at AS captured_at,
         p.focus AS prep_focus, p.questions AS prep_questions, p.source AS prep_source, p.opened_at AS prep_opened_at
  FROM events e
  LEFT JOIN captures c ON c.event_id = e.id
  LEFT JOIN preps p ON p.event_id = e.id`;

export function eventsForDay(managerId, key) {
  const [from, to] = dayRange(key);
  return db.prepare(`${EVENT_SELECT} WHERE e.manager_id = ? AND e.start_utc >= ? AND e.start_utc < ? ORDER BY e.start_utc`)
    .all(managerId, from, to).map(hydrate);
}

export function momentsForWeek(managerId, mondayKey) {
  const from = londonTime(mondayKey).toISOString();
  const to = londonTime(addDays(mondayKey, 7)).toISOString();
  return db.prepare(`${EVENT_SELECT} WHERE e.manager_id = ? AND e.start_utc >= ? AND e.start_utc < ?
                     AND e.moment_type IS NOT NULL ORDER BY e.start_utc`)
    .all(managerId, from, to).map(hydrate);
}

export function getEvent(managerId, eventId) {
  return hydrate(db.prepare(`${EVENT_SELECT} WHERE e.manager_id = ? AND e.id = ?`).get(managerId, eventId));
}

/** Earlier captured moments with the same title — e.g. last week's 1:1 with the same person. */
export function previousCaptures(managerId, event, limit = 3) {
  return db.prepare(`
    SELECT e.title, e.start_utc, c.rating, c.next_step, c.note
    FROM events e JOIN captures c ON c.event_id = e.id
    WHERE e.manager_id = ? AND e.title = ? AND e.start_utc < ?
    ORDER BY e.start_utc DESC LIMIT ?`).all(managerId, event.title, event.start_utc, limit);
}

// ---- prep -----------------------------------------------------------------

export function savePrep(eventId, { focus, questions, source }) {
  db.prepare(`INSERT INTO preps (event_id, focus, questions, source, created_at) VALUES (?, ?, ?, ?, ?)
              ON CONFLICT(event_id) DO UPDATE SET focus = excluded.focus, questions = excluded.questions,
              source = excluded.source, created_at = excluded.created_at`)
    .run(eventId, focus, JSON.stringify(questions), source, now());
}

export function markPrepOpened(eventId) {
  db.prepare('UPDATE preps SET opened_at = COALESCE(opened_at, ?) WHERE event_id = ?').run(now(), eventId);
}

// ---- captures -------------------------------------------------------------

export function saveCapture(managerId, eventId, fields) {
  const existing = db.prepare('SELECT * FROM captures WHERE event_id = ?').get(eventId) ?? {};
  const merged = {
    rating: fields.rating ?? existing.rating ?? null,
    next_step: fields.next_step ?? existing.next_step ?? null,
    note: fields.note !== undefined ? fields.note : existing.note ?? null,
  };
  db.prepare(`INSERT INTO captures (event_id, manager_id, rating, next_step, note, updated_at) VALUES (?, ?, ?, ?, ?, ?)
              ON CONFLICT(event_id) DO UPDATE SET rating = excluded.rating, next_step = excluded.next_step,
              note = excluded.note, updated_at = excluded.updated_at`)
    .run(eventId, managerId, merged.rating, merged.next_step, merged.note, now());
  return merged;
}

// ---- look-backs -----------------------------------------------------------

export function getLookback(managerId, mondayKey) {
  const row = db.prepare('SELECT * FROM lookbacks WHERE manager_id = ? AND week_start = ?').get(managerId, mondayKey);
  return row && { ...row, pillar_scores: json(row.pillar_scores, {}) };
}

export function saveLookback(managerId, mondayKey, { pillarScores, win, tryNext }) {
  db.prepare(`INSERT INTO lookbacks (manager_id, week_start, pillar_scores, win, try_next, updated_at) VALUES (?, ?, ?, ?, ?, ?)
              ON CONFLICT(manager_id, week_start) DO UPDATE SET pillar_scores = excluded.pillar_scores,
              win = excluded.win, try_next = excluded.try_next, updated_at = excluded.updated_at`)
    .run(managerId, mondayKey, JSON.stringify(pillarScores), win, tryNext, now());
}

export function allLookbacks(managerId) {
  return db.prepare('SELECT * FROM lookbacks WHERE manager_id = ? ORDER BY week_start')
    .all(managerId).map((r) => ({ ...r, pillar_scores: json(r.pillar_scores, {}) }));
}

/** Every captured moment for a manager, oldest first (no notes; used for pillar progress). */
export function allCapturedMoments(managerId) {
  return db.prepare(`
    SELECT e.moment_type, e.start_utc, c.rating, c.next_step
    FROM events e JOIN captures c ON c.event_id = e.id
    WHERE e.manager_id = ? AND e.moment_type IS NOT NULL ORDER BY e.start_utc`).all(managerId);
}

// ---- aggregates for the HR view (deliberately note-free) -----------------

export function weeklyUsage(mondayKey) {
  const from = londonTime(mondayKey).toISOString();
  const to = londonTime(addDays(mondayKey, 7)).toISOString();
  return db.prepare(`
    SELECT e.manager_id, e.moment_type,
           (p.opened_at IS NOT NULL) AS prepped,
           (c.rating IS NOT NULL) AS captured
    FROM events e
    LEFT JOIN preps p ON p.event_id = e.id
    LEFT JOIN captures c ON c.event_id = e.id
    WHERE e.moment_type IS NOT NULL AND e.start_utc >= ? AND e.start_utc < ?`).all(from, to);
}

export function lookbackCount(mondayKey) {
  return db.prepare('SELECT COUNT(*) AS n FROM lookbacks WHERE week_start = ?').get(mondayKey).n;
}

export function managerCount() {
  return db.prepare('SELECT COUNT(*) AS n FROM managers WHERE calendar_source IS NOT NULL').get().n;
}
