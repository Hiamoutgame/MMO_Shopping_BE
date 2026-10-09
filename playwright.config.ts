import { defineConfig } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';

// Load .env.test for playwright
dotenv.config({ path: path.resolve(__dirname, '.env.test'), quiet: true });

// Trailing slash is required: relative request paths ("v1/...") resolve
// against it, otherwise the "/api" segment is dropped by URL resolution.
export const BASE_URL = 'http://127.0.0.1:4000/api/';

export default defineConfig({
  testDir: './tests',
  // Shared Neon database: never run test files in parallel.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: BASE_URL,
    trace: 'off',
    extraHTTPHeaders: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
  },
  projects: [
    {
      name: 'api',
    },
  ],
  webServer: {
    command: 'npm run start',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      NODE_ENV: 'test',
      PORT: '4000',
    },
  },
});
