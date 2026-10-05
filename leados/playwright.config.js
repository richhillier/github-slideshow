// End-to-end tests. `npm run test:e2e` starts both servers itself.
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: { trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: [
    { command: 'node e2e/serve-static.mjs demo 4310', url: 'http://localhost:4310/logic.js', reuseExistingServer: !process.env.CI },
    {
      command: 'node --disable-warning=ExperimentalWarning server.js',
      url: 'http://localhost:4311/welcome',
      env: { PORT: '4311', LEADOS_DB: ':memory:', LEADOS_AI: 'off' },
      reuseExistingServer: !process.env.CI,
    },
  ],
});
