// The LeadOS demo: a read-only add-on inside a Google Calendar-style view.
// Scenario: Jordan Reid, Friday, the clock fixed at 11:20. Claude prompts are off (no window.claude).
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const URL = 'http://localhost:4310/index.html';
const PILLARS = ['Lead Yourself', 'Set the Standard', 'Develop People', 'Hold the Standard', 'Sustain & Grow'];

const panel = (page) => page.getByRole('complementary', { name: 'LeadOS' });
const row = (page, title) => panel(page).getByTestId('moment-row').filter({ hasText: title });
const isMobile = (testInfo) => testInfo.project.name === 'mobile';

/** Open an event the way a user would: tap it in the calendar grid. Friday is today; titles like Lunch repeat. */
async function openEvent(page, title) {
  await page.getByTestId('cal-event').filter({ hasText: title }).last().click();
  await expect(panel(page).getByRole('heading', { name: title })).toBeVisible();
}

/** Text of the manager-facing panel, whatever card is showing. */
const panelText = async (page) => (await panel(page).innerText()).replace(/\s+/g, ' ');

/** The manager UI never shows system codes, week-unlock language, red badges or capture counts. */
async function expectCleanManagerUi(page) {
  const text = await panelText(page);
  expect(text).not.toMatch(/\bS\d\b/);
  expect(text).not.toMatch(/\bweek \d+\b|switches on|unlock|locked/i);
  expect(text).not.toMatch(/Capture now|Prep ready|Grow & Sustain|programme/i);
  expect(text).not.toMatch(/\d+ (uncaptured|to capture|not captured)/i);
}

test.beforeEach(async ({ page }) => {
  await page.goto(URL);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test('loads cleanly: no script errors or failed local requests', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)|ERR_CERT|net::/.test(m.text())) errors.push(m.text()); });
  const failed = [];
  page.on('requestfailed', (r) => { if (r.url().startsWith('http://localhost')) failed.push(r.url()); });
  await page.reload();
  await expect(panel(page)).toBeVisible();
  expect(errors).toEqual([]);
  expect(failed).toEqual([]);
});

test('LeadOS lives inside the calendar: grid plus the add-on side panel', async ({ page }, testInfo) => {
  await expect(page.getByTestId('cal-grid')).toBeVisible();
  await expect(page.getByTestId('day-col')).toHaveCount(isMobile(testInfo) ? 1 : 5);
  await expect(page.getByTestId('now-line')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Lunch, Friday/ })).toBeVisible();
});

test('panel home holds three things: energy check-in, today’s moments, Friday look-back', async ({ page }) => {
  const p = panel(page);
  await expect(p.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
  await expect(p.getByRole('group', { name: 'Energy' })).toBeVisible();
  await expect(p.getByTestId('moment-row')).toHaveCount(7);
  await expect(p.getByRole('button', { name: 'Friday look-back' })).toBeVisible();
  await expect(p.getByRole('button', { name: 'Your pillars' })).toBeVisible(); // quietly, in the header
  await expectCleanManagerUi(page);
});

test('Friday shows moments from at least four pillars, with one ordinary 1:1', async ({ page }) => {
  const pillars = await panel(page).getByTestId('moment-row').evaluateAll((rows) => [...new Set(rows.map((r) => r.dataset.pillar))]);
  expect(pillars.length).toBeGreaterThanOrEqual(4);
  await expect(row(page, '1:1')).toHaveCount(1);
});

test('row status: Now, Up next, a tick, a quiet "How did it go?", or nothing', async ({ page }) => {
  await expect(row(page, 'CX team stand-up').getByRole('img', { name: 'Captured' })).toBeVisible();
  await expect(row(page, 'Q4 goals kick-off')).toContainText('How did it go?');
  await expect(row(page, '1:1 Jordan / Sam')).toContainText('Now');
  await expect(row(page, 'Tough feedback: Marcus')).toContainText('Up next');
  await expect(row(page, 'Weekly wrap-up')).not.toContainText(/Now|Up next|How did it go/);
  await expect(row(page, 'Lunch')).toHaveCount(0);
});

test('each moment row shows its pillar as a dot and name, never a system code', async ({ page }) => {
  await expect(row(page, 'Tough feedback: Marcus')).toContainText('Hold the Standard');
  await expect(row(page, 'Career chat: Aisha')).toContainText('Sustain & Grow');
  await expect(row(page, 'Focus: decide on weekend rota')).toContainText('Lead Yourself');
  await expect(row(page, 'Q4 goals kick-off')).toContainText('Set the Standard');
});

test('capture is one tap when it went well', async ({ page }) => {
  await openEvent(page, 'Q4 goals kick-off');
  const p = panel(page);
  await p.getByRole('button', { name: 'Went well' }).click();
  await expect(p.getByRole('img', { name: 'Captured' })).toBeVisible();
  await expect(p.getByRole('group', { name: 'What next' })).toHaveCount(0);
  await p.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(row(page, 'Q4 goals kick-off').getByRole('img', { name: 'Captured' })).toBeVisible();
});

test('"What next?" appears only after Mixed or Hard', async ({ page }) => {
  await openEvent(page, 'Q4 goals kick-off');
  const p = panel(page);
  await p.getByRole('button', { name: 'Mixed' }).click();
  await expect(p.getByRole('group', { name: 'What next' })).toBeVisible();
  await expect(p.getByRole('img', { name: 'Captured' })).toHaveCount(0);
  await p.getByRole('button', { name: 'Follow up' }).click();
  await expect(p.getByRole('img', { name: 'Captured' })).toBeVisible();
  await p.getByRole('button', { name: 'Went well' }).click();
  await expect(p.getByRole('group', { name: 'What next' })).toHaveCount(0);
});

test('prep before the next moment: pillar, last time’s note, three questions, no capture yet', async ({ page }) => {
  await openEvent(page, 'Tough feedback: Marcus (missed SLAs)');
  const p = panel(page);
  await expect(p.getByTestId('pillar-tag')).toHaveText('Hold the Standard');
  await expect(p.getByText('Quiet, low energy. Did not get to SLAs.')).toBeVisible();
  await expect(p.getByTestId('prep-question')).toHaveCount(3);
  for (const q of await p.getByTestId('prep-question').allTextContents()) expect(q.trim()).toMatch(/\?$/);
  await expect(p.getByRole('button', { name: 'Went well' })).toHaveCount(0);
  await expectCleanManagerUi(page);
});

test('context carries across the week into a career chat', async ({ page }) => {
  await openEvent(page, 'Career chat: Aisha');
  await expect(panel(page).getByTestId('pillar-tag')).toHaveText('Sustain & Grow');
  await expect(panel(page)).toContainText('Asked what a team lead role would take.');
});

test('Claude button is hidden when Claude is not available to the page', async ({ page }) => {
  await openEvent(page, 'Tough feedback: Marcus (missed SLAs)');
  await expect(panel(page).getByRole('button', { name: /Claude/ })).toHaveCount(0);
});

test('a non-moment event says so', async ({ page }) => {
  await openEvent(page, 'Lunch');
  await expect(panel(page).getByText('Not a leadership moment')).toBeVisible();
});

test('opening an event shows the calendar’s own read-only event details', async ({ page }) => {
  await page.getByTestId('cal-event').filter({ hasText: 'Tough feedback: Marcus' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Tough feedback: Marcus (missed SLAs)' });
  await expect(dialog).toContainText('12:00');
  await expect(dialog).toContainText('2 guests');
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(dialog).toHaveCount(0);
});

test('"What LeadOS reads" is a small footer that expands', async ({ page }) => {
  const p = panel(page);
  const what = p.getByText('What LeadOS reads');
  await expect(what).toBeVisible();
  await expect(p.getByText('title, time and attendee count')).toBeHidden();
  await what.click();
  await expect(p.getByText('title, time and attendee count')).toBeVisible();
});

test('Friday look-back: stats, up to three questions, five pillar ratings, save', async ({ page }) => {
  const p = panel(page);
  await p.getByRole('button', { name: 'Friday look-back' }).click();
  await expect(p.getByRole('heading', { name: 'Friday look-back' })).toBeVisible();
  const qs = p.getByTestId('reflect-question');
  expect(await qs.count()).toBeLessThanOrEqual(3);
  await expect(qs.first()).toContainText('Attendance concerns: Dan');
  for (const name of PILLARS) await p.getByRole('radiogroup', { name }).getByRole('radio', { name: '4' }).check({ force: true });
  await p.getByLabel('One win from this week').fill('Had the Dan conversation early.');
  await p.getByLabel('One thing to try next week').fill('Owners on every retro action.');
  await p.getByRole('button', { name: 'Save look-back' }).click();
  await expect(p.getByText('Look-back saved')).toBeVisible();
  await expectCleanManagerUi(page);

  await p.getByRole('button', { name: 'Your pillars' }).click();
  await expect(p.getByTestId('pillar-row').filter({ hasText: 'Hold the Standard' })).toContainText('4/5');
});

test('Your pillars: five rows, systems only under a collapsed "What’s underneath"', async ({ page }) => {
  const p = panel(page);
  await p.getByRole('button', { name: 'Your pillars' }).click();
  await expect(p.getByRole('heading', { name: 'Your pillars' })).toBeVisible();
  const rows = p.getByTestId('pillar-row');
  await expect(rows).toHaveCount(5);
  expect((await rows.allInnerTexts()).map((t) => t.split('\n')[0].trim())).toEqual([...PILLARS].reverse());
  await expect(rows.filter({ hasText: 'Develop People' })).toContainText(/\d+ this week/);
  const dp = rows.filter({ hasText: 'Develop People' });
  await expect(dp.getByText('1:1s')).toBeHidden();
  await dp.getByText('What’s underneath').click();
  await expect(dp.getByText('1:1s')).toBeVisible();
  await expectCleanManagerUi(page);
});

test('HR dashboard: aggregates only, pilot framing allowed, new pillar names', async ({ page }) => {
  await openEvent(page, 'Q4 goals kick-off');
  await panel(page).getByRole('button', { name: 'Hard' }).click();
  await panel(page).getByRole('button', { name: 'Follow up' }).click();
  await page.getByRole('button', { name: 'HR dashboard' }).click();
  const hr = page.getByRole('main', { name: 'HR dashboard' });
  await expect(hr).toContainText('Pilot week 5 of 12');
  await expect(hr).toContainText('managers active this week');
  await expect(hr).toContainText('Sustain & Grow');
  const text = await hr.innerText();
  for (const s of ['Marcus', 'Aisha', 'Dan', 'Quiet, low energy', 'Attendance concerns', 'Jordan / ', 'Grow & Sustain']) expect(text).not.toContain(s);
});

test('captures survive a reload; Reset demo clears them', async ({ page }) => {
  await openEvent(page, 'Q4 goals kick-off');
  await panel(page).getByRole('button', { name: 'Went well' }).click();
  await page.reload();
  await expect(row(page, 'Q4 goals kick-off').getByRole('img', { name: 'Captured' })).toBeVisible();
  await page.getByRole('button', { name: 'Reset demo' }).click();
  await expect(row(page, 'Q4 goals kick-off')).toContainText('How did it go?');
});

test('demo script steps drive the walkthrough', async ({ page }) => {
  await page.getByRole('button', { name: 'Demo script' }).click();
  const script = page.getByRole('dialog', { name: 'Demo script' });
  await expect(script.getByRole('listitem')).toHaveCount(6);
  await expect(script).not.toContainText(/switches on|unlock/i);
  await script.getByRole('button', { name: /Capture in one tap/ }).click();
  await expect(panel(page).getByRole('heading', { name: 'Q4 goals kick-off' })).toBeVisible();
  await expect(panel(page).getByRole('button', { name: 'Went well' })).toBeInViewport();
});

test('no horizontal scrolling at this width', async ({ page }) => {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test('accessibility: no serious or critical axe violations', async ({ page }) => {
  const check = async () => {
    const r = await new AxeBuilder({ page }).analyze();
    return r.violations.filter((v) => ['serious', 'critical'].includes(v.impact)).map((v) => `${v.id}: ${v.nodes.length} × ${v.nodes[0]?.target}`);
  };
  expect(await check()).toEqual([]);
  await openEvent(page, 'Q4 goals kick-off');
  expect(await check()).toEqual([]);
  await panel(page).getByRole('button', { name: 'Your pillars' }).click();
  expect(await check()).toEqual([]);
  await page.getByRole('button', { name: 'HR dashboard' }).click();
  expect(await check()).toEqual([]);
});

test('deeper prep for Marcus keeps the question about him, with a quiet meta line', async ({ page }) => {
  await openEvent(page, 'Tough feedback: Marcus (missed SLAs)');
  const p = panel(page);
  await expect(p.getByText('Building on your feedback habit')).toBeVisible();
  await expect(p.getByTestId('prep-question')).toHaveCount(3);
  await expect(p.getByTestId('prep-question').nth(1)).toHaveText(/What might be going on that you haven’t asked about yet\?/);
  await expect(p.getByTestId('prep-question').nth(2)).toContainText('HR business partner');
  await expectCleanManagerUi(page);
});

test('pillar counts add up to what is underneath', async ({ page }) => {
  const p = panel(page);
  await p.getByRole('button', { name: 'Your pillars' }).click();
  for (const row of await p.getByTestId('pillar-row').all()) {
    const total = Number((await row.getByTestId('pillar-count').innerText()).match(/\d+/)[0]);
    await row.getByText('What’s underneath').click();
    const parts = (await row.getByTestId('system-count').allInnerTexts()).map((t) => Number(t.match(/\d+/)[0]));
    expect(parts).toHaveLength(2);
    expect(parts[0] + parts[1]).toBe(total);
  }
  await expect(p.getByTestId('pillar-row').filter({ hasText: 'Hold the Standard' }).getByTestId('pillar-count')).not.toHaveText(/^0/);
  await expectCleanManagerUi(page);
});

test('no pillar ever shows "0 this week"; an empty pillar shows what is next today', async ({ page }) => {
  const p = panel(page);
  await p.getByRole('button', { name: 'Your pillars' }).click();
  for (const t of await p.getByTestId('pillar-row').allInnerTexts()) expect(t).not.toMatch(/\b0 this week/);
  await expect(p.getByTestId('pillar-row').filter({ hasText: 'Sustain & Grow' })).toContainText('Next: Career chat at 14:30');
});

test('sparklines bridge a missing week with a dashed segment, never a dangling line', async ({ page }) => {
  const p = panel(page);
  await p.getByRole('button', { name: 'Your pillars' }).click();
  const sg = p.getByTestId('pillar-row').filter({ hasText: 'Sustain & Grow' });
  await expect(sg.locator('svg.spark line.gap')).toHaveCount(1);
});

test('pillar card at 390px: name, count line and sparkline do not overlap', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  const p = panel(page);
  await p.getByRole('button', { name: 'Your pillars' }).click();
  const overlap = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
  for (const row of await p.getByTestId('pillar-row').all()) {
    const name = await row.locator('.pname').boundingBox();
    const line = await row.getByTestId('pillar-line').boundingBox();
    const spark = await row.locator('svg.spark').boundingBox();
    expect(overlap(name, line)).toBe(false);
    expect(overlap(name, spark)).toBe(false);
    if (line.width > 0) expect(overlap(line, spark)).toBe(false);
    expect(spark.x + spark.width).toBeLessThanOrEqual(390);
  }
});

test('HR view: manager-said pillar trend, team-saw placeholder, nothing individual', async ({ page }) => {
  await page.getByRole('button', { name: 'HR dashboard' }).click();
  const hr = page.getByRole('main', { name: 'HR dashboard' });
  const said = hr.getByRole('region', { name: 'How managers rate themselves' });
  await expect(said).toContainText('Manager-said');
  await expect(said.getByTestId('cohort-line')).toHaveCount(5);
  await expect(said).toContainText(/fewer than 5 managers/);
  const saw = hr.getByRole('region', { name: 'Team-saw' });
  await expect(saw).toContainText('Team-saw: coming next. Short pulse from each manager’s team, compared pillar by pillar.');
  expect(await saw.innerText()).not.toMatch(/\d/);
  await expect(hr.getByRole('region', { name: 'What this view never shows' })).toContainText('Any individual manager’s self-ratings');
});
