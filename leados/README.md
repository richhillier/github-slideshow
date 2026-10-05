# LeadOS prototype

A working prototype of the one manager loop in the LeadOS PRD: **calendar in → a prompt at the right moment → quick capture out → a weekly look-back.**

LeadOS adds no new channel and sends no notifications. It reads the manager's calendar, spots leadership moments, and gives them a Today page to open in the gap before or after each one.

## Run it

Needs Node 22.13 or later (it uses the built-in `node:sqlite`).

```bash
cd leados
npm install
npm start            # http://localhost:3000
```

Pick **Open demo** to be Jordan Reid, a customer support team lead in Leeds with seven reports and a seeded fortnight of meetings. **Reset demo** in the footer reseeds it around today's date.

To use real data, copy `.env.example` to `.env`, fill it in, and run `node --env-file=.env server.js`.

| Setting | What it turns on |
| --- | --- |
| `ANTHROPIC_API_KEY` | Prep questions written by Claude (`claude-opus-5-5`, low effort, structured output, server-side refusal fallback on), grounded in the org-context file. Without it, a built-in question library is used. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | "Connect Google Calendar" (read-only scope `calendar.events.readonly`). Create an OAuth client of type *Web application* in Google Cloud and add `http://localhost:3000/oauth/google/callback` as a redirect URI. |

Tests: `npm test`.

## What's in it (PRD scope)

| # | PRD item | Where |
| --- | --- | --- |
| 1 | Calendar connect, moment tagging | `src/calendar.js`, `src/moments.js` |
| 2 | Today page | `/today` (add `?date=YYYY-MM-DD` to look at another day) |
| 3 | Prep card: 2–3 questions, never a script | `src/prep.js` |
| 4 | Quick capture: two taps + optional note | Today page, `POST /api/capture/:id` |
| 5 | Weekly look-back | `/lookback` |
| 6 | Pillar view: the operating stack, five tiers and ten systems (S0–S9) | `/pillars` |
| 7 | HR view stub: aggregates only, mocked cohort | `/hr` |

**Moment rules.** An event becomes a moment from its title and attendee count only: difficult conversation (e.g. "performance", "concerns", "tough feedback", up to 4 people), 1:1 ("1:1", "1-1", "catch-up", or any 2-person event), planning block ("plan", "focus time", solo), team meeting ("team", "stand-up", "retro", 3+ people). Lunch, interviews, leave and the like are ignored. Rules and test cases: `src/moments.js`, `test/leados.test.js`.

**Capture.** Tap 1: went well / mixed / hard. Tap 2: nothing / follow up / revisit. A note is optional and only the manager sees it. A "follow up" carries into the next prep card for a meeting with the same title.

**The stack.** `config/org-context.json` holds the five tiers (Lead Yourself, Set the Standard, Develop People, Hold the Standard, Grow & Sustain) and their ten systems. Moments feed systems: 1:1s feed S5 1:1, team meetings S4 Communication, planning blocks S3 Planning, difficult conversations S6 Feedback; look-backs feed S9 Reflection. Systems switch on by programme week (S7 at week 6, S8 at week 10, S9 at week 12); the demo manager is in week 5.

**Look-back.** Counts and the week's captures, three reflection questions drawn from them, then a 1–5 self-rating per pillar, one win, and one thing to try. The self-ratings are stored per week as the "manager-said" half of a later "manager-said vs. team-saw" comparison.

## Principles, and how the build holds them

- **No new noise:** no notifications, email, Slack or push. Only the Today page.
- **Questions, not scripts:** the Claude system prompt forbids scripts and talking points; the library holds only questions.
- **Under two minutes a moment:** 2–3 questions; capture is two taps.
- **Your org, not generic:** `config/org-context.json` holds the org's values, manager standards, pillars and systems, and goes into every Claude prompt.
- **Private by default:** the Google request uses a field mask, so LeadOS never receives descriptions, locations, links or attendee identities, only title, time and attendee count. The HR view reads usage counts only and hides breakdowns for groups under 5 managers. A test checks that no note or meeting title reaches the HR page.

The manager's own notes from earlier moments with the same title are sent to Claude to shape the next prep card. Worth confirming in the solicitor review.

## Placeholders to replace

- **Northwind Logistics** and its values are fictional demo content.
- **HR cohort data** is mocked (23 managers) and mixed with live demo usage.

## Not built (PRD "out for now")

Slack/Teams bots, push notifications, gamification, recording or transcripts, Outlook / Microsoft 365, SSO, multi-tenant admin and billing, full content for all ten systems. It's also a single-user prototype: the current manager is a cookie, not an account.
