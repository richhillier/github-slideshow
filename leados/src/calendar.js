// Read-only Google Calendar connector (plain OAuth 2.0 web flow, no SDK).
// The Calendar API `fields` mask means we never receive descriptions, locations, links or attendee identities.
import { randomBytes } from 'node:crypto';
import { getManager, setCalendarSource, setProgrammeStart, upsertEvents } from './store.js';
import { addDays, dayKey, londonTime, weekStart } from './time.js';

const SCOPE = 'https://www.googleapis.com/auth/calendar.events.readonly';
const FIELDS = 'items(id,status,summary,eventType,start,end,attendees(self,resource,responseStatus)),nextPageToken';

const cfg = () => ({
  clientId: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  redirectUri: process.env.GOOGLE_REDIRECT_URI ?? `http://localhost:${process.env.PORT ?? 3000}/oauth/google/callback`,
});

export const googleConfigured = () => Boolean(cfg().clientId && cfg().clientSecret);

const pendingStates = new Set();

export function authUrl() {
  const { clientId, redirectUri } = cfg();
  const state = randomBytes(16).toString('hex');
  pendingStates.add(state);
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

async function tokenRequest(body) {
  const { clientId, clientSecret } = cfg();
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, ...body }),
  });
  if (!res.ok) throw new Error(`Google token exchange failed (${res.status})`);
  const t = await res.json();
  return { ...t, expires_at: Date.now() + (t.expires_in - 60) * 1000 };
}

export async function handleCallback(managerId, { code, state }) {
  if (!state || !pendingStates.delete(state)) throw new Error('OAuth state mismatch');
  const tokens = await tokenRequest({ code, grant_type: 'authorization_code', redirect_uri: cfg().redirectUri });
  setCalendarSource(managerId, 'google', tokens);
  setProgrammeStart(managerId, weekStart(dayKey()));
  return syncGoogle(managerId);
}

async function accessToken(manager) {
  let tokens = JSON.parse(manager.google_tokens ?? 'null');
  if (!tokens) throw new Error('Google Calendar is not connected');
  if (Date.now() >= tokens.expires_at) {
    const fresh = await tokenRequest({ refresh_token: tokens.refresh_token, grant_type: 'refresh_token' });
    tokens = { ...tokens, ...fresh };
    setCalendarSource(manager.id, 'google', tokens);
  }
  return tokens.access_token;
}

/** Map a Google event to the minimal record LeadOS stores, or null to skip it. */
export function toLeadOsEvent(item) {
  if (item.status === 'cancelled') return null;
  if (!item.start?.dateTime || !item.end?.dateTime) return null; // all-day events are not moments
  if (['outOfOffice', 'workingLocation'].includes(item.eventType)) return null;
  const people = (item.attendees ?? []).filter((a) => !a.resource);
  if (people.find((a) => a.self)?.responseStatus === 'declined') return null;
  return {
    extId: `google-${item.id}`,
    title: item.summary?.trim() || '(no title)',
    start: new Date(item.start.dateTime).toISOString(),
    end: new Date(item.end.dateTime).toISOString(),
    attendeeCount: Math.max(1, people.length),
  };
}

/** Pulls last week through the next fortnight. */
export async function syncGoogle(managerId) {
  const manager = getManager(managerId);
  const token = await accessToken(manager);
  const from = londonTime(addDays(weekStart(dayKey()), -7)).toISOString();
  const to = londonTime(addDays(dayKey(), 15)).toISOString();

  const events = [];
  let pageToken;
  do {
    const params = new URLSearchParams({
      timeMin: from, timeMax: to, singleEvents: 'true', orderBy: 'startTime', maxResults: '250', fields: FIELDS,
    });
    if (pageToken) params.set('pageToken', pageToken);
    const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`Google Calendar request failed (${res.status})`);
    const page = await res.json();
    for (const item of page.items ?? []) {
      const e = toLeadOsEvent(item);
      if (e) events.push(e);
    }
    pageToken = page.nextPageToken;
  } while (pageToken);

  upsertEvents(managerId, events);
  return events.length;
}
