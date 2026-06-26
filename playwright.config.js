// @ts-nocheck

import { defineConfig } from '@playwright/test'

const baseURL = process.env.TEST_BASE_URL || 'http://127.0.0.1:8797'
const headed =
    process.env.CONTRACT_HEADED === '1' || process.env.PLAYWRIGHT_HEADED === '1' || process.env.PWDEBUG === '1'
const webServer = process.env.TEST_BASE_URL
    ? undefined
    : {
          command: 'python -m http.server 8797 --directory dist/svelte --bind 127.0.0.1',
          port: 8797,
          reuseExistingServer: true,
          timeout: 120_000
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
    webServer
})
