import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:3210',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command:
      'rm -rf data/e2e.db data/e2e.db-wal data/e2e.db-shm && npm run build && node dist/server.js',
    url: 'http://localhost:3210/api/health',
    reuseExistingServer: false,
    timeout: 180000,
    env: {
      PORT: '3210',
      ADMIN_TOKEN: 'e2e-token',
      DATABASE_PATH: './data/e2e.db',
      STATUS_SLUG: 'status',
    },
  },
});
