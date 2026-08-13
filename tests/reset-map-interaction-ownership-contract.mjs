/**
 * Reset/map interaction ownership contract.
 *
 * Proves clear, Escape, and map handoff paths converge through the same
 * surface/state ownership rules instead of leaving duplicate drawers or stale
 * semantic-dive state visible on the wrong surface.
 */

import { chromium } from 'playwright'
import {
    switchView,
    refreshCompositionState,
    setSemanticDiveMode,
    returnToOverview
} from '@lib/orchestration/lifecycle'
import { setTrailDepth } from '@lib/stores/journey.svelte'
import { clearSearch, search } from '@lib/search/state'

const DEFAULT_URL = 'http://127.0.0.1:8795/dist/svelte/index.html?view=galaxy&nodemo=1'
const TARGET_URL = process.env.RESET_MAP_OWNERSHIP_URL || DEFAULT_URL
const QUERY = process.env.RESET_MAP_OWNERSHIP_QUERY || 'coffee'

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERTION FAILED: ${message}`)
}

function pickBodyDataset(dataset = {}) {
    const keys = [
        'activeView',
        'panelSurface',
        'graphContext',
        'mapContext',
        'semanticDive',
        'trailDepth',
        'viewHandoffActive',
        'journeyNavigationOwner',
        'focusPanelMode'
    ]
    return Object.fromEntries(keys.map((key) => [key, dataset[key] || '']))
}

function summarizeBox(box) {
    if (!box) return null
    return {
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
        bottom: box.bottom,
        display: box.display,
        visibility: box.visibility,
        pointerEvents: box.pointerEvents,
        visible: box.visible,
        dataset: box.dataset || {}
    }
}

function summarizeSnapshot(snap) {
    if (!snap) return null
    return {
        viewport: snap.viewport,
        currentView: snap.currentView,
        navMode: snap.navMode,
        navFocusedIndex: snap.navFocusedIndex,
        focusedNode: snap.focusedNode,
        selectedPointName: snap.selectedPointName,
        trailDepth: snap.trailDepth,
        semanticDiveMode: snap.semanticDiveMode,
        searchInputValue: snap.searchInputValue,
        searchResultsHidden: snap.searchResultsHidden,
        bodyDataset: pickBodyDataset(snap.bodyDataset),
        independentDrawers: snap.independentDrawers,
        boxes: {
            focusStage: summarizeBox(snap.boxes?.focusStage),
            searchResults: summarizeBox(snap.boxes?.searchResults),
            infoPanel: summarizeBox(snap.boxes?.infoPanel),
            infoContent: summarizeBox(snap.boxes?.infoContent),
            searchContainer: summarizeBox(snap.boxes?.searchContainer),
            selectedCard: summarizeBox(snap.boxes?.selectedCard),
            selectedMapSummary: summarizeBox(snap.boxes?.selectedMapSummary),
            mapTrailStrip: summarizeBox(snap.boxes?.mapTrailStrip),
            journeyCompass: summarizeBox(snap.boxes?.journeyCompass)
        }
    }
}

function summarizeScenario(result) {
    return Object.fromEntries(Object.entries(result).map(([key, value]) => [key, summarizeSnapshot(value)]))
}

function withCacheBust(url, tag) {
    const parsed = new URL(url)
    parsed.searchParams.set('nodemo', '1')
    parsed.searchParams.set('resetmapowner', `${tag}-${Date.now()}`)
    return parsed.href
}

async function waitReady(page) {
    await page.waitForFunction(
        () => {
            const state = window.__APP_STATE__ || window.__TEST_STATE__ || {}

            return (
                Array.isArray(state.points) &&
                state.points.length > 100 &&
                typeof search === 'function' &&
                typeof clearSearch === 'function' &&
                typeof switchView === 'function' &&
                typeof setSemanticDiveMode === 'function' &&
                typeof setTrailDepth === 'function' &&
                typeof returnToOverview === 'function' &&
                state.applyingUrlState === false &&
                state.sceneRevealActive === false &&
                (document.body.dataset.sceneReveal === 'inactive' || document.body.dataset.sceneReady === 'true')
            )
        },
        null,
        { timeout: 45000 }
    )
}

async function snapshot(page) {
    return page.evaluate(() => {
        const state = window.__APP_STATE__ || window.__TEST_STATE__ || {}
        const box = (selector) => {
            const el = document.querySelector(selector)
            if (!el) return null
            const rect = el.getBoundingClientRect()
            const style = getComputedStyle(el)
            const visible =
                rect.width > 0 &&
                rect.height > 0 &&
                style.display !== 'none' &&
                style.visibility !== 'hidden' &&
                Number(style.opacity || 1) > 0.01
            return {
                selector,
                x: Math.round(rect.x),
                y: Math.round(rect.y),
                width: Math.round(rect.width),
                height: Math.round(rect.height),
                bottom: Math.round(rect.bottom),
                display: style.display,
                visibility: style.visibility,
                pointerEvents: style.pointerEvents,
                visible,
                dataset: { ...el.dataset }
            }
        }
        const focusStage = document.querySelector('#focus-stage')
        const boxes = {
            focusStage: box('#focus-stage'),
            searchResults: box('#search-results'),
            infoPanel: box('#info-panel'),
            infoContent: box('#info-panel .info-content'),
            searchContainer: box('.search-container'),
            selectedCard: box('#selected-card'),
            selectedDetails: box('#selected-details'),
            selectedMapSummary: box('#selected-map-summary'),
            selectedMapSummaryName: box('#selected-map-summary-name'),
            selectedMapSummaryWhat: box('#selected-map-summary-what'),
            selectedMapSummaryMatch: box('#selected-map-summary-match'),
            selectedName: box('#selected-name'),
            selectedSubtitle: box('#selected-what'),
            selectedMeta: box('.selected-meta-strip'),
            selectedMatchPanel: box('#selected-match-panel'),
            selectedActionRow: box('#selected-action-row'),
            selectedTrivia: box('#selected-trivia'),
            selectedGrid: box('.selected-grid'),
            trailControls: box('#trail-controls'),
            trailContext: box('#trail-context'),
            mapTrailStrip: box('#map-trail-strip, .map-trail-strip'),
            journeyCompass: box('#journey-compass'),
            mapContainer: box('#map-container'),
            canvasContainer: box('#canvas-container')
        }
        const independentDrawers = Object.entries({
            focusStage: document.querySelector('#focus-stage'),
            searchResults: document.querySelector('#search-results'),
            infoPanel: document.querySelector('#info-panel')
        })
            .filter(([name, el]) => {
                if (!el) return false
                const item = boxes[name]
                if (!item?.visible || item.height < 140) return false
                return name === 'focusStage' || !focusStage?.contains(el)
            })
            .map(([name]) => ({
                name,
                height: boxes[name].height,
                y: boxes[name].y,
                bottom: boxes[name].bottom
            }))

        const searchInput = document.querySelector('#search-input')
        const searchResults = document.querySelector('#search-results')
        return {
            viewport: {
                width: window.innerWidth,
                height: window.innerHeight
            },
            bodyDataset: { ...document.body.dataset },
            currentView: state.currentView,
            navMode: state.navState?.mode ?? null,
            navFocusedIndex: state.navState?.focusedIndex ?? null,
            focusedNode: state.focusedNode ?? null,
            selectedPointName: state.selectedPoint?.name ?? null,
            trailDepth: state.trailDepth ?? null,
            semanticDiveMode: state.semanticDiveMode === true,
            searchSummary: state.currentSearchSummary
                ? {
                      query: state.currentSearchSummary.query ?? null,
                      resultCount: state.currentSearchSummary.resultIndices?.length ?? 0,
                      anchorIndex: state.currentSearchSummary.anchorIndex ?? null
                  }
                : null,
            searchInputValue: searchInput?.value ?? '',
            searchResultsHidden: searchResults?.hidden ?? null,
            activeElementId: document.activeElement?.id || '',
            boxes,
            independentDrawers
        }
    })
}

function assertOverview(label, snap) {
    assert(snap.currentView === 'galaxy', `${label}: currentView should be galaxy, got ${snap.currentView}`)
    assert(
        snap.bodyDataset.activeView === 'galaxy',
        `${label}: activeView should be galaxy, got ${snap.bodyDataset.activeView}`
    )
    assert(
        snap.bodyDataset.panelSurface === 'idle',
        `${label}: panelSurface should be idle, got ${snap.bodyDataset.panelSurface}`
    )
    assert(
        snap.bodyDataset.graphContext === 'idle',
        `${label}: graphContext should be idle, got ${snap.bodyDataset.graphContext}`
    )
    assert(
        snap.bodyDataset.semanticDive === 'inactive',
        `${label}: semanticDive dataset should be inactive, got ${snap.bodyDataset.semanticDive}`
    )
    assert(
        snap.bodyDataset.viewHandoffActive !== 'true',
        `${label}: view handoff should be released, got ${snap.bodyDataset.viewHandoffActive}`
    )
    assert(
        String(snap.bodyDataset.trailDepth || '0') === '0',
        `${label}: body trailDepth should be 0, got ${snap.bodyDataset.trailDepth}`
    )
    assert(snap.trailDepth === 0, `${label}: state trailDepth should be 0, got ${snap.trailDepth}`)
    assert(snap.semanticDiveMode === false, `${label}: semanticDiveMode should be false`)
    assert(snap.navMode === 'overview', `${label}: navMode should be overview, got ${snap.navMode}`)
    assert(snap.navFocusedIndex === null, `${label}: nav focused index should clear, got ${snap.navFocusedIndex}`)
    assert(snap.focusedNode === null, `${label}: focusedNode should clear, got ${snap.focusedNode}`)
    assert(snap.selectedPointName === null, `${label}: selectedPoint should clear, got ${snap.selectedPointName}`)
    assert(snap.searchInputValue === '', `${label}: search input should clear, got "${snap.searchInputValue}"`)
    assert(
        !['field-node', 'legend-open', 'manual-panel'].includes(snap.bodyDataset.focusPanelMode || ''),
        `${label}: overview reset should not retain an expanded focus/manual submode, got ${snap.bodyDataset.focusPanelMode}`
    )
    const staleDrawers = snap.independentDrawers.filter((drawer) => drawer.name !== 'infoPanel')
    assert(
        staleDrawers.length === 0,
        `${label}: overview should not leave stale focus/search drawers, got ${JSON.stringify(snap.independentDrawers)}`
    )
    const idleInfoPanel = snap.independentDrawers.find((drawer) => drawer.name === 'infoPanel')
    if (idleInfoPanel) {
        assert(
            idleInfoPanel.bottom >= snap.viewport.height - 2,
            `${label}: idle info panel should be bottom-attached, got ${JSON.stringify(idleInfoPanel)} in ${JSON.stringify(snap.viewport)}`
        )
        assert(
            idleInfoPanel.y >= snap.viewport.height * 0.55,
            `${label}: idle info panel should not float mid-screen, got ${JSON.stringify(idleInfoPanel)} in ${JSON.stringify(snap.viewport)}`
        )
    }
}

function overviewLayoutErrors(label, snap) {
    const errors = []
    if (snap.currentView !== 'galaxy') errors.push(`${label}: currentView=${snap.currentView}`)
    if (snap.bodyDataset.activeView !== 'galaxy') errors.push(`${label}: activeView=${snap.bodyDataset.activeView}`)
    if (snap.bodyDataset.panelSurface !== 'idle') errors.push(`${label}: panelSurface=${snap.bodyDataset.panelSurface}`)
    if (snap.bodyDataset.graphContext !== 'idle') errors.push(`${label}: graphContext=${snap.bodyDataset.graphContext}`)
    if (snap.bodyDataset.semanticDive !== 'inactive')
        errors.push(`${label}: semanticDive=${snap.bodyDataset.semanticDive}`)
    if (snap.bodyDataset.viewHandoffActive === 'true')
        errors.push(`${label}: viewHandoffActive=${snap.bodyDataset.viewHandoffActive}`)
    if (String(snap.bodyDataset.trailDepth || '0') !== '0')
        errors.push(`${label}: body trailDepth=${snap.bodyDataset.trailDepth}`)
    if (snap.trailDepth !== 0) errors.push(`${label}: state trailDepth=${snap.trailDepth}`)
    if (snap.semanticDiveMode !== false) errors.push(`${label}: semanticDiveMode=${snap.semanticDiveMode}`)
    if (snap.navMode !== 'overview') errors.push(`${label}: navMode=${snap.navMode}`)
    if (snap.navFocusedIndex !== null) errors.push(`${label}: navFocusedIndex=${snap.navFocusedIndex}`)
    if (snap.focusedNode !== null) errors.push(`${label}: focusedNode=${snap.focusedNode}`)
    if (snap.selectedPointName !== null) errors.push(`${label}: selectedPointName=${snap.selectedPointName}`)
    if (snap.searchInputValue !== '') errors.push(`${label}: searchInputValue="${snap.searchInputValue}"`)
    if (['field-node', 'legend-open', 'manual-panel'].includes(snap.bodyDataset.focusPanelMode || '')) {
        errors.push(`${label}: focusPanelMode=${snap.bodyDataset.focusPanelMode}`)
    }

    const staleDrawers = snap.independentDrawers.filter((drawer) => drawer.name !== 'infoPanel')
    if (staleDrawers.length) {
        errors.push(`${label}: stale drawers=${JSON.stringify(staleDrawers)}`)
    }

    const idleInfoPanel = snap.independentDrawers.find((drawer) => drawer.name === 'infoPanel')
    if (idleInfoPanel) {
        if (idleInfoPanel.bottom < snap.viewport.height - 2) {
            errors.push(`${label}: infoPanel not bottom-attached=${JSON.stringify(idleInfoPanel)}`)
        }
        if (idleInfoPanel.y < snap.viewport.height * 0.55) {
            errors.push(`${label}: infoPanel floating mid-screen=${JSON.stringify(idleInfoPanel)}`)
        }
    }

    return errors
}

async function waitForOverviewSettled(page, label) {
    let lastKey = ''
    let stableCount = 0
    let lastSnap = null
    let lastErrors = []

    for (let attempt = 0; attempt < 80; attempt += 1) {
        lastSnap = await snapshot(page)
        lastErrors = overviewLayoutErrors(label, lastSnap)
        if (!lastErrors.length) {
            const panel = lastSnap.independentDrawers.find((drawer) => drawer.name === 'infoPanel') || null
            const key = JSON.stringify({
                panel,
                currentView: lastSnap.currentView,
                panelSurface: lastSnap.bodyDataset.panelSurface,
                graphContext: lastSnap.bodyDataset.graphContext,
                semanticDive: lastSnap.bodyDataset.semanticDive,
                viewHandoffActive: lastSnap.bodyDataset.viewHandoffActive || ''
            })
            stableCount = key === lastKey ? stableCount + 1 : 1
            lastKey = key
            if (stableCount >= 2) return lastSnap
        } else {
            stableCount = 0
            lastKey = ''
        }
        await page
            .waitForFunction(() => new Promise((r) => requestAnimationFrame(() => r(true))), { timeout: 3000 })
            .catch(() => {})
    }

    console.error(
        JSON.stringify(
            {
                scenario: `${label}-overview-settle-timeout`,
                errors: lastErrors,
                snapshot: summarizeSnapshot(lastSnap)
            },
            null,
            2
        )
    )
    throw new Error(`${label}: overview reset layout did not settle`)
}

async function searchAndFocusFirstResult(page) {
    await page.locator('#search-input').fill(QUERY)
    await page.keyboard.press('Enter')
    await page.waitForSelector('.search-result-item', { state: 'visible', timeout: 20000 })
    await page.locator('.search-result-item').first().click()
    await page.waitForFunction(
        () => {
            const state = window.__APP_STATE__ || window.__TEST_STATE__ || {}
            return (
                (state.navState?.focusedIndex ?? state.focusedNode) !== null &&
                ['focus', 'focus-search'].includes(document.body.dataset.panelSurface)
            )
        },
        null,
        { timeout: 15000 }
    )
    await page
        .waitForFunction(() => new Promise((r) => requestAnimationFrame(() => r(true))), { timeout: 5000 })
        .catch(() => {})
    const focused = await snapshot(page)
    assert(
        ['focus', 'focus-search'].includes(focused.bodyDataset.panelSurface),
        `search focus should enter a focus surface, got ${focused.bodyDataset.panelSurface}`
    )
    assert(
        focused.independentDrawers.length === 1 && focused.independentDrawers[0].name === 'focusStage',
        `search focus should have focusStage as only independent drawer, got ${JSON.stringify(focused.independentDrawers)}`
    )
    return focused
}

async function enterSemanticDive(page) {
    await page.evaluate(() => {
        setSemanticDiveMode?.(true)
        setTrailDepth?.(2, { fromUserGesture: true, skipUrlSync: true })
        refreshCompositionState?.()
    })
    await page.waitForFunction(
        () => {
            const state = window.__APP_STATE__ || window.__TEST_STATE__ || {}
            return (
                state.semanticDiveMode === true &&
                state.trailDepth === 2 &&
                document.body.dataset.panelSurface === 'semantic-dive'
            )
        },
        null,
        { timeout: 15000 }
    )
    await page
        .waitForFunction(() => new Promise((r) => requestAnimationFrame(() => r(true))), { timeout: 5000 })
        .catch(() => {})
}

async function runClearButtonScenario(browser) {
    const page = await browser.newPage({
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 1,
        isMobile: true,
        hasTouch: true
    })
    await page.goto(withCacheBust(TARGET_URL, 'clear-button'), { waitUntil: 'domcontentloaded', timeout: 30000 })
    await waitReady(page)
    const focused = await searchAndFocusFirstResult(page)
    await page.evaluate(() => {
        clearSearch?.()
    })
    try {
        await page.waitForFunction(
            () => {
                const state = window.__APP_STATE__ || window.__TEST_STATE__ || {}
                return (
                    state.trailDepth === 0 &&
                    state.semanticDiveMode === false &&
                    document.body.dataset.panelSurface === 'idle' &&
                    document.querySelector('#search-input')?.value === ''
                )
            },
            null,
            { timeout: 15000 }
        )
    } catch (error) {
        console.error(
            JSON.stringify(
                {
                    scenario: 'clear-button-timeout',
                    focused,
                    afterClick: await snapshot(page)
                },
                null,
                2
            )
        )
        throw error
    }
    const cleared = await waitForOverviewSettled(page, 'clear button')
    assertOverview('clear button', cleared)
    await page.close()
    return { focused, cleared }
}

async function runEscapeDiveScenario(browser) {
    const page = await browser.newPage({
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 1,
        isMobile: true,
        hasTouch: true
    })
    await page.goto(withCacheBust(TARGET_URL, 'escape-dive'), { waitUntil: 'domcontentloaded', timeout: 30000 })
    await waitReady(page)
    await searchAndFocusFirstResult(page)
    await enterSemanticDive(page)
    const dive = await snapshot(page)
    await page.keyboard.press('Escape')
    await page.waitForFunction(
        () => {
            const state = window.__APP_STATE__ || window.__TEST_STATE__ || {}
            return (
                state.currentView === 'galaxy' &&
                state.trailDepth === 0 &&
                state.semanticDiveMode === false &&
                document.body.dataset.panelSurface === 'idle'
            )
        },
        null,
        { timeout: 15000 }
    )
    const reset = await waitForOverviewSettled(page, 'Escape from semantic dive')
    assertOverview('Escape from semantic dive', reset)
    await page.close()
    return { dive, reset }
}

async function runMapTransitionScenario(browser) {
    const page = await browser.newPage({
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 1,
        isMobile: true,
        hasTouch: true
    })
    await page.goto(withCacheBust(TARGET_URL, 'map-transition'), { waitUntil: 'domcontentloaded', timeout: 30000 })
    await waitReady(page)
    await searchAndFocusFirstResult(page)
    await enterSemanticDive(page)
    await page.evaluate(() => {
        switchView?.('map')
    })
    await page.waitForFunction(
        () => {
            const state = window.__APP_STATE__ || window.__TEST_STATE__ || {}
            return (
                state.currentView === 'map' &&
                document.body.dataset.activeView === 'map' &&
                document.body.dataset.panelSurface?.startsWith('map-')
            )
        },
        null,
        { timeout: 20000 }
    )
    await page.waitForFunction(
        () => {
            const mapContainer = document.querySelector('#map-container.active')
            if (!mapContainer) return false
            const rect = mapContainer.getBoundingClientRect()
            const style = getComputedStyle(mapContainer)
            return (
                rect.width > 0 &&
                rect.height > 0 &&
                style.display !== 'none' &&
                style.visibility !== 'hidden' &&
                Number(style.opacity || 1) > 0.01
            )
        },
        null,
        { timeout: 20000 }
    )
    await page
        .waitForFunction(() => new Promise((r) => requestAnimationFrame(() => r(true))), { timeout: 5000 })
        .catch(() => {})
    const map = await snapshot(page)
    assert(map.currentView === 'map', `map transition: currentView should be map, got ${map.currentView}`)
    assert(
        map.bodyDataset.activeView === 'map',
        `map transition: activeView should be map, got ${map.bodyDataset.activeView}`
    )
    assert(
        map.bodyDataset.panelSurface === 'map-focus-search',
        `map transition: panelSurface should be map-focus-search, got ${map.bodyDataset.panelSurface}`
    )
    assert(
        map.bodyDataset.mapContext === 'focus-search',
        `map transition: mapContext should be focus-search, got ${map.bodyDataset.mapContext}`
    )
    assert(
        map.bodyDataset.semanticDive === 'inactive',
        `map transition: semanticDive dataset should be inactive, got ${map.bodyDataset.semanticDive}`
    )
    assert(
        map.semanticDiveMode === true && map.trailDepth === 2,
        `map transition: internal dive/trail state should be preserved for map return, got semanticDiveMode=${map.semanticDiveMode} trailDepth=${map.trailDepth}`
    )
    assert(
        map.boxes.mapContainer?.visible,
        `map transition: map container should be visible, got ${JSON.stringify(map.boxes.mapContainer)}`
    )
    assert(
        !map.independentDrawers.some((drawer) => drawer.name === 'focusStage'),
        `map transition: focusStage should not remain a primary drawer, got ${JSON.stringify(map.independentDrawers)}`
    )
    assert(
        map.independentDrawers.length <= 1,
        `map transition: map-focus-search should expose at most one primary drawer, got ${JSON.stringify(map.independentDrawers)}`
    )
    assert(
        !map.independentDrawers.length || map.independentDrawers[0]?.name === 'infoPanel',
        `map transition: only infoPanel may become drawer-sized in map-focus-search, got ${JSON.stringify(map.independentDrawers)}`
    )
    assert(
        !map.independentDrawers.some((drawer) => drawer.name === 'searchResults'),
        `map transition: search results must stay compact under map-focus-search, got ${JSON.stringify(map.independentDrawers)}`
    )
    if (map.boxes.searchResults?.visible) {
        assert(
            map.boxes.searchResults.bottom <= map.viewport.height,
            `map transition: visible search results should not overflow viewport, got ${JSON.stringify(map.boxes.searchResults)}`
        )
    }
    assert(
        !map.boxes.searchContainer?.visible,
        `map transition: search chrome should not occlude the selected map drawer, got ${JSON.stringify(map.boxes.searchContainer)}`
    )
    assert(
        map.boxes.infoPanel?.visible,
        `map transition: infoPanel should be visible, got ${JSON.stringify(map.boxes.infoPanel)}`
    )
    assert(
        map.boxes.infoPanel.height <= Math.min(340, Math.round(map.viewport.height * 0.4)),
        `map transition: infoPanel should leave map as the primary surface, got ${JSON.stringify(map.boxes.infoPanel)} in ${JSON.stringify(map.viewport)}`
    )
    assert(
        map.boxes.infoPanel.bottom <= map.viewport.height + 1,
        `map transition: infoPanel should stay inside viewport, got ${JSON.stringify(map.boxes.infoPanel)}`
    )
    assert(
        map.boxes.infoPanel.y >= map.viewport.height * 0.52,
        `map transition: infoPanel should be bottom-attached, not a mid-screen slab, got ${JSON.stringify(map.boxes.infoPanel)}`
    )
    assert(
        map.boxes.selectedCard?.visible,
        `map transition: selected card content should be visible, got ${JSON.stringify(map.boxes.selectedCard)}`
    )
    assert(
        map.boxes.selectedCard.dataset?.contentVariant === 'info-panel',
        `map transition: selected card should use InfoPanel variant, got ${JSON.stringify(map.boxes.selectedCard)}`
    )
    assert(
        map.boxes.selectedCard.dataset?.contentOwner === 'info-panel',
        `map transition: selected card should be owned by InfoPanel, got ${JSON.stringify(map.boxes.selectedCard)}`
    )
    assert(
        map.boxes.selectedCard.dataset?.debugEffectiveSurface === 'map-focus-search',
        `map transition: selected card should render map-focus-search surface, got ${JSON.stringify(map.boxes.selectedCard)}`
    )
    assert(
        map.boxes.selectedCard.height <= map.boxes.infoPanel.height + 2,
        `map transition: selected card should stay inside compact map drawer, got card=${JSON.stringify(map.boxes.selectedCard)} panel=${JSON.stringify(map.boxes.infoPanel)}`
    )
    assert(
        !map.boxes.selectedMapSummary?.visible,
        `map transition: retired selected-map-summary subtree should stay absent, got ${JSON.stringify(map.boxes.selectedMapSummary)}`
    )
    assert(
        !map.boxes.selectedMapSummaryName?.visible,
        `map transition: retired selected-map-summary name should stay absent, got ${JSON.stringify(map.boxes.selectedMapSummaryName)}`
    )
    assert(
        !map.boxes.selectedMapSummaryWhat?.visible,
        `map transition: retired selected-map-summary description should stay absent, got ${JSON.stringify(map.boxes.selectedMapSummaryWhat)}`
    )
    assert(
        !map.boxes.selectedMapSummaryMatch?.visible,
        `map transition: retired selected-map-summary match context should stay absent, got ${JSON.stringify(map.boxes.selectedMapSummaryMatch)}`
    )
    assert(
        map.boxes.selectedDetails?.visible,
        `map transition: InfoPanel selected details should own the compact map content, got ${JSON.stringify(map.boxes.selectedDetails)}`
    )
    assert(
        map.boxes.selectedName?.visible,
        `map transition: compact selected name should be visible, got ${JSON.stringify(map.boxes.selectedName)}`
    )
    assert(
        map.boxes.selectedSubtitle?.visible,
        `map transition: compact selected description should be visible, got ${JSON.stringify(map.boxes.selectedSubtitle)}`
    )
    ;['selectedTrivia', 'selectedGrid', 'selectedActionRow', 'trailControls', 'trailContext'].forEach((key) => {
        assert(
            !map.boxes[key]?.visible,
            `map transition: bulky ${key} should be hidden in map-focus-search, got ${JSON.stringify(map.boxes[key])}`
        )
    })

    await page.keyboard.press('Escape')
    await page.waitForFunction(
        () => {
            const state = window.__APP_STATE__ || window.__TEST_STATE__ || {}
            return (
                state.currentView === 'galaxy' &&
                state.trailDepth === 0 &&
                state.semanticDiveMode === false &&
                document.body.dataset.panelSurface === 'idle'
            )
        },
        null,
        { timeout: 15000 }
    )
    const reset = await waitForOverviewSettled(page, 'Escape from map transition')
    assertOverview('Escape from map transition', reset)
    await page.close()
    return { map, reset }
}

// SwiftShader gate (see visual-state-audit.mjs)
const forceSoftwareWebgl = process.env.SEMANTIC_FORCE_WEBGL_SOFTWARE === '1'
const browser = await chromium.launch({
    headless: false,
    args: [
        '--use-gl=angle',
        '--enable-webgl',
        '--no-sandbox',
        ...(forceSoftwareWebgl ? ['--enable-unsafe-swiftshader', '--enable-webgl-software-rendering'] : [])
    ]
})

try {
    const clearButton = await runClearButtonScenario(browser)
    const escapeDive = await runEscapeDiveScenario(browser)
    const mapTransition = await runMapTransitionScenario(browser)
    console.log(
        JSON.stringify(
            {
                clearButton: summarizeScenario(clearButton),
                escapeDive: summarizeScenario(escapeDive),
                mapTransition: summarizeScenario(mapTransition)
            },
            null,
            2
        )
    )
    console.log('Reset/map interaction ownership contract passed.')
} finally {
    await Promise.race([browser.close(), new Promise((resolve) => setTimeout(resolve, 1500))])
}

process.exit(0)
