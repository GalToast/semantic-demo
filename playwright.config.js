// @ts-nocheck

import { defineConfig } from '@playwright/test'

const baseURL = process.env.TEST_BASE_URL || 'http://127.0.0.1:8796'
const headed =
    process.env.CONTRACT_HEADED === '1' || process.env.PLAYWRIGHT_HEADED === '1' || process.env.PWDEBUG === '1'
const webServer = process.env.TEST_BASE_URL
    ? undefined
    : {
          command: 'VITE_API_BASE_URL=http://127.0.0.1:8795 npm run build && node scripts/test-server.mjs',
          port: 8796,
          reuseExistingServer: true,
          timeout: 180_000
      }

export default defineConfig({
    fullyParallel: false,
    workers: 1,
    timeout: 120_000,
    expect: {
        timeout: 10_000
    },
    use: {
        baseURL,
        headless: !headed,
        launchOptions: {
            args: ['--ignore-gpu-blocklist']
        }
    },
    webServer,
    // Opt-in strict-freshness guard (no-op unless PLAYWRIGHT_STRICT_FRESH=1).
    // See scripts/playwright-global-setup.mjs.
    globalSetup: './scripts/playwright-global-setup.mjs'
})
