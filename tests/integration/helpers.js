/**
 * Shared helpers for integration tests.
 *
 * Exports mock fetch stubs, console error capture, and navigation
 * utilities used by both w15-body-attr-live-probe.spec.js and
 * visual-state-snapshots.spec.js.
 */

// ── Config ──────────────────────────────────────────────────────────────────

export const BASE_URL = (process.env.TEST_BASE_URL || 'http://127.0.0.1:5175').replace(/\/$/, '')
export const APP_PATH = '/index.html'
export const VIEWPORT = { width: 1440, height: 900 }
export const STEP_TIMEOUT = parseInt(process.env.INTEGRATION_TIMEOUT || '30000', 10)
export const SETTLE_MS = 2000
export const SNAPSHOT_SETTLE_MS = 3000

// ── Mock fetch stubs ────────────────────────────────────────────────────────

export const SEMANTIC_HEALTH_STUB = {
    ok: true,
    state: 'healthy',
    provenance: { label: 'Search ready', detail: 'Semantic search is ready.' }
}

export const SEARCH_STUB = {
    ok: true,
    count: 5,
    results: [
        { lead_id: 522, score: 0.99, semantic_score: 0.99, public_note: 'Angel Reach CAFE' },
        { lead_id: 100, score: 0.95, semantic_score: 0.95, public_note: 'Coffee shop on Main St.' },
        { lead_id: 200, score: 0.91, semantic_score: 0.91, public_note: 'Cafe near the park.' },
        { lead_id: 300, score: 0.88, semantic_score: 0.88, public_note: 'Espresso bar downtown.' },
        { lead_id: 400, score: 0.85, semantic_score: 0.85, public_note: 'Roastery in Conroe.' }
    ]
}

/**
 * Install mock fetch routes on a page.
 */
export async function installMockFetch(page) {
    await page.route('**/api/semantic/health', async (route) => {
        await route.fulfill({ json: SEMANTIC_HEALTH_STUB })
    })
    await page.route('**/api/search*', async (route) => {
        await route.fulfill({ json: SEARCH_STUB })
    })
}

// ── Console error capture ───────────────────────────────────────────────────

/**
 * Attach a console-error listener; returns a getter for collected errors.
 */
export function captureConsoleErrors(page) {
    const errors = []
    page.on('console', (msg) => {
        if (msg.type() === 'error') {
            errors.push(msg.text())
        }
    })
    page.on('pageerror', (err) => {
        errors.push(`pageerror: ${err.message}`)
    })
    return {
        get errors() { return errors },
        summary() {
            return errors.length === 0
                ? 'No console errors captured.'
                : `${errors.length} console error(s):\n  - ${errors.join('\n  - ')}`
        }
    }
}

// ── Retry helper ────────────────────────────────────────────────────────────

/**
 * Retry an async function up to `maxAttempts` times with a delay.
 */
export async function withRetry(fn, { maxAttempts = 3, backoffMs = 1000, label = 'flow' } = {}) {
    let lastError
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await fn(attempt)
        } catch (err) {
            lastError = err
            if (attempt < maxAttempts) {
                console.log(`  [retry] ${label}: attempt ${attempt} failed, retrying in ${backoffMs}ms...`)
                await new Promise((r) => setTimeout(r, backoffMs))
            }
        }
    }
    throw lastError
}

// ── Body attr reader ────────────────────────────────────────────────────────

/**
 * Read all relevant body data-attrs after settling.
 */
export async function readBodyAttrs(page) {
    return page.evaluate(() => {
        const d = document.body.dataset
        return {
            mode: d.mode ?? null,
            navSurface: d.navSurface ?? null,
            panelSurface: d.panelSurface ?? null,
            panelSurfaceMode: d.panelSurfaceMode ?? null,
            panelSurfaceDetail: d.panelSurfaceDetail ?? null,
            journeyPhase: d.journeyPhase ?? null,
            graphContext: d.graphContext ?? null,
            searchStatus: d.searchStatus ?? null,
            trailDepth: d.trailDepth ?? null,
            trailState: d.trailState ?? null,
            semanticDive: d.semanticDive ?? null,
            focusedNode: d.focusedNode ?? null,
            focusOrigin: d.focusOrigin ?? null,
            focusSearchForced: d.focusSearchForced ?? null,
            searchGlow: d.searchGlow ?? null,
            loadingOverlay: d.loadingOverlay ?? null,
            sceneReady: d.sceneReady ?? null,
        }
    })
}

/**
 * Pretty-print body attrs for debugging.
 */
export function logBodyAttrs(attrs, label = '') {
    const prefix = label ? `[${label}] ` : ''
    console.log(`${prefix}Body data-attrs:`)
    for (const [k, v] of Object.entries(attrs)) {
        console.log(`  data-${k.replace(/([A-Z])/g, '-$1').toLowerCase()} = ${v}`)
    }
}

// ── Navigation helpers ──────────────────────────────────────────────────────

/**
 * Navigate to the app, wait for scene readiness, and install mocks.
 */
export async function navigateToApp(page) {
    await page.setViewportSize(VIEWPORT)
    await installMockFetch(page)
    await page.goto(`${BASE_URL}${APP_PATH}?nodemo=1&view=galaxy`, {
        waitUntil: 'domcontentloaded',
        timeout: STEP_TIMEOUT,
    })

    await page
        .waitForFunction(
            () => document.body.dataset.testReady === 'true' || document.body.dataset.sceneReady === 'true',
            { timeout: STEP_TIMEOUT }
        )
        .catch(() => { /* proceed anyway */ })
}

/**
 * Click the Search mode radio and wait for the search panel to appear.
 */
export async function enterSearchMode(page) {
    const searchRadio = page.locator('input[type="radio"][value="search"], [role="radio"]').filter({ hasText: /search/i }).first()
    await searchRadio.waitFor({ state: 'visible', timeout: STEP_TIMEOUT })
    await searchRadio.click()
    await page.waitForTimeout(500)
}

/**
 * Type a query into the search input and submit.
 */
export async function typeSearchQuery(page, query = 'cafe') {
    const searchInput = page.locator('#search-input, input[name="q"], input[placeholder*="Search"]').first()
    await searchInput.waitFor({ state: 'visible', timeout: STEP_TIMEOUT })
    await searchInput.fill(query)
    await searchInput.press('Enter')
}

/**
 * Wait for the first search result and click it. Returns the clicked index.
 */
export async function clickFirstSearchResult(page) {
    const firstResult = page.locator('.search-result.search-result-item').first()
    await firstResult.waitFor({ state: 'visible', timeout: STEP_TIMEOUT })
    const clickedIndex = await firstResult.getAttribute('data-index')
    await firstResult.click()
    return clickedIndex
}
