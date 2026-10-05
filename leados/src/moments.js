// Tags calendar events as leadership moments using simple rules on title and attendee count.
// Only the title, time and attendee count are ever looked at (PRD: private by default).

const RULES = [
  {
    type: 'difficult',
    title: /\b(difficult|hard conversation|tough|performance (review|concern|chat|conversation)|pip|improvement plan|concerns?|disciplinary|grievance|investigation|absence (review|meeting)|redundan\w*|exit|let go|probation)\b/i,
    maxAttendees: 4,
  },
  {
    type: 'one_to_one',
    title: /(\b1\s?(?:[:\-/]|on|to)\s?1\b|\bone[- ](?:on|to)[- ]one\b|\bcatch[- ]?up\b|\bcheck[- ]?in\b)/i,
    maxAttendees: 2,
  },
  {
    type: 'planning',
    title: /\b(planning|plan|priorit\w*|roadmap|strategy|focus (time|block)|prep|okrs?|goals?)\b/i,
    maxAttendees: 1,
  },
  {
    type: 'team_meeting',
    title: /\b(team|stand[- ]?up|huddle|sync|retro\w*|all[- ]hands|weekly|kick[- ]?off|town ?hall)\b/i,
    minAttendees: 3,
  },
];

const IGNORE = /\b(lunch|ooo|out of office|holiday|annual leave|commute|gym|dentist|doctor|travel|blocked|busy|interview)\b/i;

/**
 * @param {{title: string, attendeeCount: number}} event
 * @returns {'difficult'|'one_to_one'|'planning'|'team_meeting'|null}
 */
export function classifyMoment({ title = '', attendeeCount = 1 }) {
  if (IGNORE.test(title)) return null;

  for (const rule of RULES) {
    if (!rule.title.test(title)) continue;
    if (rule.maxAttendees && attendeeCount > rule.maxAttendees) continue;
    if (rule.minAttendees && attendeeCount < rule.minAttendees) continue;
    return rule.type;
  }

  // Fallbacks on attendee count alone when the title says nothing either way.
  if (attendeeCount === 2) return 'one_to_one';
  return null;
}
