// @ts-nocheck

import { defineConfig } from '@playwright/test'

const testServerPort = Number(process.env.TEST_SERVER_PORT || 8796)
if (!Number.isInteger(testServerPort) || testServerPort < 1024 || testServerPort > 65535) {
    throw new Error(`TEST_SERVER_PORT must be an integer between 1024 and 65535 (received ${testServerPort})`)
}
const baseURL = process.env.TEST_BASE_URL || `http://127.0.0.1:${testServerPort}`
const headed =
    process.env.CONTRACT_HEADED === '1' || process.env.PLAYWRIGHT_HEADED === '1' || process.env.PWDEBUG === '1'
const forceSoftwareWebgl = process.env.SEMANTIC_FORCE_WEBGL_SOFTWARE === '1'
const useD3d11 = process.platform === 'win32' && process.env.SEMANTIC_USE_D3D11 === '1'
// Opt-in for general runs; the headless journey wrapper enables this profile
// by default. It limits browser background work and animation without using
// --disable-gpu, so WebGL assertions remain meaningful.
const lowContention =
    process.env.PLAYWRIGHT_LOW_CONTENTION === '1' ||
    process.env.PLAYWRIGHT_PROFILE?.toLowerCase() === 'low-contention'
const chromiumArgs = [
    '--ignore-gpu-blocklist',
    ...(lowContention
        ? [
              '--disable-background-networking',
              '--disable-component-update',
              '--disable-default-apps',
              '--disable-extensions',
              '--disable-sync',
              '--force-device-scale-factor=1',
              '--metrics-recording-only',
              '--no-first-run'
          ]
        : []),
    ...(forceSoftwareWebgl
        ? ['--use-gl=angle', '--enable-webgl', '--enable-unsafe-swiftshader', '--enable-webgl-software-rendering']
        : []),
    ...(useD3d11 ? ['--use-angle=d3d11'] : [])
]
const webServer = process.env.TEST_BASE_URL
    ? undefined
    : {
          command: 'node scripts/playwright-web-server.mjs',
          port: testServerPort,
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
        screenshot: 'only-on-failure',
        trace: 'off',
        video: 'off',
        launchOptions: {
            args: chromiumArgs
        },
        ...(lowContention
            ? {
                  reducedMotion: 'reduce',
                  // The app does not register a service worker; blocking its
                  // lifecycle avoids unnecessary browser work in this mode.
                  serviceWorkers: 'block'
              }
            : {})
    },
    webServer,
    // Opt-in strict-freshness guard (no-op unless PLAYWRIGHT_STRICT_FRESH=1).
    // See scripts/playwright-global-setup.mjs.
    globalSetup: './scripts/playwright-global-setup.mjs'
})
