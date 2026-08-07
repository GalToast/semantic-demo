import { test, expect } from '@playwright/test'
import { refreshCompositionState, setSemanticDiveMode } from '@lib/orchestration/lifecycle'
import { search } from '@lib/search/state'

const BASE_URL = (process.env.TEST_BASE_URL || 'http://127.0.0.1:8795').replace(/\/$/, '')

const SEMANTIC_HEALTH_STUB = {
    ok: true,
    state: 'healthy',
    provenance: { label: 'Search ready', detail: 'Semantic search is ready.' }
}

const SEARCH_STUB = {
    ok: true,
    count: 3,
    results: [
        { lead_id: 1, score: 0.99, semantic_score: 0.99, public_note: 'Coffee shop on Main St.' },
        { lead_id: 2, score: 0.91, semantic_score: 0.91, public_note: 'Cafe near the park.' },
        { lead_id: 20, score: 0.86, semantic_score: 0.86, public_note: 'Espresso bar downtown.' }
    ]
}

async function setupMockSearch(page) {
    await page.route('**/api.php?action=semantic_lane_health**', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(SEMANTIC_HEALTH_STUB)
        })
    })
    await page.route('**/api.php?action=semantic_search**', async (route) => {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SEARCH_STUB) })
    })
}

async function openApp(page) {
    await setupMockSearch(page)
    await page.goto(`${BASE_URL}/index.html?view=galaxy`)
    await page.waitForFunction(
        () =>
            typeof setSemanticDiveMode === 'function' &&
            typeof refreshCompositionState === 'function' &&
            typeof search === 'function' &&
            Array.isArray(window.__TEST_STATE__?.points) &&
            window.__TEST_STATE__.points.length > 0 &&
            document.body.dataset.graphicsMode === 'webgl',
        { timeout: 20000 }
    )
    await page
        .waitForFunction(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true)))), {
            timeout: 8000
        })
        .catch(() => {})
}

async function searchAndFocusFirstResult(page, query = 'coffee') {
    const input = page.locator('#search-input')
    await input.focus()
    await input.fill(query)
    await page.evaluate((q) => {
        const el = document.getElementById('search-input')
        if (!el) return
        el.value = q
        el.dispatchEvent(new Event('input', { bubbles: true }))
    }, query)
    try {
        await page.waitForSelector('.search-result-item', { state: 'visible', timeout: 8000 })
    } catch {
        await page.evaluate((q) => {
            if (typeof search === 'function') {
                return search(q)
            }
            return null
        }, query)
        await page.waitForSelector('.search-result-item', { state: 'visible', timeout: 15000 })
    }
    await page.locator('.search-result-item').first().click({ force: true })
    await page.waitForFunction(() => Number.isFinite(window.__TEST_STATE__?.focusedNode), { timeout: 15000 })
    await page
        .waitForFunction(() => new Promise((r) => requestAnimationFrame(() => r(true))), { timeout: 5000 })
        .catch(() => {})
}

async function clickStepInside(page) {
    const stepInsideOptions = page.locator('#btn-focus-dive, #btn-journey-primary[data-journey-action="enter-inside"]')
    expect(await stepInsideOptions.count(), 'Step Inside button must exist in the DOM').toBeGreaterThan(0)
    const stepInside = stepInsideOptions.first()
    await expect(stepInside).toBeVisible({ timeout: 10000 })
    await stepInside.click({ force: true })
    await page.waitForFunction(
        () =>
            window.__TEST_STATE__?.trailDepth === 2 &&
            (window.__APP_STATE__ ?? window.__TEST_STATE__)?.semanticDiveMode === true,
        { timeout: 15000 }
    )
}

async function stateProbe(page) {
    return page.evaluate(() => ({
        url: location.href,
        body: {
            activeView: document.body.dataset.activeView || '',
            graphContext: document.body.dataset.graphContext || '',
            panelSurface: document.body.dataset.panelSurface || '',
            semanticDive: document.body.dataset.semanticDive || '',
            trailDepth: document.body.dataset.trailDepth || ''
        },
        state: {
            currentView: window.__TEST_STATE__?.currentView || '',
            focusedNode: window.__TEST_STATE__?.focusedNode ?? null,
            trailDepth: window.__TEST_STATE__?.trailDepth ?? null,
            semanticDiveMode: window.__TEST_STATE__?.semanticDiveMode ?? null,
            navMode: window.__TEST_STATE__?.navState?.mode || ''
        }
    }))
}

test.describe('Live Step Inside state sync', () => {
    test('desktop click path syncs URL, body dataset, and JS state', async ({ page }) => {
        test.setTimeout(60000)
        await page.setViewportSize({ width: 1440, height: 1000 })
        await openApp(page)
        await searchAndFocusFirstResult(page)
        await clickStepInside(page)

        const probe = await stateProbe(page)
        expect(new URL(probe.url).searchParams.get('depth')).toBe('2')
        expect(probe.state.trailDepth).toBe(2)
        expect(probe.state.semanticDiveMode).toBe(true)
        expect(probe.body.trailDepth).toBe('2')
        expect(probe.body.semanticDive).toBe('active')
        expect(probe.body.panelSurface).toBe('semantic-dive')
        expect(probe.body.graphContext).toBe('focus')
    })

    test('mobile click path exposes a visible tappable Map route after Step Inside', async ({ page }) => {
        test.setTimeout(60000)
        await page.setViewportSize({ width: 390, height: 844 })
        await openApp(page)
        await searchAndFocusFirstResult(page)
        await clickStepInside(page)

        const mapRoute = page.locator('.journey-compass-step[data-journey-step="map"]')
        await expect(mapRoute, 'Map journey route must exist in the DOM').toHaveCount(1, { timeout: 10000 })
        await expect(mapRoute).toBeVisible({ timeout: 10000 })
        // Poll for the settled ≥44×44 tap target instead of one-shot boundingBox.
        const boxSettled = await page.waitForFunction(
            () => {
                const el = document.querySelector('.journey-compass-step[data-journey-step="map"]')
                if (!el) return false
                const r = el.getBoundingClientRect()
                return Math.min(r.width, r.height) >= 44
            },
            null,
            { timeout: 15000, polling: 50 }
        )
        expect(boxSettled, 'map route must settle to >=44px min dimension').toBeTruthy()
        const box = await mapRoute.boundingBox()
        expect(box?.width || 0).toBeGreaterThanOrEqual(44)
        expect(box?.height || 0).toBeGreaterThanOrEqual(44)

        await mapRoute.click()
        await page.waitForFunction(() => document.body.dataset.activeView === 'map', { timeout: 15000 })
        await expect(page.locator('#map-container, .leaflet-container').first()).toBeVisible()
    })

    test('tablet clear-search button is physically clickable, not just dispatchable', async ({ page }) => {
        test.setTimeout(60000)
        await page.setViewportSize({ width: 768, height: 1024 })
        await openApp(page)

        const input = page.locator('#search-input')
        await input.focus()
        await input.fill('coffee')
        await page.evaluate(() => {
            const el = document.getElementById('search-input')
            if (!el) return
            el.value = 'coffee'
            el.dispatchEvent(new Event('input', { bubbles: true }))
        })
        try {
            await page.waitForSelector('.search-result-item', { state: 'visible', timeout: 8000 })
        } catch {
            await page.evaluate(() => {
                if (typeof search === 'function') search('coffee')
            })
            await page.waitForSelector('.search-result-item', { state: 'visible', timeout: 15000 })
        }

        const clearButton = page.locator('#search-clear-btn')
        await expect(clearButton, 'Search clear button must exist in the DOM').toHaveCount(1)
        await expect(clearButton).toBeVisible({ timeout: 10000 })
        await clearButton.click()

        await expect(page.locator('#search-input')).toHaveValue('')
        await expect(page.locator('.search-result-item')).toHaveCount(0)
    })
})
