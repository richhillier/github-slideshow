// The LeadOS demo: LeadOS as an add-on inside a Google Calendar-style view.
// Scenario: Jordan Reid, Friday of week 5, the clock fixed at 11:20.
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const URL = 'http://localhost:4310/index.html';

const panel = (page) => page.getByRole('complementary', { name: 'LeadOS' });
const isMobile = (testInfo) => testInfo.project.name === 'mobile';

/** Open an event the way a user would: tap it in the calendar grid. */
async function openEvent(page, title) {
  // Friday is the demo's today; titles like Lunch repeat across the week.
  await page.getByTestId('cal-event').filter({ hasText: title }).last().click();
  await expect(panel(page).getByRole('heading', { name: title })).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.goto(URL);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test('loads cleanly: no script errors or failed local requests', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)/.test(m.text()) && !/ERR_CERT|net::/.test(m.text())) errors.push(m.text()); });
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
  await expect(panel(page).getByRole('heading', { name: 'Today’s moments' })).toBeVisible();
  await expect(panel(page).getByText('title, time and attendee count only')).toBeVisible();
});

test('home card lists today’s five moments with their state', async ({ page }) => {
  const rows = panel(page).getByTestId('moment-row');
  await expect(rows).toHaveCount(5);
  await expect(rows.filter({ hasText: 'CX team stand-up' })).toContainText('Captured');
  await expect(rows.filter({ hasText: '1:1 Jordan / Sam' })).toContainText('Capture now');
  await expect(rows.filter({ hasText: 'Tough feedback: Marcus' })).toContainText('Up next');
  await expect(rows.filter({ hasText: 'Weekly wrap-up' })).toContainText('Prep ready');
  await expect(rows.filter({ hasText: 'Lunch' })).toHaveCount(0);
});

test('capture in two taps after a moment', async ({ page }) => {
  await openEvent(page, '1:1 Jordan / Sam');
  const p = panel(page);
  await expect(p.getByText('Captured', { exact: true })).toHaveCount(0);
  await p.getByRole('button', { name: 'Went well' }).click();
  await expect(p.getByRole('button', { name: 'Went well' })).toHaveAttribute('aria-pressed', 'true');
  await p.getByRole('button', { name: 'Follow up' }).click();
  await expect(p.getByText('Captured', { exact: true })).toBeVisible();

  await p.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(p.getByTestId('moment-row').filter({ hasText: '1:1 Jordan / Sam' })).toContainText('Captured');
});

test('prep before the next moment: three questions and last time’s note, no script', async ({ page }) => {
  await openEvent(page, 'Tough feedback: Marcus (missed SLAs)');
  const p = panel(page);
  await expect(p.getByText('S6 · Feedback System')).toBeVisible();
  await expect(p.getByText('Quiet, low energy. Did not get to SLAs.')).toBeVisible();
  await expect(p.getByTestId('prep-question')).toHaveCount(3);
  for (const q of await p.getByTestId('prep-question').allTextContents()) expect(q.trim()).toMatch(/\?$/);
  // Capture opens only after the moment starts.
  await expect(p.getByRole('button', { name: 'Went well' })).toHaveCount(0);
});

test('Claude button is hidden when Claude is not available to the page', async ({ page }) => {
  await openEvent(page, 'Tough feedback: Marcus (missed SLAs)');
  await expect(panel(page).getByRole('button', { name: /Claude/ })).toHaveCount(0);
});

test('a non-moment event says so and reads nothing else', async ({ page }) => {
  await openEvent(page, 'Lunch');
  await expect(panel(page).getByText('Not a leadership moment')).toBeVisible();
});

test('opening an event shows the calendar’s own event details', async ({ page }) => {
  await page.getByTestId('cal-event').filter({ hasText: 'Tough feedback: Marcus' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Tough feedback: Marcus (missed SLAs)' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('12:00');
  await expect(dialog).toContainText('2 guests');
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(dialog).toHaveCount(0);
});

test('Friday look-back: rate each tier, save, and see it on the systems card', async ({ page }) => {
  const p = panel(page);
  await p.getByRole('button', { name: 'Friday look-back' }).click();
  await expect(p.getByRole('heading', { name: 'Friday look-back' })).toBeVisible();
  await expect(p.getByTestId('reflect-question').first()).toContainText('Attendance concerns: Dan');
  for (const tier of ['Lead Yourself', 'Set the Standard', 'Develop People', 'Hold the Standard', 'Grow & Sustain']) {
    await p.getByRole('radiogroup', { name: tier }).getByRole('radio', { name: '4' }).check({ force: true });
  }
  await p.getByLabel('One win from this week').fill('Had the Dan conversation early.');
  await p.getByRole('button', { name: 'Save look-back' }).click();
  await expect(p.getByText('Look-back saved')).toBeVisible();

  await p.getByRole('button', { name: 'Back', exact: true }).click();
  await p.getByRole('button', { name: 'Your systems' }).click();
  await expect(p.getByTestId('tier').filter({ hasText: 'Hold the Standard' })).toContainText('4/5');
});

test('systems card: the stack, with S7-S9 waiting for their weeks', async ({ page }) => {
  const p = panel(page);
  await p.getByRole('button', { name: 'Your systems' }).click();
  await expect(p.getByTestId('tier')).toHaveCount(5);
  await expect(p.getByTestId('system').filter({ hasText: 'Feedback System' })).toContainText('Active');
  await expect(p.getByTestId('system').filter({ hasText: 'Performance System' })).toContainText('Week 6');
  await expect(p.getByTestId('system').filter({ hasText: 'Growth System' })).toContainText('Week 10');
  await expect(p.getByTestId('system').filter({ hasText: 'Reflection System' })).toContainText('Week 12');
});

test('HR dashboard shows aggregates and never a note or meeting title', async ({ page }) => {
  await openEvent(page, '1:1 Jordan / Sam');
  await panel(page).getByRole('button', { name: 'Hard' }).click();
  await panel(page).getByRole('button', { name: 'Follow up' }).click();
  await page.getByRole('button', { name: 'HR dashboard' }).click();
  const hr = page.getByRole('main', { name: 'HR dashboard' });
  await expect(hr.getByRole('heading', { name: /Manager pilot/ })).toBeVisible();
  await expect(hr).toContainText('managers active this week');
  const text = await hr.innerText();
  for (const s of ['Marcus', 'Sam', 'Dan', 'Quiet, low energy', 'Attendance concerns', 'Jordan / ']) expect(text).not.toContain(s);
});

test('captures survive a reload; Reset demo clears them', async ({ page }) => {
  await openEvent(page, '1:1 Jordan / Sam');
  await panel(page).getByRole('button', { name: 'Mixed' }).click();
  await panel(page).getByRole('button', { name: 'Nothing' }).click();
  await page.reload();
  await expect(panel(page).getByTestId('moment-row').filter({ hasText: '1:1 Jordan / Sam' })).toContainText('Captured');
  await page.getByRole('button', { name: 'Reset demo' }).click();
  await expect(panel(page).getByTestId('moment-row').filter({ hasText: '1:1 Jordan / Sam' })).toContainText('Capture now');
});

test('demo script steps drive the walkthrough', async ({ page }) => {
  await page.getByRole('button', { name: 'Demo script' }).click();
  const script = page.getByRole('dialog', { name: 'Demo script' });
  await expect(script.getByRole('listitem')).toHaveCount(6);
  await script.getByRole('button', { name: /Capture in two taps/ }).click();
  await expect(panel(page).getByRole('heading', { name: '1:1 Jordan / Sam' })).toBeVisible();
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
  await openEvent(page, '1:1 Jordan / Sam');
  expect(await check()).toEqual([]);
  await page.getByRole('button', { name: 'HR dashboard' }).click();
  expect(await check()).toEqual([]);
});
