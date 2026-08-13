import { test, expect } from '@playwright/test'
import { openApp } from './helpers/3d-interaction-helpers.js'

test.afterEach(async ({ page }) => {
    try {
        await page
            .evaluate(() => {
                const canvas = document.querySelector('canvas')
                const gl = canvas?.getContext('webgl2') || canvas?.getContext('webgl')
                const loseContext = gl?.getExtension('WEBGL_lose_context')
                if (loseContext && !gl.isContextLost()) loseContext.loseContext()
            })
            .catch(() => {})
        await page.waitForTimeout(200)
    } catch {
        // Cleanup is best-effort and must not hide the assertion that failed.
    }
})

async function dismissHelpDialogIfOpen(page) {
    const helpDialog = page.locator('dialog.help-dialog[open]')
    if ((await helpDialog.count()) > 0) {
        await page.keyboard.press('Escape')
        await helpDialog.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {})
    }
}

async function blurActiveField(page) {
    await page.evaluate(() => document.activeElement?.blur?.())
}

async function focusBusiness(page) {
    const focused = await page.evaluate(() => window.__navActions__?.focusOnNode?.(0) ?? false)
    expect(focused, 'the navigation test bridge must expose focusOnNode').toBe(true)
    await page.waitForFunction(
        () => {
            const state = window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {}
            return state.navState?.focusedIndex === 0 && state.navState?.mode === 'focus'
        },
        null,
        { timeout: 20000, polling: 100 }
    )
}

test.describe('Keyboard shortcut journeys', () => {
    test('Ctrl+1 returns from a focused business to overview', async ({ page }) => {
        await openApp(page)
        await dismissHelpDialogIfOpen(page)
        await focusBusiness(page)
        await blurActiveField(page)

        await page.keyboard.press('Control+1')

        await page.waitForFunction(
            () => {
                const state = window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {}
                return (
                    state.navState?.mode === 'overview' &&
                    state.navState?.surface === 'idle' &&
                    state.navState?.focusedIndex == null &&
                    state.navState?.currentView === 'galaxy'
                )
            },
            null,
            { timeout: 20000, polling: 100 }
        )

        const url = new URL(await page.url())
        expect(url.searchParams.get('surface')).toBeNull()
        expect(url.searchParams.get('view')).toBeNull()
    })

    test('Ctrl+3 enters trail from a focused business', async ({ page }) => {
        await openApp(page)
        await dismissHelpDialogIfOpen(page)
        await focusBusiness(page)
        await blurActiveField(page)

        await page.keyboard.press('Control+3')

        await page.waitForFunction(
            () => {
                const state = window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {}
                return state.navState?.mode === 'trail' && state.navState?.surface === 'trail'
            },
            null,
            { timeout: 20000, polling: 100 }
        )

        const url = new URL(await page.url())
        expect(url.searchParams.get('surface')).toBe('trail')
        expect(url.searchParams.get('view')).toBeNull()
    })

    test('Ctrl+3 remains locked without a focused business', async ({ page }) => {
        await openApp(page)
        await dismissHelpDialogIfOpen(page)
        await page.evaluate(() => window.__navActions__?.returnToOverview?.())
        await page.waitForFunction(
            () => {
                const state = window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {}
                return state.navState?.mode === 'overview' && state.navState?.focusedIndex == null
            },
            null,
            { timeout: 20000, polling: 100 }
        )
        await blurActiveField(page)

        await page.keyboard.press('Control+3')

        await page.waitForTimeout(250)
        const state = await page.evaluate(() => {
            const nav = (window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {}).navState
            return { mode: nav?.mode, surface: nav?.surface, focusedIndex: nav?.focusedIndex }
        })
        expect(state.mode, 'trail must remain locked without a selection').toBe('overview')
        expect(state.surface, 'the locked shortcut must not change the surface').toBe('idle')
        expect(state.focusedIndex, 'the locked shortcut must not create a selection').toBeNull()
    })

    test('Ctrl+6 switches to map and serializes the map URL', async ({ page }) => {
        await openApp(page)
        await dismissHelpDialogIfOpen(page)
        await page.evaluate(() => window.__navActions__?.returnToOverview?.())
        await page.waitForFunction(
            () => (window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {}).navState?.mode === 'overview',
            null,
            { timeout: 20000, polling: 100 }
        )
        await blurActiveField(page)

        await page.keyboard.press('Control+6')

        await page.waitForFunction(
            () => {
                const state = window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {}
                return state.navState?.currentView === 'map' && state.navState?.surface === 'map'
            },
            null,
            { timeout: 20000, polling: 100 }
        )

        const url = new URL(await page.url())
        expect(url.searchParams.get('view')).toBe('map')
        expect(url.searchParams.get('surface')).toBe('map')
    })
})
