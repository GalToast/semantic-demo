import { setupMockSearch } from './mock-semantic-search.js'

// Keep this helper aligned with playwright.config.js: Playwright owns the
// static-plus-PHP-proxy server on 8796, while 8795 is the single-threaded PHP
// backend and is intentionally reserved for API proxying.
export const BASE_URL = (process.env.TEST_BASE_URL || 'http://127.0.0.1:8796').replace(/\/$/, '')
export const APP_PATH = process.env.TEST_APP_PATH || '/dist/svelte/index.html'

function buildAppUrl(baseUrl = BASE_URL, appPath = APP_PATH, { focusRecord = false } = {}) {
    return `${baseUrl}${appPath}?nodemo=1&webgl=1${focusRecord ? '&anchor=518&record=519' : ''}`
}

async function openAppPage(page, viewport, options = {}) {
    const targetViewport = viewport || (await page.viewportSize())
    if (!targetViewport) {
        throw new Error('openShortLandscape requires a viewport or page-level viewportSize.')
    }
    await page.setViewportSize(targetViewport)
    await page.addInitScript(() => {
        window.__PLAYWRIGHT__ = true
        // Isolate the persistent engine-ready flag (same class as 3d helpers):
        // shared-context sessionStorage leaks test 1's signalReady into test 2's
        // boot → flaky splash/init → hover/click races.
        try {
            sessionStorage.removeItem('semantic-explorer.engineReady')
        } catch {
            /* storage may be unavailable */
        }
    })
    const targetUrl = buildAppUrl(BASE_URL, APP_PATH, options)
    let response
    try {
        response = await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 10000 })
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        throw new Error(
            `Semantic Explorer navigation failed: target=${targetUrl} current=${page.url()} error=${message}`,
            { cause: error }
        )
    }
    if (response && response.status() >= 400) {
        throw new Error(
            `Semantic Explorer navigation returned HTTP ${response.status()}: target=${targetUrl} response=${response.url()}`
        )
    }
    const hasAppIdentity = await page
        .waitForFunction(() => document.querySelector('#search-input') && document.querySelector('#info-panel'), null, {
            timeout: 5000
        })
        .then(() => true)
        .catch(() => false)
    if (!hasAppIdentity) {
        const diagnostics = await page.evaluate(() => ({
            title: document.title,
            url: location.href,
            hasSearchInput: Boolean(document.querySelector('#search-input')),
            hasInfoPanel: Boolean(document.querySelector('#info-panel')),
            bodyPreview: document.body?.innerText?.slice(0, 240) ?? ''
        }))
        throw new Error(
            `Semantic Explorer app identity missing after navigation: target=${targetUrl} status=${response?.status() ?? 'no-response'} diagnostics=${JSON.stringify(diagnostics)}`
        )
    }
}

export async function openShortLandscape(page, viewport, { focusRecord = false } = {}) {
    await openAppPage(page, viewport, { focusRecord })
    await page.waitForFunction(
        () =>
            document.querySelector('#search-input') &&
            document.querySelector('#info-panel') &&
            document.querySelector('#focus-stage') &&
            Array.isArray((window.__APP_STATE__ ?? window.__TEST_STATE__)?.points) &&
            (window.__APP_STATE__ ?? window.__TEST_STATE__)?.points?.length > 0,
        null,
        { timeout: 20000 }
    )
    await page.waitForFunction(
        () => {
            const state = window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {}
            const applyingUrlState = state.applyingUrlState ?? state.navState?.applyingUrlState
            return (
                document.body?.dataset?.testReady === 'true' &&
                applyingUrlState === false &&
                state.sceneRevealActive === false &&
                document.body?.dataset?.loadingPhase === 'launch'
            )
        },
        null,
        { timeout: 30000 }
    )
}

/**
 * Establish the focus-search parity state through the app's test bridge.
 * `focusPanelMode` is the only remaining test-only bypass attribute; the
 * navigation surface and view must come from the canonical app state.
 */
export async function setShortLandscapeFocusSearch(page) {
    const result = await page.evaluate(() => {
        const state = window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {}
        const actions = window.__navActions__ ?? window.__APP_ACTIONS__ ?? {}
        const focusedIndex = Number.isFinite(state.navState?.focusedIndex)
            ? state.navState.focusedIndex
            : Number.isFinite(state.focusedNode)
              ? state.focusedNode
              : null
        const targetIndex =
            focusedIndex !== null
                ? focusedIndex
                : Array.isArray(state.points) && state.points.length > 0
                  ? Math.floor(state.points.length / 2)
                  : null
        const canonicalActions = []

        if (typeof actions.setSurface === 'function') {
            actions.setSurface('focus-search')
            canonicalActions.push('setSurface')
        } else if (typeof actions.writeNavStateMirror === 'function') {
            actions.writeNavStateMirror({ currentView: 'galaxy', mode: 'focus', surface: 'focus-search' })
            canonicalActions.push('writeNavStateMirror')
        } else {
            throw new Error(
                'short-landscape parity bridge unavailable: expected writeNavStateMirror or switchView+setSurface'
            )
        }

        if (targetIndex !== null && typeof actions.focusOnNode === 'function') {
            actions.focusOnNode(targetIndex, { fromSearchResult: true, skipUrlSync: true })
            canonicalActions.push('focusOnNode')
        }

        // focusOnNode performs its own composition refresh, but re-assert the
        // requested surface after the focus transition because the URL/focus
        // orchestration may have completed on the generic focus surface.
        if (typeof actions.setSurface === 'function') {
            actions.setSurface('focus-search')
        }
        if (typeof actions.refreshCompositionState === 'function') {
            actions.refreshCompositionState()
            canonicalActions.push('refreshCompositionState')
        }

        // `focusPanelMode` is a documented parity bypass attr with no nav-store
        // setter. Keep this one direct write isolated and observable to the test.
        document.body.dataset.focusPanelMode = 'focus'
        return { canonicalActions, bypassAttribute: 'focusPanelMode' }
    })

    if (!result.canonicalActions.length) {
        throw new Error('short-landscape parity setup did not use a canonical app action')
    }
    await page.waitForFunction(
        () => {
            const state = window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {}
            const navSurface = state.navState?.surface
            if (navSurface === 'focus-search' && document.body?.dataset?.panelSurface !== 'focus-search') {
                window.__navActions__?.refreshCompositionState?.()
            }
            return document.body?.dataset?.panelSurface === 'focus-search'
        },
        null,
        { timeout: 12000 }
    )
    return result
}

export async function openApp(page, viewport) {
    await setupMockSearch(page)
    await openAppPage(page, viewport)
    await page.waitForFunction(
        () => {
            const appState = window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {}
            return (
                Array.isArray(appState.points) &&
                appState.points.length > 0 &&
                appState.renderer?.domElement &&
                appState.camera &&
                appState.pointsMesh
            )
        },
        null,
        { timeout: 20000 }
    )
    await page
        .waitForFunction(
            () => {
                const ps = document.body?.dataset?.panelSurface
                return ps === 'idle' || ps === 'overview'
            },
            null,
            { timeout: 8000 }
        )
        .catch(() => {})
}

/**
 * Establish the canonical map-trail parity state through the app's test
 * bridge. This mirrors the user action path: open map, ensure the journey
 * has trail context, then land on the map-trail surface.
 */
export async function setShortLandscapeMapTrail(page) {
    const result = await page.evaluate(() => {
        const actions = window.__navActions__ ?? window.__APP_ACTIONS__ ?? {}
        const canonicalActions = []

        if (typeof actions.switchView === 'function') {
            actions.switchView('map')
            canonicalActions.push('switchView')
        }

        if (typeof actions.setTrailDepth === 'function') {
            actions.setTrailDepth(1)
            canonicalActions.push('setTrailDepth')
        }

        if (typeof actions.setSurface === 'function') {
            actions.setSurface('map-trail')
            canonicalActions.push('setSurface')
        }

        if (typeof actions.refreshCompositionState === 'function') {
            actions.refreshCompositionState()
            canonicalActions.push('refreshCompositionState')
        }

        return { canonicalActions }
    })

    if (!result.canonicalActions.length) {
        throw new Error('short-landscape map-trail setup did not use a canonical app action')
    }

    await page.waitForFunction(
        () => {
            return (
                document.body?.dataset?.activeView === 'map' &&
                document.body?.dataset?.panelSurface === 'map-trail' &&
                document.body?.dataset?.journeyNavigationOwner === 'map-trail-strip'
            )
        },
        null,
        { timeout: 15000 }
    )
    await page.waitForTimeout(100)
}
