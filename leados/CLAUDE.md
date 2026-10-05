# LeadOS prototype: working rules

## Red/green TDD is mandatory

Every behaviour change follows red, green, refactor:

1. **Red.** Write or change a test that describes the behaviour. Run it and see it fail for the
   right reason (an assertion, not a typo or a missing server). Paste the failing output in the PR or commit body.
2. **Green.** Write the least code that makes it pass. Run the whole suite.
3. **Refactor** with the suite green. No new behaviour in this step.

Bug fixes start with a test that reproduces the bug. Never skip, delete or weaken a test to get green;
if a test is wrong, fix the test in its own step and say why.

## Test layers

| Layer | Where | Run |
| --- | --- | --- |
| Unit: rules (moment tagging, unlock weeks, summaries, privacy) | `test/*.test.js` (node:test) | `npm test` |
| End to end: the demo mockup and the web app, desktop and phone, axe accessibility | `e2e/*.spec.js` (Playwright) | `npm run test:e2e` |

`npm run test:all` runs both. CI (`.github/workflows/leados.yml`) runs both on every push.

Pure logic lives where unit tests can import it (`src/`, `demo/logic.js`). Pages stay thin and are covered by Playwright.

## Product rules the tests guard

- LeadOS lives inside the calendar (a Google Workspace Calendar add-on side panel), not a separate app.
- Only an event's title, time and attendee count are read. HR views show aggregates only.
- Prompts ask questions; they never script what the manager says.
