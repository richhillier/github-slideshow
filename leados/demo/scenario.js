// LeadOS demo scenario: Jordan Reid's week, a support team lead at a fictional UK company.
// Load after logic.js. Every event is tagged by LeadOSLogic.classify from its title and attendee count.
(() => {
  const L = globalThis.LeadOSLogic;
  const TODAY_IDX = 4; // Friday
  const NOW = '11:20';

  const ORG = {
    name: 'Northwind Logistics (demo company)',
    values: ['Own it end to end', 'Say the hard thing kindly', 'Customers feel the difference'],
    standards: [
      'Every direct report has a 1:1 at least every two weeks.',
      'Feedback is given within 48 hours of the moment.',
      'Performance concerns are raised early, with specific examples, and shared with the HR business partner before any formal step.',
      'Team meetings end with an owner and a date for every action.',
      'Every team member can say what the team’s top three priorities are.',
    ],
  };

  const E = (id, day, start, end, title, n, colour = 'blue', extra = {}) =>
    ({ id, day, start, end, title, n, colour, type: L.classify(title, n), ...extra });

  const EVENTS = [
    E('mon-plan', 0, '08:30', '09:00', 'Plan the week', 1, 'grey'),
    E('mon-standup', 0, '09:30', '09:45', 'CX team stand-up', 8),
    E('mon-priya', 0, '11:00', '11:30', '1:1 Jordan / Priya', 2),
    E('mon-lunch', 0, '13:00', '13:45', 'Lunch', 1, 'sage'),
    E('mon-ops', 0, '14:00', '15:00', 'Ops review with Facilities', 5),
    E('mon-marcus', 0, '15:30', '16:00', '1:1 Jordan / Marcus', 2),
    E('tue-standup', 1, '09:30', '09:45', 'CX team stand-up', 8),
    E('tue-q4', 1, '10:00', '11:00', 'Q4 priorities planning block', 1, 'grey'),
    E('tue-aisha', 1, '11:30', '12:00', '1:1 Jordan / Aisha', 2),
    E('tue-lunch', 1, '13:00', '13:45', 'Lunch', 1, 'sage'),
    E('tue-dan', 1, '14:00', '14:30', 'Attendance concerns: Dan', 2),
    E('tue-rota', 1, '16:00', '16:45', 'Rota review with WFM', 4),
    E('wed-standup', 2, '09:30', '09:45', 'CX team stand-up', 8),
    E('wed-tom', 2, '10:00', '10:30', '1:1 Jordan / Tom', 2),
    E('wed-lunch', 2, '13:00', '13:45', 'Lunch', 1, 'sage'),
    E('wed-retro', 2, '13:45', '14:45', 'Team retro', 8),
    E('wed-focus', 2, '15:00', '16:30', 'Focus time', 1, 'grey'),
    E('thu-interview', 3, '09:00', '09:45', 'Interview: CX Advisor', 3),
    E('thu-standup', 3, '09:30', '09:45', 'CX team stand-up', 8),
    E('thu-ellie', 3, '11:00', '11:30', '1:1 Jordan / Ellie', 2),
    E('thu-lunch', 3, '13:00', '13:45', 'Lunch', 1, 'sage'),
    E('thu-head', 3, '14:00', '14:30', 'Catch-up with Head of CX', 2),

    // Friday: moments across all five pillars, and only one ordinary 1:1.
    E('rota', 4, '08:30', '09:15', 'Focus: decide on weekend rota', 1, 'grey', {
      prep: { focus: 'Make the call, then say why.', questions: [
        'What are the two real options, and what does each cost the team?',
        'Who needs to hear the decision first, and from you?',
        'What would make you change your mind next month?'] } }),
    E('standup', 4, '09:30', '09:45', 'CX team stand-up', 8, 'blue', {
      prep: { focus: 'Decisions and blockers, not status.', questions: [
        'What is the one decision or blocker this stand-up must move forward?',
        'Stand-ups ran over twice this week. What will you cut to keep this one to 15 minutes?',
        'Who has been quiet lately, and how will you bring them in?'] } }),
    E('kickoff', 4, '10:00', '10:45', 'Q4 goals kick-off', 8, 'blue', {
      context: 'Tuesday’s planning block: went well. You set three Q4 priorities.',
      prep: { focus: 'Everyone leaves able to say the top three priorities.', questions: [
        'Can you say the three Q4 priorities in one sentence each, without slides?',
        'What will each person do differently on Monday because of them?',
        'How will you check in two weeks that the team can still name them?'] } }),
    E('sam', 4, '11:00', '11:30', '1:1 Jordan / Sam', 2, 'blue', {
      context: 'Last 1:1 two weeks ago: went well.',
      prep: { focus: 'Their agenda first: how they are, what is in their way, how they are growing.', questions: [
        'What do you want Sam to leave this 1:1 feeling or knowing?',
        'What have you noticed about Sam’s work since you last spoke that you haven’t said out loud?',
        'What is one thing in Sam’s way that only you can remove?'] } }),
    E('marcus', 4, '12:00', '12:30', 'Tough feedback: Marcus (missed SLAs)', 2, 'blue', {
      context: 'Monday’s 1:1 with Marcus: mixed, marked to follow up. <q>Quiet, low energy. Did not get to SLAs.</q>',
      prep: {
        focus: 'Say the hard thing kindly: specific, early and fair.',
        questions: [
          'What is the one change Marcus must leave understanding, in a single sentence?',
          'Which two missed SLAs will you use as examples, and are they facts rather than impressions?',
          'On Monday he was quiet and low on energy. What might be going on that you haven’t asked about yet?'],
        // Used once Feedback is a habit (promptDepth 'deeper'). Adds consequence; keeps the person question.
        deeper: {
          focus: 'Say the hard thing kindly: specific, early and fair.',
          questions: [
            { kind: 'process', text: 'What is the one change Marcus must leave understanding, in a single sentence?' },
            { kind: 'person', text: 'On Monday he was quiet and low on energy. What might be going on that you haven\u2019t asked about yet?' },
            { kind: 'process', text: 'If nothing changes in two weeks, what happens next, and does your HR business partner need to know first?' },
          ],
        },
      } }),
    E('lunch', 4, '13:00', '13:45', 'Lunch', 1, 'sage'),
    E('aisha', 4, '14:30', '15:00', 'Career chat: Aisha', 2, 'blue', {
      context: 'Tuesday’s 1:1 with Aisha: mixed. <q>Struggling with the late shifts. Asked what a team lead role would take.</q>',
      prep: { focus: 'Her growth, in her words.', questions: [
        'What does Aisha want her role to look like in a year, and have you asked her directly?',
        'Which piece of real work could stretch her towards that before Christmas?',
        'What do you know about the late shifts that she needs to hear from you today?'] } }),
    E('wrap', 4, '15:30', '16:00', 'Weekly wrap-up and plan next week', 1, 'grey', {
      prep: { focus: 'Protect next week’s time and decide what matters most.', questions: [
        'If the team only got three things done next week, which three should they be?',
        'Which of this week’s follow-ups need a slot in next week’s calendar?',
        'What are you saying yes to next week that you should drop or delay?'] } }),
    E('vendor', 4, '16:30', '17:15', 'Vendor demo: new ticketing tool', 6),
  ];

  const SEED_CAPTURES = {
    'mon-plan': { rating: 'well' },
    'mon-standup': { rating: 'mixed', next: 'revisit', note: 'Ran over again, too much status.' },
    'mon-priya': { rating: 'well', note: 'Wants to lead the chat-channel pilot.' },
    'mon-marcus': { rating: 'mixed', next: 'follow_up', note: 'Quiet, low energy. Did not get to SLAs.' },
    'tue-standup': { rating: 'well' },
    'tue-q4': { rating: 'well', note: 'Three Q4 priorities agreed with myself. Share Friday.' },
    'tue-aisha': { rating: 'mixed', next: 'follow_up', note: 'Struggling with the late shifts. Asked what a team lead role would take.' },
    'tue-dan': { rating: 'hard', next: 'follow_up', note: 'Stated the facts; he opened up about childcare. Speak to HRBP.' },
    'wed-standup': { rating: 'mixed', next: 'none', note: 'Ran over again.' },
    'wed-tom': { rating: 'well' },
    'wed-retro': { rating: 'well', note: 'Good energy; actions had no owners again.' },
    'thu-ellie': { rating: 'well', note: 'Wants more customer escalations to learn from.' },
    'thu-head': { rating: 'well' },
    rota: { rating: 'well' },
    standup: { rating: 'well', note: 'Kept it to 15 minutes. First time this week.' },
  };

  // Earlier weeks, so pillar trends have a shape. Not shown to managers as counts of anything missed.
  const BASE_USES = { S0: 14, S1: 3, S2: 2, S3: 9, S4: 13, S5: 21, S6: 3, S7: 1, S8: 1, S9: 4 };
  const SELF_HISTORY = {
    'lead-yourself': [2, 2, 3, 3], 'set-standard': [2, 2, 3, 3], 'develop-people': [3, 3, 3, 4],
    'hold-standard': [1, 2, 2, 2], 'sustain-grow': [2, 2, null, 3],
  };
  const LAST_TRY = 'End stand-ups at 15 minutes and give every retro action an owner';
  const HR_WEEKS = [
    { w: 'Wk 1', active: 15, three: 9 }, { w: 'Wk 2', active: 18, three: 12 }, { w: 'Wk 3', active: 17, three: 13 },
    { w: 'Wk 4', active: 19, three: 14 }, { w: 'Wk 5', active: 19, three: 14 },
  ];
  const PILOT_WEEK = 5;

  globalThis.LeadOSScenario = { TODAY_IDX, NOW, ORG, EVENTS, SEED_CAPTURES, BASE_USES, SELF_HISTORY, LAST_TRY, HR_WEEKS, PILOT_WEEK };
})();
