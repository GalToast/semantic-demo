// @ts-nocheck

import { defineConfig } from '@playwright/test'

const baseURL = process.env.TEST_BASE_URL || 'http://127.0.0.1:8796'
const headed =
    process.env.CONTRACT_HEADED === '1' || process.env.PLAYWRIGHT_HEADED === '1' || process.env.PWDEBUG === '1'
const forceSoftwareWebgl = process.env.SEMANTIC_FORCE_WEBGL_SOFTWARE === '1'
const useD3d11 = process.platform === 'win32' && process.env.SEMANTIC_USE_D3D11 === '1'
const chromiumArgs = [
    '--ignore-gpu-blocklist',
    ...(forceSoftwareWebgl
        ? ['--use-gl=angle', '--enable-webgl', '--enable-unsafe-swiftshader', '--enable-webgl-software-rendering']
        : []),
    ...(useD3d11 ? ['--use-angle=d3d11'] : [])
]
const webServer = process.env.TEST_BASE_URL
    ? undefined
    : {
          command: 'node scripts/playwright-web-server.mjs',
          port: 8796,
          reuseExistingServer: process.env.PLAYWRIGHT_REUSE_SERVER === '1',
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
            args: chromiumArgs
        }
    },
    webServer,
    // Opt-in strict-freshness guard (no-op unless PLAYWRIGHT_STRICT_FRESH=1).
    // See scripts/playwright-global-setup.mjs.
    globalSetup: './scripts/playwright-global-setup.mjs'
})
