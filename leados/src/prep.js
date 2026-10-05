// Prep cards: two or three questions to think through before a moment. Never a script.
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import { orgContext, momentTypes, pillarById } from './org.js';
import { formatTime, formatDay, dayKey } from './time.js';

export const MODEL = process.env.LEADOS_MODEL ?? 'claude-opus-5-5';

export const aiEnabled = () =>
  process.env.LEADOS_AI !== 'off' && Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);

let client;
const getClient = () => (client ??= new Anthropic({ timeout: 45_000, maxRetries: 1 }));

// ---- question library (works with no API key) ----------------------------

const [v1, v2, v3] = orgContext.values.map((v) => v.name);

const LIBRARY = {
  one_to_one: {
    focus: 'Their agenda first: how they are, what is in their way, how they are growing.',
    questions: [
      'What do you want them to leave this 1:1 feeling or knowing?',
      'What have you noticed about their work since you last spoke that you have not yet said out loud?',
      'What is one thing in their way that only you can remove?',
      'Where could they stretch next, and do they know you see it?',
      'When did you last ask what would make their job better, and listen to the answer?',
    ],
  },
  team_meeting: {
    focus: 'Use the team\'s time for decisions and problems, not status.',
    questions: [
      'What is the one decision or problem this meeting must move forward?',
      'Who has been quiet lately, and how will you bring them in?',
      'How will every action leave the room with an owner and a date?',
      `Where does "${v3}" show up in what you will discuss?`,
    ],
  },
  planning: {
    focus: 'Protect the time and decide what matters most.',
    questions: [
      'If the team only got three things done this week, which three should they be?',
      'What are you doing that someone on the team could own instead?',
      'What are you saying yes to that you should drop or delay?',
      'Does each person on the team know the top priority, in the same words?',
    ],
  },
  difficult: {
    focus: `${v2}: specific, early and fair.`,
    questions: [
      'What is the one message they must leave understanding, in a single sentence?',
      'Which two or three specific examples will you use, and are they facts, not impressions?',
      'What might be going on for them that you do not know yet, and how will you ask?',
      'What does a good outcome look like, and what support will you offer?',
      'Does your HR business partner need to know before or after this?',
    ],
  },
};

function hash(s) {
  let h = 0;
  for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

/** Deterministic prep from the library: 3 questions rotated by event so repeats vary. */
export function libraryPrep(event, previous = []) {
  const lib = LIBRARY[event.moment_type] ?? LIBRARY.one_to_one;
  const start = hash(event.ext_id ?? event.id) % lib.questions.length;
  const questions = [0, 1, 2].map((i) => lib.questions[(start + i) % lib.questions.length]);
  const last = previous[0];
  if (last && (last.next_step === 'follow_up' || last.next_step === 'revisit')) {
    questions[2] = 'Last time you marked this to follow up. What did you commit to, and has it happened?';
  }
  return { focus: lib.focus, questions };
}

// ---- Claude-generated prep -----------------------------------------------

const PrepSchema = z.object({
  focus: z.string().describe('One short line, under 15 words, naming what this moment is for.'),
  questions: z.array(z.string()).describe('Two or three questions for the manager to think through.'),
});

const SYSTEM = `You write prep cards for LeadOS, a tool that helps first-time and frontline managers at UK companies lead well in moments already on their calendar.

A prep card is read in the two minutes before a meeting. It has a one-line focus and two or three questions the manager thinks through on their own.

Rules:
- Ask questions; never write a script, talking points, or words for the manager to say. The manager does the thinking.
- Two or three questions, each under 25 words, concrete to this moment. No generic coaching filler.
- Ground questions in this organisation's values and manager standards where they genuinely apply, naming them in the org's own words. Don't force one in.
- You only know the meeting title, time and attendee count, plus the manager's own short notes from earlier moments with the same title. Don't invent facts about anyone.
- If an earlier note left something open, one question should pick it up.
- British English. Plain words. No emoji.

Organisation context (JSON):
${JSON.stringify({ org: orgContext.org, values: orgContext.values, managerStandards: orgContext.managerStandards, pillars: orgContext.pillars }, null, 2)}`;

function userPrompt(event, previous) {
  const type = momentTypes[event.moment_type];
  const pillar = pillarById(type.pillar);
  const lines = [
    `Moment type: ${type.label} (pillar: ${pillar.name} — ${pillar.summary})`,
    `Calendar title: ${event.title}`,
    `When: ${formatDay(dayKey(new Date(event.start_utc)))}, ${formatTime(event.start_utc)}–${formatTime(event.end_utc)}`,
    `Attendees including the manager: ${event.attendee_count}`,
  ];
  if (previous.length) {
    lines.push('', 'The manager\'s captures from earlier moments with the same title (most recent first):');
    for (const p of previous) {
      lines.push(`- ${formatDay(dayKey(new Date(p.start_utc)), { day: 'numeric', month: 'short' })}: went ${{ well: 'well', mixed: 'mixed', hard: 'badly' }[p.rating] ?? 'unrated'}, next step: ${{ none: 'nothing', follow_up: 'follow up', revisit: 'revisit' }[p.next_step] ?? 'not set'}${p.note ? `, note: "${p.note}"` : ''}`);
    }
  }
  lines.push('', 'Write the prep card.');
  return lines.join('\n');
}

async function claudePrep(event, previous) {
  const response = await getClient().beta.messages.parse({
    model: MODEL,
    max_tokens: 4000,
    output_config: { effort: 'low', format: betaZodOutputFormat(PrepSchema) },
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    cache_control: { type: 'ephemeral' },
    system: SYSTEM,
    messages: [{ role: 'user', content: userPrompt(event, previous) }],
  });
  if (response.stop_reason === 'refusal') throw new Error('Prep request declined');
  const out = response.parsed_output;
  const questions = (out?.questions ?? []).map((q) => q.trim()).filter(Boolean).slice(0, 3);
  if (!out?.focus || questions.length < 2) throw new Error('Prep response did not match the card shape');
  return { focus: out.focus.trim(), questions };
}

/** Returns {focus, questions, source}. Falls back to the library if Claude is off or fails. */
export async function buildPrep(event, previous = []) {
  if (aiEnabled()) {
    try {
      return { ...(await claudePrep(event, previous)), source: 'claude' };
    } catch (err) {
      if (err instanceof Anthropic.APIError) {
        console.warn(`[prep] Claude API error ${err.status ?? ''}: ${err.message}. Using library.`);
      } else {
        console.warn(`[prep] ${err.message}. Using library.`);
      }
    }
  }
  return { ...libraryPrep(event, previous), source: 'library' };
}
