import { defineConfig } from '@playwright/test';

const baseURL = process.env.TEST_BASE_URL || 'http://127.0.0.1:8795';
const webServer = process.env.TEST_BASE_URL
  ? undefined
  : {
      command: 'python -m http.server 8795 --bind 127.0.0.1',
      port: 8795,
      reuseExistingServer: true,
      timeout: 120_000,
    };

export default defineConfig({
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL,
  },
  webServer,
});
