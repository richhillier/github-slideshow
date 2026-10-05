// Date helpers. Days and weeks are London calendar days; instants are stored as UTC ISO strings.
import { TZ } from './org.js';

const partsFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ,
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
  hourCycle: 'h23',
});

function wallClock(date) {
  const p = Object.fromEntries(partsFmt.formatToParts(date).map((x) => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, mi: +p.minute, s: +p.second };
}

/** YYYY-MM-DD of the London calendar day containing `date`. */
export function dayKey(date = new Date()) {
  const { y, m, d } = wallClock(date);
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** UTC Date for a London wall-clock time on a given day ("HH:MM"). */
export function londonTime(key, hhmm = '00:00') {
  const [y, m, d] = key.split('-').map(Number);
  const [h, mi] = hhmm.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, h, mi);
  const w = wallClock(new Date(guess));
  const offset = Date.UTC(w.y, w.m - 1, w.d, w.h, w.mi) - guess;
  return new Date(guess - offset);
}

export function addDays(key, n) {
  const [y, m, d] = key.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

/** Monday of the week containing `key`. */
export function weekStart(key) {
  const [y, m, d] = key.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
  return addDays(key, -((dow + 6) % 7));
}

export function isDayKey(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
}

/** [startUtc, endUtc) ISO strings covering a London day. */
export function dayRange(key) {
  return [londonTime(key).toISOString(), londonTime(addDays(key, 1)).toISOString()];
}

export function formatTime(iso) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}

export function formatDay(key, opts = { weekday: 'long', day: 'numeric', month: 'long' }) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', ...opts }).format(new Date(`${key}T12:00:00Z`));
}
