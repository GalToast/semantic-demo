import { test, expect } from '@playwright/test'
import { BASE_URL } from './helpers/3d-interaction-helpers.js'

const PORTRAIT = { width: 390, height: 844 }
const LANDSCAPE = { width: 844, height: 390 }

async function dismissHelpDialog(page) {
    const helpDialog = page.locator('dialog.help-dialog[open]')
    if ((await helpDialog.count()) > 0) {
        await page.keyboard.press('Escape')
        await helpDialog.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {})
    }
}

async function enterSearch(page, query) {
    await page.setViewportSize(PORTRAIT)
    await page.goto(`${BASE_URL}/dist/svelte/index.html?nodemo=1`, { waitUntil: 'domcontentloaded' })
    await dismissHelpDialog(page)
    await page.locator('.mode-chip[data-mode="search"]').waitFor({ state: 'visible', timeout: 15000 })
    await page.locator('.mode-chip[data-mode="search"]').click()

    const input = page.locator('#search-input')
    await input.waitFor({ state: 'visible', timeout: 15000 })
    await input.fill(query)
    await page.waitForSelector('#search-results-count', { state: 'visible', timeout: 30000 })
    await page.waitForFunction(
        () =>
            document.body.dataset.mobileSearchSheet === 'peek' &&
            document.body.dataset.panelSurfaceDetail === 'peek' &&
            document.body.dataset.searchStatus === 'results',
        undefined,
        { timeout: 15000 }
    )
}

async function readSheetState(page) {
    return page.evaluate(() => ({
        sheet: document.body.dataset.mobileSearchSheet ?? null,
        detail: document.body.dataset.panelSurfaceDetail ?? null,
        panelSurface: document.body.dataset.panelSurface ?? null,
        ariaExpanded: document.querySelector('.search-label')?.getAttribute('aria-expanded') ?? null,
        resultItems: document.querySelectorAll('#search-result-list [data-order]').length,
        emptyState: Boolean(document.querySelector('.search-empty-state, .search-error-state')),
        bodyScrollHeight: document.body.scrollHeight,
        viewportHeight: window.innerHeight
    }))
}

async function reopenSearchInput(page) {
    await page.locator('.search-label').click()
    await page.locator('#search-input').waitFor({ state: 'visible', timeout: 10000 })
    return page.locator('#search-input')
}

test.describe('Mobile search sheet adversarial journeys', () => {
    test('expands and collapses in place without a viewport/store change', async ({ page }) => {
        await enterSearch(page, 'coffee')
        const label = page.locator('.search-label')

        await label.click()
        await page.waitForFunction(
            () => document.body.dataset.mobileSearchSheet === 'expanded' && document.body.dataset.panelSurfaceDetail === 'expanded',
            undefined,
            { timeout: 10000 }
        )
        expect(await label.getAttribute('aria-expanded')).toBe('true')

        await label.click()
        await page.waitForFunction(
            () => document.body.dataset.mobileSearchSheet === 'peek' && document.body.dataset.panelSurfaceDetail === 'peek',
            undefined,
            { timeout: 10000 }
        )
        expect(await label.getAttribute('aria-expanded')).toBe('false')
    })

    test('resets expanded intent through landscape and restores a clean portrait peek', async ({ page }) => {
        await enterSearch(page, 'coffee')
        await page.locator('.search-label').click()
        await page.waitForFunction(() => document.body.dataset.panelSurfaceDetail === 'expanded', undefined, {
            timeout: 10000
        })

        await page.setViewportSize(LANDSCAPE)
        await page.waitForFunction(
            () => !document.body.dataset.mobileSearchSheet && document.body.dataset.panelSurfaceDetail === 'none',
            undefined,
            { timeout: 10000 }
        )
        const landscape = await readSheetState(page)
        expect(landscape.ariaExpanded).toBeNull()
        expect(landscape.bodyScrollHeight).toBeLessThanOrEqual(landscape.viewportHeight + 1)

        await page.setViewportSize(PORTRAIT)
        await page.waitForFunction(
            () => document.body.dataset.mobileSearchSheet === 'peek' && document.body.dataset.panelSurfaceDetail === 'peek',
            undefined,
            { timeout: 10000 }
        )
        const portrait = await readSheetState(page)
        expect(portrait.ariaExpanded).toBe('false')
        expect(portrait.bodyScrollHeight).toBeLessThanOrEqual(portrait.viewportHeight + 1)
    })

    test('repeated valid and no-result searches do not leave an expanded or blank sheet', async ({ page }) => {
        await enterSearch(page, 'coffee')
        let input = await reopenSearchInput(page)

        // Keep this repeat-search leg multi-result so the assertion stays
        // about sheet continuity rather than auto-focus UX.
        await input.fill('coffee shops')
        await page.waitForFunction(
            () =>
                document.body.dataset.panelSurface === 'search' &&
                document.body.dataset.searchStatus === 'results',
            undefined,
            {
                timeout: 15000
            }
        )
        const repeated = await readSheetState(page)
        expect(['peek', 'expanded']).toContain(repeated.sheet)
        expect(repeated.detail).toBe(repeated.sheet)
        expect(repeated.resultItems).toBeGreaterThan(0)

        input = await reopenSearchInput(page)
        await input.fill('zzzzzzzzzzzzzzzzzzzz')
        await page.waitForFunction(
            () => document.body.dataset.searchStatus !== 'searching' && document.body.dataset.panelSurface === 'search',
            undefined,
            { timeout: 15000 }
        )
        const empty = await readSheetState(page)
        expect(empty.panelSurface).toBe('search')
        expect(['peek', 'expanded']).toContain(empty.sheet)
        expect(empty.detail).toBe(empty.sheet)
        expect(empty.bodyScrollHeight).toBeLessThanOrEqual(empty.viewportHeight + 1)
        expect(empty.resultItems > 0 || empty.emptyState).toBe(true)
    })

    test('Escape and back controls clear the sheet without leaving stale geometry', async ({ page }) => {
        await enterSearch(page, 'coffee')
        await page.locator('.search-label').click()
        await page.waitForFunction(() => document.body.dataset.mobileSearchSheet === 'expanded', undefined, {
            timeout: 10000
        })

        await page.keyboard.press('Escape')
        await page.waitForFunction(
            () =>
                !document.body.dataset.mobileSearchSheet &&
                document.body.dataset.panelSurfaceDetail === 'none' &&
                (document.body.dataset.panelSurface === 'idle' || document.body.dataset.panelSurface === 'search'),
            undefined,
            { timeout: 10000 }
        )
        const afterEscape = await readSheetState(page)
        expect(afterEscape.ariaExpanded).toBeNull()
        expect(afterEscape.bodyScrollHeight).toBeLessThanOrEqual(afterEscape.viewportHeight + 1)

        await enterSearch(page, 'coffee')
        await page.locator('.search-back-btn').click()
        await page.waitForFunction(
            () => !document.body.dataset.mobileSearchSheet && document.body.dataset.panelSurfaceDetail === 'none',
            undefined,
            { timeout: 10000 }
        )
        const afterBack = await readSheetState(page)
        expect(afterBack.panelSurface).toBe('idle')
        expect(afterBack.ariaExpanded).toBeNull()
        expect(afterBack.bodyScrollHeight).toBeLessThanOrEqual(afterBack.viewportHeight + 1)
    })
})
