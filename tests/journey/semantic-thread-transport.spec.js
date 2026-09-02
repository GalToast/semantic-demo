import { test, expect } from '@playwright/test'

const BASE_URL = (process.env.TEST_BASE_URL || 'http://127.0.0.1:8796').replace(/\/$/, '')
const APP_PATH = process.env.TEST_APP_PATH || '/dist/svelte/index.html'
const POINT_COUNT = 8406

function isSemanticTransportUrl(url) {
    return /\/data\/semantic_(threads(?:_ui)?\.dat\.bin|space_layout_manifest\.json)(?:\?|$)/.test(url)
}

async function pollFor(page, predicate, timeoutMs = 60_000, intervalMs = 100) {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
        if (await page.evaluate(predicate)) return true
        await page.waitForTimeout(intervalMs)
    }
    return false
}

test('browser loads the UI semantic-thread binary and validates its manifest', async ({ page }) => {
    test.setTimeout(90_000)

    const requests = []
    const responses = new Map()
    const recordRequest = (request) => {
        if (isSemanticTransportUrl(request.url())) {
            requests.push({ url: request.url(), resourceType: request.resourceType() })
        }
    }
    const recordResponse = (response) => {
        if (isSemanticTransportUrl(response.url())) {
            responses.set(response.url(), {
                status: response.status(),
                headers: response.headers()
            })
        }
    }

    // BrowserContext events include fetches issued by the module worker; the
    // page listener is retained for Playwright versions that surface them
    // directly on the owning page.
    page.context().on('request', recordRequest)
    page.context().on('response', recordResponse)
    page.on('request', recordRequest)
    page.on('response', recordResponse)

    await page.addInitScript(() => {
        window.__PLAYWRIGHT__ = true
        try {
            sessionStorage.removeItem('semantic-explorer.engineReady')
        } catch {
            // Storage may be unavailable in a restricted browser context.
        }
    })
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto(`${BASE_URL}${APP_PATH}?anchor=0&nodemo=1`, { waitUntil: 'domcontentloaded' })

    const settled = await pollFor(page, () => {
        const state = window.__LEGACY_APP_STATE__ ?? window.__APP_STATE__ ?? {}
        return (
            state.semanticThreadsStatus === 'ready' &&
            state.semanticSpaceLayoutStatus === 'ready' &&
            state.semanticThreadArtifactName === 'semantic_threads_ui.dat.bin' &&
            state.semanticNeighborMapByLeadId?.size === 8406
        )
    })

    expect(settled, 'browser transport must settle the compact UI graph').toBe(true)

    const evidence = await page.evaluate(() => {
        const state = window.__LEGACY_APP_STATE__ ?? window.__APP_STATE__ ?? {}
        return {
            status: state.semanticThreadsStatus,
            layoutStatus: state.semanticSpaceLayoutStatus,
            artifactName: state.semanticThreadArtifactName,
            neighborCount: state.semanticNeighborMapByLeadId?.size ?? 0
        }
    })
    expect(evidence).toEqual({
        status: 'ready',
        layoutStatus: 'ready',
        artifactName: 'semantic_threads_ui.dat.bin',
        neighborCount: POINT_COUNT
    })

    const firstBinaryRequest = requests.find(({ url }) => /semantic_threads(?:_ui)?\.dat\.bin(?:\?|$)/.test(url))
    expect(firstBinaryRequest?.url, 'the browser must try the UI binary before fallback artifacts').toMatch(
        /\/data\/semantic_threads_ui\.dat\.bin(?:\?|$)/
    )

    const uiResponse = [...responses.entries()].find(([url]) => /semantic_threads_ui\.dat\.bin(?:\?|$)/.test(url))?.[1]
    expect(uiResponse?.status, 'the UI binary request must return HTTP 200').toBe(200)
    expect(uiResponse?.headers['content-type'], 'the UI binary must be served as an opaque binary').toContain(
        'application/octet-stream'
    )

    const manifestResponse = [...responses.entries()].find(([url]) => /semantic_space_layout_manifest\.json(?:\?|$)/.test(url))?.[1]
    expect(manifestResponse?.status, 'the manifest request must return HTTP 200').toBe(200)
    expect(manifestResponse?.headers['content-type']).toContain('application/json')
})
