import { momentTypes, pillars, pillarById, orgContext } from './org.js';
import { addDays, dayKey, formatDay, formatTime } from './time.js';
import { MIN_GROUP } from './insights.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const RATINGS = [['well', 'Went well'], ['mixed', 'Mixed'], ['hard', 'Hard']];
const NEXT = [['none', 'Nothing'], ['follow_up', 'Follow up'], ['revisit', 'Revisit']];
const pct = (x) => `${Math.round(x * 100)}%`;

export function layout({ title, active, manager, body }) {
  const nav = [['today', '/today', 'Today'], ['lookback', '/lookback', 'Look-back'], ['pillars', '/pillars', 'Pillars'], ['hr', '/hr', 'HR view']];
  return `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} · LeadOS</title>
<link rel="stylesheet" href="/styles.css">
<script src="/app.js" defer></script>
</head>
<body>
<header class="top">
  <a class="brand" href="/today">LeadOS</a>
  ${manager ? `<nav>${nav.map(([k, href, label]) => `<a href="${href}"${k === active ? ' aria-current="page"' : ''}>${label}</a>`).join('')}</nav>` : ''}
</header>
<main>${body}</main>
${manager ? `<footer>
  <span>${esc(manager.name)} · ${esc(orgContext.org.name)} · calendar: ${esc(manager.calendar_source)}</span>
  <form method="post" action="/demo/reset"><button class="link">Reset demo</button></form>
  <form method="post" action="/signout"><button class="link">Switch calendar</button></form>
</footer>` : ''}
</body>
</html>`;
}

// ---- welcome --------------------------------------------------------------

export function welcomePage({ googleReady, error }) {
  return layout({
    title: 'Welcome',
    body: `
<section class="welcome">
  <h1>Lead well in the moments already in your calendar.</h1>
  <p class="lead">LeadOS reads your calendar, spots your 1:1s, team meetings, planning blocks and difficult conversations, and gives you two or three questions before each one. Afterwards, two taps capture how it went. On Friday, you look back.</p>
  ${error ? `<p class="error">${esc(error)}</p>` : ''}
  <div class="choices">
    <div class="choice">
      <h2>Connect Google Calendar</h2>
      <p>Read-only. LeadOS sees each event's title, time and attendee count, never descriptions, notes or who attends.</p>
      ${googleReady
        ? '<a class="button primary" href="/connect/google">Connect Google Calendar</a>'
        : '<p class="muted">Not configured on this server. Set <code>GOOGLE_CLIENT_ID</code> and <code>GOOGLE_CLIENT_SECRET</code> (see README).</p>'}
    </div>
    <div class="choice">
      <h2>Try the demo week</h2>
      <p>Be Jordan, a customer support team lead in Leeds with seven reports and a realistic fortnight of meetings.</p>
      <form method="post" action="/demo/start"><button class="button${googleReady ? '' : ' primary'}">Open demo</button></form>
    </div>
  </div>
</section>`,
  });
}

// ---- today ----------------------------------------------------------------

function chips(e) {
  const t = momentTypes[e.moment_type];
  return `<span class="chip type-${e.moment_type}">${esc(t.label)}</span><span class="chip chip-pillar">${esc(pillarById(t.pillar).name)}</span>`;
}

function prepBlock(e) {
  const body = e.prep_questions
    ? `<p class="focus">${esc(e.prep_focus)}</p><ol>${e.prep_questions.map((q) => `<li>${esc(q)}</li>`).join('')}</ol>`
    : '<p class="muted loading">Getting your questions…</p>';
  return `<div class="prep" data-prep="${e.id}"${e.prep_questions ? ' data-ready' : ''}>
    <h3>Before</h3>
    <div class="prep-body">${body}</div>
  </div>`;
}

function captureBlock(e, nowIso) {
  if (e.start_utc > nowIso) {
    return `<div class="capture later"><h3>After</h3><p class="muted">Capture opens at ${formatTime(e.start_utc)}.</p></div>`;
  }
  const btns = (field, options, current) => options.map(([v, label]) =>
    `<button type="button" data-field="${field}" data-value="${v}" class="tap${current === v ? ' on' : ''}">${label}</button>`).join('');
  return `<div class="capture${e.rating && e.next_step ? ' done' : ''}" data-capture="${e.id}">
    <h3>After: how did it go? <span class="saved" aria-live="polite">${e.rating && e.next_step ? 'Captured' : ''}</span></h3>
    <div class="taps" role="group" aria-label="How did it go">${btns('rating', RATINGS, e.rating)}</div>
    <div class="taps" role="group" aria-label="What next">${btns('next_step', NEXT, e.next_step)}</div>
    <details${e.note ? ' open' : ''}><summary>Add a note (optional, only you see it)</summary>
      <textarea data-field="note" rows="2" maxlength="500" placeholder="One line is plenty">${esc(e.note)}</textarea>
      <button type="button" class="link save-note">Save note</button>
    </details>
  </div>`;
}

export function todayPage({ manager, day, events, nowIso }) {
  const moments = events.filter((e) => e.moment_type);
  const others = events.filter((e) => !e.moment_type);
  const isToday = day === dayKey();
  const cards = moments.map((e) => `
<article class="moment${e.end_utc < nowIso ? ' past' : ''}" id="m${e.id}">
  <div class="when">${formatTime(e.start_utc)}<span>${formatTime(e.end_utc)}</span></div>
  <div class="what">
    <h2>${esc(e.title)}</h2>
    <div class="meta">${chips(e)}<span class="muted">${e.attendee_count} ${e.attendee_count === 1 ? 'person' : 'people'}</span></div>
    <div class="loop">${prepBlock(e)}${captureBlock(e, nowIso)}</div>
  </div>
</article>`).join('');

  return layout({
    title: 'Today',
    active: 'today',
    manager,
    body: `
<div class="dayhead">
  <a class="arrow" href="/today?date=${addDays(day, -1)}" aria-label="Previous day">‹</a>
  <div>
    <h1>${isToday ? 'Today' : formatDay(day, { weekday: 'long' })}, ${formatDay(day, { day: 'numeric', month: 'long' })}</h1>
    <p class="muted">${moments.length ? `${moments.length} leadership moment${moments.length > 1 ? 's' : ''}` : 'No leadership moments'}${isToday ? '' : ` · <a href="/today">back to today</a>`}</p>
  </div>
  <a class="arrow" href="/today?date=${addDays(day, 1)}" aria-label="Next day">›</a>
</div>
${cards || `<p class="empty">Nothing on the calendar today looks like a 1:1, team meeting, planning block or difficult conversation.</p>`}
${others.length ? `<details class="others"><summary>${others.length} other event${others.length > 1 ? 's' : ''} (not moments)</summary><ul>${others.map((e) => `<li><span class="muted">${formatTime(e.start_utc)}</span> ${esc(e.title)}</li>`).join('')}</ul></details>` : ''}
${new Date(`${day}T12:00:00Z`).getUTCDay() === 5 ? `<p class="nudge">It's Friday. <a href="/lookback">Take five minutes to look back on the week →</a></p>` : ''}`,
  });
}

// ---- look-back ------------------------------------------------------------

const dot = (rating) => `<span class="dot ${rating}" title="${rating}"></span>`;

export function lookbackPage({ manager, summary, questions, saved }) {
  const { monday, moments, captured, openFollowUps, byPillar, lookback } = summary;
  const days = [0, 1, 2, 3, 4].map((i) => addDays(monday, i));
  const scores = lookback?.pillar_scores ?? {};

  const dayLists = days.map((d) => {
    const items = captured.filter((m) => dayKey(new Date(m.start_utc)) === d);
    if (!items.length) return '';
    return `<li><h3>${formatDay(d, { weekday: 'long' })}</h3><ul>${items.map((m) => `
      <li>${dot(m.rating)} <a href="/today?date=${d}#m${m.id}">${esc(m.title)}</a>
      ${m.next_step && m.next_step !== 'none' ? `<span class="chip">${m.next_step === 'follow_up' ? 'Follow up' : 'Revisit'}</span>` : ''}
      ${m.note ? `<p class="note">${esc(m.note)}</p>` : ''}</li>`).join('')}</ul></li>`;
  }).join('');

  return layout({
    title: 'Look-back',
    active: 'lookback',
    manager,
    body: `
<div class="dayhead">
  <a class="arrow" href="/lookback?week=${addDays(monday, -7)}" aria-label="Previous week">‹</a>
  <div><h1>Week of ${formatDay(monday, { day: 'numeric', month: 'long' })}</h1>
  <p class="muted">Your Friday look-back, pulled from the week's captures.</p></div>
  <a class="arrow" href="/lookback?week=${addDays(monday, 7)}" aria-label="Next week">›</a>
</div>
${saved ? '<p class="ok">Look-back saved.</p>' : ''}
<div class="stats">
  <div><b>${moments.length}</b><span>moments so far</span></div>
  <div><b>${captured.length}</b><span>captured</span></div>
  <div><b>${captured.filter((m) => m.rating === 'well').length}</b><span>went well</span></div>
  <div><b>${openFollowUps.length}</b><span>to follow up</span></div>
</div>
<section class="cols">
  <div>
    <h2>What happened</h2>
    ${dayLists ? `<ul class="week">${dayLists}</ul>` : '<p class="muted">No captures this week yet.</p>'}
  </div>
  <div>
    <h2>Think about</h2>
    <ol class="reflect">${questions.map((q) => `<li>${esc(q)}</li>`).join('')}</ol>
    <form method="post" action="/lookback?week=${monday}" class="lookback-form">
      <h2>How did you do?</h2>
      <p class="muted">Rate yourself on each pillar, 1 (struggled) to 5 (strong). Later this can be compared with how your team saw it.</p>
      ${pillars.map((p) => `<fieldset class="scale"><legend>${esc(p.name)} <span class="muted">${byPillar[p.id].moments ? `${byPillar[p.id].moments} moment${byPillar[p.id].moments > 1 ? 's' : ''}` : ''}</span></legend>
        ${[1, 2, 3, 4, 5].map((n) => `<label><input type="radio" name="score_${p.id}" value="${n}"${scores[p.id] === n ? ' checked' : ''}><span>${n}</span></label>`).join('')}
      </fieldset>`).join('')}
      <label class="field">One win from this week<textarea name="win" rows="2" maxlength="500">${esc(lookback?.win)}</textarea></label>
      <label class="field">One thing to try next week<textarea name="try_next" rows="2" maxlength="500">${esc(lookback?.try_next)}</textarea></label>
      <button class="button primary">${lookback ? 'Update look-back' : 'Save look-back'}</button>
    </form>
  </div>
</section>`,
  });
}

// ---- pillars --------------------------------------------------------------

function sparkline(points) {
  const w = 120, h = 32, n = points.length;
  const xy = points.map((p, i) => p.score == null ? null : [4 + (i * (w - 8)) / (n - 1), h - 4 - ((p.score - 1) / 4) * (h - 8)]);
  const segs = [];
  let cur = [];
  for (const pt of xy) { if (pt) cur.push(pt); else if (cur.length) { segs.push(cur); cur = []; } }
  if (cur.length) segs.push(cur);
  const last = xy.filter(Boolean).at(-1);
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="Self-rating over the last ${n} weeks">
    <line x1="4" x2="${w - 4}" y1="${h / 2}" y2="${h / 2}" class="mid"/>
    ${segs.map((s) => s.length > 1 ? `<polyline points="${s.map((p) => p.join(',')).join(' ')}"/>` : '').join('')}
    ${xy.filter(Boolean).map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2"/>`).join('')}
    ${last ? `<circle cx="${last[0]}" cy="${last[1]}" r="3.5" class="last"/>` : ''}
  </svg>`;
}

export function pillarsPage({ manager, progress }) {
  // Top-down like the stack: Sustain & Grow on top, Lead Yourself at the base. Systems stay underneath.
  const stack = [...progress.tiers].reverse();
  return layout({
    title: 'Your pillars',
    active: 'pillars',
    manager,
    body: `
<h1>Your pillars</h1>
<p class="muted">Each level enables the next. Built from your captured moments and Friday self-ratings.</p>
<div class="stack">
${stack.map((p) => {
    const latest = p.selfRatings.filter((r) => r.score != null).at(-1);
    return `<article class="tier t-${p.id}" id="tier-${p.id}">
  <header>
    <div><h2>${esc(p.name)}</h2><p class="muted">${esc(p.summary)}</p></div>
    <div class="trend"><span class="muted">Your self-rating${latest ? ` · ${latest.score}/5` : ''}</span>${sparkline(p.selfRatings)}</div>
  </header>
  ${p.captured ? `<p class="tier-stat">${p.captured} moment${p.captured === 1 ? '' : 's'} captured · ${pct(p.wellShare)} went well</p>` : ''}
  <details><summary>What’s underneath</summary><ul class="systems">${p.systems.map((s) => `<li>${esc(s.name)}${s.uses ? ` <span class="muted">· ${s.uses} ${s.unit}${s.uses === 1 ? '' : 's'}</span>` : ''}</li>`).join('')}</ul></details>
</article>`;
  }).join('')}
</div>`,
  });
}

// ---- HR -------------------------------------------------------------------

function barChart(series) {
  const w = 560, h = 180, pad = { l: 32, r: 8, t: 12, b: 26 };
  const max = Math.max(...series.map((s) => s.managers));
  const bw = (w - pad.l - pad.r) / series.length;
  const y = (v) => pad.t + (h - pad.t - pad.b) * (1 - v / max);
  return `<svg class="chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="Managers active per week, and those using LeadOS at three or more moments">
    ${[0, Math.round(max / 2), max].map((v) => `<line x1="${pad.l}" x2="${w - pad.r}" y1="${y(v)}" y2="${y(v)}" class="grid"/><text x="${pad.l - 6}" y="${y(v) + 4}" text-anchor="end">${v}</text>`).join('')}
    ${series.map((s, i) => {
      const x = pad.l + i * bw + bw * 0.18, bwi = bw * 0.64;
      return `<rect x="${x}" y="${y(s.active)}" width="${bwi}" height="${y(0) - y(s.active)}" class="active"><title>${s.active} active</title></rect>
        <rect x="${x}" y="${y(s.threePlus)}" width="${bwi}" height="${y(0) - y(s.threePlus)}" class="three"><title>${s.threePlus} at 3+ moments</title></rect>
        <text x="${x + bwi / 2}" y="${h - 8}" text-anchor="middle">${formatDay(s.monday, { day: 'numeric', month: 'short' })}</text>`;
    }).join('')}
  </svg>`;
}

export function hrPage({ manager, overview }) {
  const { series, current: c, groupTooSmall } = overview;
  return layout({
    title: 'HR view',
    active: 'hr',
    manager,
    body: `
<h1>Manager pilot: usage</h1>
<p class="banner">Stub for the Head of L&amp;D / CPO. A mocked cohort of 23 managers plus live demo data. Aggregates only: no individual manager, moment title or note is ever shown here.</p>
${groupTooSmall ? `<p class="muted">Fewer than ${MIN_GROUP} managers this week, so breakdowns are hidden.</p>` : `
<div class="stats">
  <div><b>${c.active}/${c.managers}</b><span>managers active this week</span></div>
  <div><b>${pct(c.threePlus / c.managers)}</b><span>used it at 3+ moments (pilot target)</span></div>
  <div><b>${c.avgMoments.toFixed(1)}</b><span>moments per active manager</span></div>
  <div><b>${pct(c.lookbackRate)}</b><span>did a weekly look-back</span></div>
</div>
<section>
  <h2>Weekly usage</h2>
  <p class="legend"><span class="key active"></span>Active managers <span class="key three"></span>At 3+ moments</p>
  ${barChart(series)}
</section>
<section>
  <h2>Where managers are using it this week</h2>
  <div class="mix">${c.byPillar.filter((p) => p.share > 0).map((p) => `<span class="seg seg-${p.id}" style="flex:${p.share}"><b>${esc(p.name)}</b> ${pct(p.share)}</span>`).join('')}</div>
</section>`}
<section>
  <h2>What this view never shows</h2>
  <ul><li>Any individual manager's activity, ratings or notes</li><li>Meeting titles or who attended</li><li>Breakdowns for groups smaller than ${MIN_GROUP} managers</li></ul>
</section>`,
  });
}
