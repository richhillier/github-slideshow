// The Node web app (server.js) with the seeded demo manager. Characterisation tests for existing pages.
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const BASE = 'http://localhost:4311';

test.beforeEach(async ({ page }) => {
  await page.goto(`${BASE}/welcome`);
  await page.getByRole('button', { name: 'Open demo' }).click();
  await expect(page).toHaveURL(/\/today$/);
});

test('every page renders without errors', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  for (const [path, heading] of [['/today', /Today/], ['/lookback', /Week of/], ['/pillars', /operating stack/], ['/hr', /Manager pilot/]]) {
    const res = await page.goto(BASE + path);
    expect(res.status(), path).toBe(200);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(heading);
  }
  expect(errors).toEqual([]);
});

test('prep cards load and two-tap capture saves', async ({ page }) => {
  const prep = page.locator('[data-prep]').first();
  await expect(prep.locator('ol li')).toHaveCount(3);
  const cap = page.locator('[data-capture]').first();
  await cap.getByRole('button', { name: 'Mixed' }).click();
  await cap.getByRole('button', { name: 'Revisit' }).click();
  await expect(cap.locator('.saved')).toHaveText('Captured');
  await page.reload();
  await expect(page.locator('[data-capture]').first().getByRole('button', { name: 'Revisit' })).toHaveClass(/on/);
});

test('look-back saves self-ratings', async ({ page }) => {
  await page.goto(`${BASE}/lookback`);
  for (const name of ['lead-yourself', 'set-standard', 'develop-people', 'hold-standard', 'grow-sustain']) {
    await page.locator(`input[name="score_${name}"][value="3"]`).check({ force: true });
  }
  await page.getByRole('button', { name: /look-back/ }).click();
  await expect(page.getByText('Look-back saved.')).toBeVisible();
});

test('systems page shows the stack with unlock weeks', async ({ page }) => {
  await page.goto(`${BASE}/pillars`);
  await expect(page.locator('.tier')).toHaveCount(5);
  await expect(page.locator('.systems li', { hasText: 'Performance System' })).toContainText('Week 6');
});

test('no horizontal scrolling and no serious accessibility violations on Today', async ({ page }) => {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  const r = await new AxeBuilder({ page }).analyze();
  expect(r.violations.filter((v) => ['serious', 'critical'].includes(v.impact)).map((v) => `${v.id}: ${v.nodes[0]?.target}`)).toEqual([]);
});
