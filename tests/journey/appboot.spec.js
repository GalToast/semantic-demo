import { test, expect } from '@playwright/test'
import { BASE_URL } from '../helpers/3d-interaction-helpers.js'

// AppBoot.svelte is boot chrome: it owns the #app mount target and the
// contract surface (parity attrs, window actions, gesture monitor). The
// only user-visible consequence of the main.ts -> main-explorer.ts split
// is that the explorer still boots — this smoke pins that.
test.afterEach(async ({ page }) => {
    await page.close().catch(() => {})
    await page.context().close().catch(() => {})
})

test('APPBOOT-1. Explorer boots to the #app mount target', async ({ page }) => {
    await page.goto(`${BASE_URL}/dist/svelte/index.html?nodemo=1&record=519`, {
        waitUntil: 'domcontentloaded',
    })
    await page.waitForSelector('#app, #app-root', { timeout: 30000 })
    // The mount target exists and is non-empty once the app has hydrated.
    await page.waitForFunction(() => {
        const t = document.querySelector('#app') || document.querySelector('#app-root')
        return !!t && t.children.length > 0
    }, { timeout: 30000 })
})