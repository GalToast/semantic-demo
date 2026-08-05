/**
 * ui-quality-contract.mjs
 *
 * Opinionated rendered-UI quality gate for Semantic Explorer.
 * This complements surface-contract-check.mjs by checking cross-state
 * problems that usually look "ugly" before they become functional bugs:
 * clipped critical text, undersized visible controls, viewport-clipped chrome,
 * panel overlap, and controls leaking into states where they compete visually.
 */

import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'

const DEFAULT_URL = 'http://127.0.0.1:8795/dist/svelte/index.html'
const cliArgs = process.argv.slice(2)
const headed =
    !cliArgs.includes('--headless') && process.env.PW_HEADLESS !== '1' && process.env.PLAYWRIGHT_HEADLESS !== '1'
// SwiftShader gate (see visual-state-audit.mjs)
const forceSoftwareWebgl = process.env.SEMANTIC_FORCE_WEBGL_SOFTWARE === '1'
const launchOptions = {
    headless: !headed,
    args: headed
        ? ['--use-gl=angle', '--enable-webgl', '--no-sandbox', ...(forceSoftwareWebgl ? ['--enable-unsafe-swiftshader', '--enable-webgl-software-rendering'] : [])]
        : ['--no-sandbox', ...(forceSoftwareWebgl ? ['--ignore-gpu-blocklist', '--use-gl=angle', '--enable-webgl', '--enable-unsafe-swiftshader', '--enable-webgl-software-rendering'] : [])]
}
function positionalUrl(args) {
    const flagsWithValue = new Set(['--surface', '--state', '--states', '--surfaces'])
    for (let i = 0; i < args.length; i += 1) {
        const arg = args[i]
        if (flagsWithValue.has(arg)) {
            i += 1
            continue
        }
        if (!arg.startsWith('--')) return arg
    }
    return DEFAULT_URL
}
const targetUrl = positionalUrl(cliArgs)
const outRoot = path.resolve(process.cwd(), 'tmp', 'ui-quality-contract')
const runId = new Date().toISOString().replace(/[:.]/g, '-')
const outDir = path.join(outRoot, runId)

const mobile = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true }
const desktop = { width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false }

const states = [
    { name: 'mobile-idle', viewport: mobile, params: { view: 'galaxy' } },
    { name: 'mobile-search', viewport: mobile, params: { view: 'galaxy', q: 'coffee', anchor: '1' } },
    {
        name: 'mobile-search-error',
        viewport: mobile,
        params: { view: 'galaxy', q: 'semantic-error-proof' },
        setup: forceSearchError
    },
    { name: 'mobile-focus', viewport: mobile, params: { view: 'galaxy', q: 'coffee', anchor: '519' } },
    { name: 'mobile-focus-search', viewport: mobile, params: { view: 'galaxy', q: 'coffee', anchor: '519' } },
    {
        name: 'mobile-field-node',
        viewport: mobile,
        params: { view: 'galaxy', q: 'coffee', anchor: '519' },
        setup: forceFieldNode
    },
    {
        name: 'mobile-thread-preview',
        viewport: mobile,
        params: { view: 'galaxy', q: 'coffee', anchor: '519' },
        setup: forceThreadPreview
    },
    {
        name: 'mobile-semantic-dive',
        viewport: mobile,
        params: { view: 'galaxy', q: 'coffee', anchor: '1', mode: 'trail', depth: '2', record: '1' }
    },
    {
        name: 'mobile-map-focus-search',
        viewport: mobile,
        params: { view: 'map', q: 'coffee', anchor: '519', depth: '2', record: '519' }
    },
    { name: 'desktop-idle', viewport: desktop, params: { view: 'galaxy' } }
]

function requestedStateNames(args) {
    const names = []
    for (let i = 0; i < args.length; i += 1) {
        const arg = args[i]
        if (arg === '--surface' || arg === '--state') {
            if (args[i + 1]) names.push(args[i + 1])
            i += 1
        } else if (arg === '--states' || arg === '--surfaces') {
            if (args[i + 1])
                names.push(
                    ...args[i + 1]
                        .split(',')
                        .map((value) => value.trim())
                        .filter(Boolean)
                )
            i += 1
        } else if (arg.startsWith('--surface=')) {
            names.push(arg.slice('--surface='.length))
        } else if (arg.startsWith('--state=')) {
            names.push(arg.slice('--state='.length))
        } else if (arg.startsWith('--states=')) {
            names.push(
                ...arg
                    .slice('--states='.length)
                    .split(',')
                    .map((value) => value.trim())
                    .filter(Boolean)
            )
        } else if (arg.startsWith('--surfaces=')) {
            names.push(
                ...arg
                    .slice('--surfaces='.length)
                    .split(',')
                    .map((value) => value.trim())
                    .filter(Boolean)
            )
        }
    }
    return new Set(names)
}

const requestedStates = requestedStateNames(cliArgs)
const availableStateNames = new Set(states.map((state) => state.name))
const unknownStates = [...requestedStates].filter((name) => !availableStateNames.has(name))
const statesToRun = requestedStates.size ? states.filter((state) => requestedStates.has(state.name)) : states

if (unknownStates.length) {
    console.error(`Unknown ui-quality state(s): ${unknownStates.join(', ')}`)
    console.error(`Available states: ${states.map((state) => state.name).join(', ')}`)
    process.exit(1)
}

function withParams(baseUrl, params) {
    const url = new URL(baseUrl)
    url.searchParams.set('nodemo', '1')
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
    return url.toString()
}

async function waitForReady(page) {
    await page.waitForLoadState('load', { timeout: 7000 }).catch(() => {})
    await page.evaluate(() => document.fonts?.ready).catch(() => {})
    await page.waitForFunction(() => document.body?.dataset?.graphicsMode, { timeout: 7000 }).catch(() => {})
    await page
        .waitForFunction(
            () => {
                const { cameraAssist, loadingOverlay, sceneReady, viewHandoffActive } = document.body.dataset
                const overlay = document.querySelector('#loading-overlay')
                const overlayStyle = overlay ? getComputedStyle(overlay) : null
                const overlayHidden =
                    !overlay ||
                    loadingOverlay === 'hidden' ||
                    overlay.classList.contains('hidden') ||
                    overlay.getAttribute('aria-hidden') === 'true' ||
                    overlayStyle?.display === 'none' ||
                    overlayStyle?.visibility === 'hidden' ||
                    Number(overlayStyle?.opacity || 1) <= 0.05
                const routeSettled =
                    sceneReady === 'true' ||
                    viewHandoffActive === 'false' ||
                    cameraAssist === 'free' ||
                    document.body.dataset.graphicsMode === 'fallback'
                return overlayHidden && routeSettled
            },
            { timeout: 10000 }
        )
        .catch(() => {})
    // preceding waitForFunction handles settlement
}

async function forceSearchError(page) {
    await page.evaluate(() => {
        document.body.dataset.activeView = 'galaxy'
        document.body.dataset.graphContext = 'search'
        document.body.dataset.panelSurface = 'search'
        document.body.dataset.laneState = 'degraded'
        const searchContainer = document.querySelector('.search-container')
        searchContainer?.classList.add('has-query')
        const results = document.querySelector('#search-results')
        if (!results) return
        results.classList.add('active')
        results.innerHTML = `
      <div class="search-error-state" role="alert">
        <span class="search-error-kicker">Connection Lost</span>
        <p class="search-error-text">Semantic lane unavailable. Retrying.</p>
        <div class="search-error-actions">
          <button class="search-error-retry-btn" type="button">Retry</button>
          <button class="search-error-dismiss-btn" type="button">Dismiss</button>
        </div>
      </div>`
    })
    // state mutation applied synchronously
}

async function forceFieldNode(page) {
    await page.evaluate(() => {
        document.body.dataset.activeView = 'galaxy'
        document.body.dataset.graphContext = 'focus-search'
        document.body.dataset.panelSurface = 'focus-search'
        document.body.dataset.focusPanelMode = 'field-node'
        document.body.dataset.fieldStepSync = 'active'
        window.__navActions__?.refreshCompositionState?.()
    })
    await page
        .waitForFunction(() => new Promise((r) => requestAnimationFrame(() => r(true))), { timeout: 3000 })
        .catch(() => {})
}

async function forceThreadPreview(page) {
    const firstResult = page.locator('.search-result-item').first()
    if (await firstResult.count()) {
        await firstResult.click({ timeout: 5000 }).catch(() => {})
    }
    await page
        .waitForFunction(() => new Promise((r) => requestAnimationFrame(() => r(true))), { timeout: 5000 })
        .catch(() => {})
    await page.evaluate(() => {
        const state = window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {}
        if (typeof window.__navActions__?.switchView === 'function') {
            window.__navActions__.switchView('galaxy', { skipUrlSync: true, silentHandoff: true })
        }
        if (state.currentView !== 'galaxy') state.currentView = 'galaxy'

        const seedIndex = Number.isFinite(state.navState?.focusedIndex)
            ? state.navState.focusedIndex
            : Number.isFinite(state.focusedNode)
              ? state.focusedNode
              : Number.isFinite(state.currentSearchSummary?.anchorIndex)
                ? state.currentSearchSummary.anchorIndex
                : 519

        document.body.classList.add('is-active')
        document.body.dataset.activeView = 'galaxy'
        document.body.dataset.graphContext = 'focus'
        document.body.dataset.panelSurface = 'focus'
        document.body.dataset.threadInspectSurface = 'inspector'

        if (Number.isFinite(seedIndex) && typeof window.__navActions__?.focusOnNode === 'function') {
            window.__navActions__.focusOnNode(seedIndex, {
                skipUrlSync: true,
                fromSearchResult: true,
                preserveMode: true
            })
        } else if (Number.isFinite(seedIndex)) {
            state.focusedNode = seedIndex
        }
        if (state.navState && Number.isFinite(seedIndex)) {
            state.navState.focusedIndex = seedIndex
            window.__navActions__?.setTrailFromSeed?.(seedIndex)
        }

        const candidate =
            (state.navState?.threadCandidates || []).find(
                (item) => item && Number.isFinite(item.index) && item.index !== seedIndex && item.relationshipRole
            ) ||
            (state.navState?.threadCandidates || []).find(
                (item) => item && Number.isFinite(item.index) && item.index !== seedIndex
            )
        if (candidate && !candidate.relationshipRole) {
            candidate.relationshipRole = 'upstream'
            candidate.relationshipAxis = candidate.relationshipAxis || 'ui_quality_support_fixture'
            candidate.roleReason = candidate.roleReason || 'support or infrastructure signal'
            candidate.source = candidate.source || 'semantic'
        }

        const inspectThreadNeighbor =
            typeof window._ti?.inspectThreadNeighbor === 'function'
                ? window._ti.inspectThreadNeighbor
                : typeof window.inspectThreadNeighbor === 'function'
                  ? window.inspectThreadNeighbor
                  : null
        const renderThreadInspection =
            typeof window._ti?.renderThreadInspection === 'function'
                ? window._ti.renderThreadInspection
                : typeof window.renderThreadInspection === 'function'
                  ? window.renderThreadInspection
                  : null
        if (candidate && inspectThreadNeighbor) {
            inspectThreadNeighbor(candidate.index, { force: true, surface: 'inspector' })
        } else if (candidate && renderThreadInspection) {
            renderThreadInspection(candidate.index, { force: true, surface: 'inspector' })
        }

        document.body.dataset.activeView = 'galaxy'
        document.body.dataset.graphContext = 'focus'
        document.body.dataset.panelSurface = 'focus'
        document.body.dataset.threadInspectSurface = 'inspector'
        window.__navActions__?.refreshCompositionState?.()

        const focusStage = document.querySelector('#focus-stage')
        if (focusStage) {
            focusStage.hidden = false
            focusStage.setAttribute('aria-hidden', 'false')
            focusStage.classList.add('active')
        }
        document.querySelectorAll('#btn-thread-pin, #btn-thread-follow, #btn-thread-clear').forEach((btn) => {
            btn.disabled = false
        })
    })
    await page
        .waitForFunction(
            () => {
                const card = document.querySelector('#selected-card')
                const details = document.querySelector('#selected-details')
                const primary = document.querySelector('#btn-journey-primary')
                const secondary = document.querySelector('#btn-journey-secondary')
                return (
                    card?.dataset.contentOwner === 'focus-stage' &&
                    card.getAttribute('aria-hidden') === 'true' &&
                    (!details || details.getAttribute('aria-hidden') === 'true') &&
                    (!primary || primary.hidden || primary.dataset.journeyAction) &&
                    (!secondary || secondary.hidden || secondary.dataset.journeyAction)
                )
            },
            { timeout: 2000 }
        )
        .catch(() => {})
    // preceding waitForFunction handles settlement
}

function checksForState(name) {
    const criticalText = [
        '.journey-compass-title',
        '.journey-compass-action',
        '.search-label',
        '.search-input',
        '.search-error-state',
        '.search-error-kicker',
        '.search-error-text',
        '.focus-stage-name',
        '.focus-stage-dive-btn',
        '.focus-thread-inspector-title',
        '.focus-thread-inspector-copy',
        '.cluster-label'
    ]

    const interactive = ['button', 'input', 'select', 'textarea', '[role="button"]', 'a[href]']

    const chrome = [
        '.journey-compass',
        '#info-panel',
        '.search-container',
        '#search-results',
        '#focus-stage',
        '.focus-stage-card',
        '.focus-stage-neighbors',
        '.focus-thread-inspector',
        '#selected-card',
        '#selected-details',
        '.map-trail-strip',
        '.controls',
        '.share-toggle',
        '.legend-toggle',
        '.help-toggle',
        '.view-toggle',
        '.weather-widget',
        '.time-display',
        '#btn-legend',
        '#btn-keyboard-help',
        '.panel-toggle'
    ]

    const collisionSurfaces = [
        '.journey-compass',
        '.journey-compass-rail',
        '.journey-compass-actions',
        '#info-panel',
        '.search-container',
        '#search-results',
        '#focus-stage',
        '.focus-stage-card',
        '.focus-stage-neighbors',
        '.focus-stage-journey',
        '.focus-thread-inspector',
        '#selected-card',
        '#selected-details',
        '.map-trail-strip',
        '.view-toggle',
        '.weather-widget',
        '.time-display',
        '.controls',
        '.share-toggle',
        '.legend-toggle',
        '.help-toggle',
        '#btn-legend',
        '#btn-keyboard-help',
        '.panel-toggle',
        '#btn-launch',
        '.demo-starters',
        '#mode-grid'
    ]

    return { criticalText, interactive, chrome, collisionSurfaces, isMobile: name.startsWith('mobile-') }
}

async function auditState(page, name) {
    const selectors = checksForState(name)
    return page.evaluate(
        ({ selectors, name }) => {
            const failures = []
            const passes = []
            const viewport = { width: window.innerWidth, height: window.innerHeight }

            function visible(el) {
                if (!el) return false
                const style = getComputedStyle(el)
                const rect = el.getBoundingClientRect()
                const inViewport =
                    rect.right > 0 && rect.bottom > 0 && rect.x < window.innerWidth && rect.y < window.innerHeight
                return (
                    style.display !== 'none' &&
                    style.visibility !== 'hidden' &&
                    Number(style.opacity || 1) > 0.05 &&
                    rect.width > 0 &&
                    rect.height > 0 &&
                    inViewport
                )
            }

            // Fully laid-out map summary cards must be completely visible; transient
            // fades are class-owned and should not persist into captured states.
            const OPACITY_VISIBLE_THRESHOLD = 1.0

            // Touch-target minimum from docs/semantic-demo-design-tokens.md.
            // 44px matches the iOS HIG / WCAG 2.5.5 minimum; 0.5px tolerance absorbs
            // sub-pixel rounding on hi-DPI viewports.
            const TOUCH_TARGET_MIN_PX = 44
            const TOUCH_TARGET_TOLERANCE_PX = 0.5
            const TOUCH_TARGET_MIN_WITH_TOLERANCE = TOUCH_TARGET_MIN_PX - TOUCH_TARGET_TOLERANCE_PX

            function rectFor(selector) {
                const el = document.querySelector(selector)
                if (!visible(el)) return null
                const rect = el.getBoundingClientRect()
                return {
                    x: rect.x,
                    y: rect.y,
                    width: rect.width,
                    height: rect.height,
                    right: rect.right,
                    bottom: rect.bottom
                }
            }

            function visibleChrome(selector) {
                const el = document.querySelector(selector)
                if (!visible(el)) return null
                const rect = el.getBoundingClientRect()
                const style = getComputedStyle(el)
                return {
                    selector,
                    x: Number(rect.x.toFixed(1)),
                    y: Number(rect.y.toFixed(1)),
                    width: Number(rect.width.toFixed(1)),
                    height: Number(rect.height.toFixed(1)),
                    right: Number(rect.right.toFixed(1)),
                    bottom: Number(rect.bottom.toFixed(1)),
                    areaRatio: Number(((rect.width * rect.height) / (viewport.width * viewport.height)).toFixed(3)),
                    pointerEvents: style.pointerEvents,
                    opacity: Number(style.opacity || 1),
                    zIndex: style.zIndex
                }
            }

            function clipped(el) {
                if (!visible(el)) return false
                if (parseFloat(getComputedStyle(el).fontSize || '0') === 0) return false
                const text = (el.textContent || el.value || '').trim()
                if (!text || text.length < 2) return false
                const style = getComputedStyle(el)
                if (style.overflow === 'visible' && style.whiteSpace !== 'nowrap') return false
                const rect = el.getBoundingClientRect()
                return el.scrollWidth > rect.width + 1 || el.scrollHeight > rect.height + 1
            }

            function overlaps(a, b, tolerance = 3) {
                return !(
                    a.right <= b.x + tolerance ||
                    b.right <= a.x + tolerance ||
                    a.bottom <= b.y + tolerance ||
                    b.bottom <= a.y + tolerance
                )
            }

            function intersect(a, b) {
                const width = Math.max(0, Math.min(a.right, b.right) - Math.max(a.x, b.x))
                const height = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y))
                return { width, height, area: width * height }
            }

            function areaOf(rect) {
                return Math.max(0, rect.width) * Math.max(0, rect.height)
            }

            function labelForElement(el, selector) {
                if (el.id) return `#${el.id}`
                const classLabel =
                    typeof el.className === 'string'
                        ? el.className.trim().split(/\s+/).filter(Boolean).slice(0, 3).join('.')
                        : ''
                return classLabel ? `${selector} (${el.tagName.toLowerCase()}.${classLabel})` : selector
            }

            function chromeSurfaceFor(el, selector) {
                const rect = el.getBoundingClientRect()
                const style = getComputedStyle(el)
                return {
                    el,
                    selector: labelForElement(el, selector),
                    x: Number(rect.x.toFixed(1)),
                    y: Number(rect.y.toFixed(1)),
                    width: Number(rect.width.toFixed(1)),
                    height: Number(rect.height.toFixed(1)),
                    right: Number(rect.right.toFixed(1)),
                    bottom: Number(rect.bottom.toFixed(1)),
                    pointerEvents: style.pointerEvents,
                    opacity: Number(style.opacity || 1),
                    zIndex: style.zIndex
                }
            }

            function serializableSurface(surface) {
                const { el: _el, ...rest } = surface
                return rest
            }

            function collectCollisionSurfaces() {
                const seen = new Set()
                const surfaces = []
                for (const selector of selectors.collisionSurfaces) {
                    for (const el of document.querySelectorAll(selector)) {
                        if (!visible(el) || seen.has(el)) continue
                        seen.add(el)
                        surfaces.push(chromeSurfaceFor(el, selector))
                    }
                }
                return surfaces
            }

            function intentionalOverlap(a, b) {
                if (a.el === b.el) return true
                if (a.el.contains(b.el) || b.el.contains(a.el)) return true
                if (a.pointerEvents === 'none' || b.pointerEvents === 'none') return true
                return false
            }

            function genericChromeOverlapFailures() {
                const surfaces = collectCollisionSurfaces()
                const overlapFailures = []
                for (let i = 0; i < surfaces.length; i += 1) {
                    for (let j = i + 1; j < surfaces.length; j += 1) {
                        const a = surfaces[i]
                        const b = surfaces[j]
                        if (intentionalOverlap(a, b)) continue
                        const overlap = intersect(a, b)
                        if (overlap.area <= 96) continue
                        const overlapRatio = overlap.area / Math.max(1, Math.min(areaOf(a), areaOf(b)))
                        if (overlapRatio <= 0.08) continue
                        overlapFailures.push({
                            check: 'generic-chrome-overlap',
                            state: name,
                            a: serializableSurface(a),
                            b: serializableSurface(b),
                            overlapArea: Number(overlap.area.toFixed(1)),
                            overlapRatio: Number(overlapRatio.toFixed(3))
                        })
                    }
                }
                passes.push({ check: 'generic-chrome-overlap', inspected: surfaces.length })
                return overlapFailures
            }

            const visibleCompassActions = Array.from(document.querySelectorAll('.journey-compass-action')).filter(
                visible
            )
            for (const action of visibleCompassActions) {
                const rect = action.getBoundingClientRect()
                const label = (action.innerText || action.textContent || action.getAttribute('aria-label') || '').trim()
                if (action.hidden || action.hasAttribute('hidden') || !action.dataset.journeyAction) {
                    failures.push({
                        check: 'composition:journey-action-hidden-rendered',
                        selector: action.id ? `#${action.id}` : '.journey-compass-action',
                        state: name,
                        label,
                        action: action.dataset.journeyAction || '',
                        rect: {
                            x: Number(rect.x.toFixed(1)),
                            y: Number(rect.y.toFixed(1)),
                            width: Number(rect.width.toFixed(1)),
                            height: Number(rect.height.toFixed(1))
                        }
                    })
                } else if (!label) {
                    failures.push({
                        check: 'composition:journey-action-blank-label',
                        selector: action.id ? `#${action.id}` : '.journey-compass-action',
                        state: name,
                        action: action.dataset.journeyAction || ''
                    })
                }
            }

            for (const selector of selectors.criticalText) {
                const elements = Array.from(document.querySelectorAll(selector)).filter(visible)
                for (const el of elements) {
                    if (clipped(el)) {
                        failures.push({
                            check: 'text-clipping',
                            selector,
                            text: (el.textContent || el.value || '').trim().slice(0, 80)
                        })
                    }
                }
                passes.push({ check: 'text-clipping', selector, inspected: elements.length })
            }

            if (selectors.isMobile) {
                const interactive = Array.from(document.querySelectorAll(selectors.interactive.join(','))).filter(
                    visible
                )
                for (const el of interactive) {
                    const rect = el.getBoundingClientRect()
                    const style = getComputedStyle(el)
                    const label =
                        el.id || el.className || el.getAttribute('aria-label') || el.textContent?.trim() || el.tagName
                    if (
                        style.pointerEvents !== 'none' &&
                        (rect.width < TOUCH_TARGET_MIN_WITH_TOLERANCE || rect.height < TOUCH_TARGET_MIN_WITH_TOLERANCE)
                    ) {
                        failures.push({
                            check: 'touch-target',
                            selector: label,
                            width: Number(rect.width.toFixed(1)),
                            height: Number(rect.height.toFixed(1))
                        })
                    }
                }
                passes.push({ check: 'touch-targets', inspected: interactive.length })
            }

            for (const selector of selectors.chrome) {
                const rect = rectFor(selector)
                if (!rect) continue
                const offscreen =
                    rect.x < -1 || rect.y < -1 || rect.right > viewport.width + 1 || rect.bottom > viewport.height + 1
                if (offscreen) failures.push({ check: 'viewport-fit', selector, rect })
                passes.push({ check: 'viewport-fit', selector })
            }

            const topChrome = rectFor('.journey-compass')
            const lowerSelectors = [
                '#info-panel',
                '.search-container',
                '#search-results',
                '#focus-stage',
                '.focus-stage-card',
                '.focus-thread-inspector'
            ]
            if (topChrome) {
                for (const selector of lowerSelectors) {
                    const lower = rectFor(selector)
                    if (lower && overlaps(topChrome, lower))
                        failures.push({ check: 'chrome-overlap', a: '.journey-compass', b: selector })
                }
            }

            if (name.includes('search') || name.includes('focus') || name.includes('field-node')) {
                const share = rectFor('.share-toggle')
                if (share && selectors.isMobile)
                    failures.push({ check: 'state-leak', selector: '.share-toggle', state: name })
            }

            const visibleChromeSurfaces = selectors.chrome.map((selector) => visibleChrome(selector)).filter(Boolean)
            passes.push({
                check: 'composition:visible-chrome',
                inspected: visibleChromeSurfaces.length,
                surfaces: visibleChromeSurfaces
            })
            failures.push(...genericChromeOverlapFailures())

            if (selectors.isMobile) {
                const controls = visibleChromeSurfaces.find((surface) => surface.selector === '.controls')
                const activeView = document.body.dataset.activeView || ''
                const panelSurface = document.body.dataset.panelSurface || ''
                const tallRail =
                    controls && controls.pointerEvents !== 'none' && controls.height > 120 && controls.width >= 44
                if (activeView === 'galaxy' && panelSurface && !panelSurface.startsWith('map-') && tallRail) {
                    failures.push({
                        check: 'composition:controls-rail-prominent',
                        selector: '.controls',
                        state: name,
                        rect: controls
                    })
                }
                if ((panelSurface === 'focus-search' || panelSurface === 'semantic-dive') && controls) {
                    failures.push({
                        check: 'composition:focus-controls-rail-visible',
                        selector: '.controls',
                        state: name,
                        rect: controls
                    })
                }

                const share = rectFor('.share-toggle')
                const searchContainer = rectFor('.search-container')
                const modeGrid = rectFor('#mode-grid')
                if (panelSurface === 'search' && modeGrid) {
                    failures.push({
                        check: 'composition:search-mode-grid-visible',
                        selector: '#mode-grid',
                        state: name,
                        rect: modeGrid
                    })
                }

                if (panelSurface === 'search') {
                    const compass = visibleChrome('.journey-compass')
                    const compassCopy = visibleChrome('.journey-compass-copy')
                    const compassActions = visibleChrome('.journey-compass-actions')
                    if (compass && compassCopy && compassCopy.width < Math.min(150, compass.width * 0.42)) {
                        failures.push({
                            check: 'composition:search-compass-copy-squeezed',
                            selector: '.journey-compass-copy',
                            state: name,
                            rect: compassCopy
                        })
                    }
                    if (compass && compassActions && compassActions.width > Math.min(170, compass.width * 0.48)) {
                        failures.push({
                            check: 'composition:search-compass-actions-dominate',
                            selector: '.journey-compass-actions',
                            state: name,
                            rect: compassActions
                        })
                    }
                    for (const action of visibleCompassActions) {
                        if (action.dataset.journeyAction && !action.dataset.mobileLabel) {
                            failures.push({
                                check: 'composition:journey-action-missing-mobile-label',
                                selector: action.id ? `#${action.id}` : '.journey-compass-action',
                                state: name,
                                action: action.dataset.journeyAction
                            })
                        }
                    }
                }

                if ((panelSurface === 'focus' || panelSurface === 'focus-search') && searchContainer) {
                    failures.push({
                        check: 'composition:focus-search-bar-visible',
                        selector: '.search-container',
                        state: name,
                        rect: searchContainer
                    })
                }

                if ((panelSurface === 'focus-search' || panelSurface === 'semantic-dive') && modeGrid) {
                    failures.push({
                        check: 'composition:focus-mode-grid-visible',
                        selector: '#mode-grid',
                        state: name,
                        rect: modeGrid
                    })
                }

                if (panelSurface === 'idle') {
                    const idleOnlySearch = [
                        '#selected-card',
                        '.selected-card',
                        '.selected-empty',
                        '.stats-row',
                        '.stat-caption',
                        '.demo-starters',
                        '#btn-launch',
                        '#mode-grid',
                        '#cluster-section',
                        '#filters-section'
                    ]
                    for (const selector of idleOnlySearch) {
                        const staleSurface = visibleChrome(selector)
                        if (staleSurface) {
                            failures.push({
                                check: 'composition:idle-left-panel-stale-surface',
                                selector,
                                state: name,
                                rect: staleSurface
                            })
                        }
                    }
                }

                const viewToggle = visibleChrome('.view-toggle')
                if ((panelSurface === 'focus-search' || panelSurface === 'semantic-dive') && viewToggle) {
                    failures.push({
                        check: 'composition:focus-view-toggle-visible',
                        selector: '.view-toggle',
                        state: name,
                        rect: viewToggle
                    })
                }

                if (panelSurface === 'focus-search' || panelSurface === 'semantic-dive') {
                    for (const selector of ['.share-toggle', '.legend-toggle']) {
                        const globalAction = visibleChrome(selector)
                        if (globalAction) {
                            failures.push({
                                check: 'composition:focus-global-action-visible',
                                selector,
                                state: name,
                                rect: globalAction
                            })
                        }
                    }
                }

                if (['focus', 'focus-search', 'semantic-dive'].includes(panelSurface)) {
                    const selectedCard =
                        document.querySelector('#focus-stage #selected-card') ||
                        document.querySelector('#selected-card')
                    const selectedDetails =
                        document.querySelector('#focus-stage #selected-details') ||
                        document.querySelector('#selected-details')
                    if (selectedCard?.dataset.contentOwner !== 'focus-stage') {
                        failures.push({
                            check: 'composition:focus-selected-content-owner',
                            selector: '#selected-card',
                            state: name,
                            owner: selectedCard?.dataset.contentOwner || '',
                            variant: selectedCard?.dataset.contentVariant || ''
                        })
                    }
                    if (selectedCard && selectedCard.getAttribute('aria-hidden') !== 'true') {
                        failures.push({
                            check: 'composition:focus-selected-card-aria-hidden',
                            selector: '#selected-card',
                            state: name
                        })
                    }
                    if (selectedDetails && selectedDetails.getAttribute('aria-hidden') !== 'true') {
                        failures.push({
                            check: 'composition:focus-selected-details-aria-hidden',
                            selector: '#selected-details',
                            state: name,
                            hidden: selectedDetails.hidden,
                            ariaHidden: selectedDetails.getAttribute('aria-hidden'),
                            rect: rectFor('#focus-stage #selected-details') || rectFor('#selected-details')
                        })
                    }
                }

                if (panelSurface === 'idle' && share && searchContainer && overlaps(share, searchContainer, 0)) {
                    failures.push({
                        check: 'composition:idle-share-overlaps-search',
                        selector: '.share-toggle',
                        state: name,
                        rect: share
                    })
                }

                const threadInspectSurface = document.body.dataset.threadInspectSurface || ''
                const threadInspector = visibleChromeSurfaces.find(
                    (surface) => surface.selector === '#focus-thread-inspector'
                )
                if (
                    (panelSurface === 'focus' || panelSurface === 'focus-search') &&
                    threadInspectSurface === 'idle' &&
                    threadInspector
                ) {
                    failures.push({
                        check: 'composition:focus-idle-thread-preview-visible',
                        selector: '#focus-thread-inspector',
                        state: name,
                        rect: threadInspector
                    })
                }

                const diveButton = visibleChromeSurfaces.find((surface) => surface.selector === '.focus-stage-dive-btn')
                if (
                    (panelSurface === 'focus' || panelSurface === 'focus-search') &&
                    threadInspectSurface &&
                    threadInspectSurface !== 'idle' &&
                    diveButton
                ) {
                    failures.push({
                        check: 'composition:preview-step-inside-visible',
                        selector: '.focus-stage-dive-btn',
                        state: name,
                        rect: diveButton
                    })
                }

                if (panelSurface === 'focus-search' && diveButton) {
                    const neighborPills = Array.from(document.querySelectorAll('.focus-stage-neighbor-pill'))
                        .map((pill) => {
                            const rect = pill.getBoundingClientRect()
                            return visible(pill) ? { pill, rect } : null
                        })
                        .filter(Boolean)
                    for (const { rect } of neighborPills) {
                        if (overlaps(diveButton, rect, 0)) {
                            failures.push({
                                check: 'composition:focus-neighbor-cta-overlap',
                                selector: '.focus-stage-neighbor-pill',
                                state: name,
                                rect: {
                                    x: rect.x,
                                    y: rect.y,
                                    width: rect.width,
                                    height: rect.height,
                                    right: rect.right,
                                    bottom: rect.bottom
                                },
                                cta: diveButton
                            })
                        }
                    }
                }

                const nearbyStops = visibleChromeSurfaces.find(
                    (surface) => surface.selector === '.focus-stage-neighbors'
                )
                if (
                    (panelSurface === 'focus' || panelSurface === 'focus-search') &&
                    threadInspectSurface &&
                    threadInspectSurface !== 'idle' &&
                    nearbyStops &&
                    nearbyStops.height < 40
                ) {
                    failures.push({
                        check: 'composition:preview-nearby-stops-squeezed',
                        selector: '.focus-stage-neighbors',
                        state: name,
                        rect: nearbyStops
                    })
                }

                const infoPanel = visibleChromeSurfaces.find((surface) => surface.selector === '#info-panel')
                if (panelSurface === 'semantic-dive' && infoPanel && infoPanel.height > 48) {
                    failures.push({
                        check: 'composition:semantic-dive-info-panel-slab',
                        selector: '#info-panel',
                        state: name,
                        rect: infoPanel
                    })
                }

                const compass = visibleChromeSurfaces.find((surface) => surface.selector === '.journey-compass')
                if (panelSurface === 'semantic-dive' && compass && compass.height > 80) {
                    failures.push({
                        check: 'composition:semantic-dive-compass-too-tall',
                        selector: '.journey-compass',
                        state: name,
                        rect: compass
                    })
                }

                const focusStageCard = visibleChromeSurfaces.find((surface) => surface.selector === '.focus-stage-card')
                if (panelSurface === 'semantic-dive' && focusStageCard && focusStageCard.height > 205) {
                    failures.push({
                        check: 'composition:semantic-dive-bottom-hud-too-tall',
                        selector: '.focus-stage-card',
                        state: name,
                        rect: focusStageCard
                    })
                }

                if (panelSurface === 'semantic-dive') {
                    for (const selector of ['.journey-compass-rail', '.journey-compass-actions']) {
                        const navCluster = visibleChrome(selector)
                        if (navCluster) {
                            failures.push({
                                check: 'composition:semantic-dive-compass-nav-visible',
                                selector,
                                state: name,
                                rect: navCluster
                            })
                        }
                    }
                    const completeNext = document.querySelector('#btn-inside-next')
                    if (
                        completeNext &&
                        visible(completeNext) &&
                        completeNext.disabled &&
                        /trail complete/i.test(completeNext.textContent || '')
                    ) {
                        failures.push({
                            check: 'composition:semantic-dive-disabled-complete-action-visible',
                            selector: '#btn-inside-next',
                            state: name,
                            rect: rectFor('#btn-inside-next')
                        })
                    }
                    // Assert the dead-end behavior contractually: when the route has
                    // nowhere left to go, the next-action button is disabled. Pinning
                    // a specific phrase (e.g. "no nearby stop is available") would
                    // break the test on any future copy polish for a UI-only reason.
                    const completeBtn = document.querySelector('#btn-inside-next')
                    const insideStatusCopy = document.querySelector('#focus-stage-inside-status-copy')
                    if (
                        insideStatusCopy &&
                        /no (more )?(nearby|linked) (stops?|matches?|next) (is )?available/i.test(
                            insideStatusCopy.textContent || ''
                        ) &&
                        completeBtn &&
                        !completeBtn.disabled
                    ) {
                        failures.push({
                            check: 'composition:semantic-dive-dead-end-button-enabled',
                            selector: '#btn-inside-next',
                            state: name,
                            text: insideStatusCopy.textContent
                        })
                    }
                }

                if (panelSurface === 'map-focus-search') {
                    const selectedCard = document.querySelector('#selected-card')
                    if (!selectedCard || selectedCard.dataset.contentOwner !== 'info-panel') {
                        failures.push({
                            check: 'composition:map-focus-search-content-owner',
                            selector: '#selected-card',
                            state: name,
                            owner: selectedCard?.dataset.contentOwner || ''
                        })
                    }
                    const selectedCardStyle = selectedCard ? getComputedStyle(selectedCard) : null
                    if (
                        selectedCardStyle &&
                        selectedCardStyle.display !== 'none' &&
                        Number(selectedCardStyle.opacity || 1) < OPACITY_VISIBLE_THRESHOLD
                    ) {
                        failures.push({
                            check: 'composition:map-summary-invisible-selected-card',
                            selector: '#selected-card',
                            state: name,
                            opacity: selectedCardStyle.opacity
                        })
                    }
                    const selectedMapSummary = document.querySelector('#selected-map-summary')
                    if (visible(selectedMapSummary)) {
                        failures.push({
                            check: 'composition:retired-map-summary-visible',
                            selector: '#selected-map-summary',
                            state: name
                        })
                    }
                }
            }

            const overflowX = document.documentElement.scrollWidth > window.innerWidth
            const overflowY = document.documentElement.scrollHeight > window.innerHeight + 1
            if (overflowX)
                failures.push({
                    check: 'document-overflow-x',
                    scrollWidth: document.documentElement.scrollWidth,
                    viewport: window.innerWidth
                })
            passes.push({ check: overflowY ? 'document-overflow-y' : 'document-no-overflow-y' })

            return {
                name,
                viewport,
                bodyDataset: { ...document.body.dataset },
                pass: passes.length,
                failures
            }
        },
        { selectors, name }
    )
}

await fs.promises.mkdir(outDir, { recursive: true })
const browser = await chromium.launch(launchOptions)
const results = []

try {
    for (const state of statesToRun) {
        const context = await browser.newContext({
            viewport: { width: state.viewport.width, height: state.viewport.height },
            deviceScaleFactor: state.viewport.deviceScaleFactor,
            isMobile: state.viewport.isMobile
        })
        await context.addInitScript(() => {
            window.__PLAYWRIGHT__ = true
        })
        const page = await context.newPage()
        await page.goto(withParams(targetUrl, state.params), { waitUntil: 'domcontentloaded' })
        await waitForReady(page)
        if (state.setup) await state.setup(page)
        const result = await auditState(page, state.name)
        await fs.promises.writeFile(
            path.join(outDir, `${state.name}.json`),
            `${JSON.stringify(result, null, 2)}\n`,
            'utf8'
        )
        results.push(result)
        await page.close()
    }
} finally {
    await browser.close()
}

const failCount = results.reduce((sum, result) => sum + result.failures.length, 0)
const passCount = results.reduce((sum, result) => sum + result.pass, 0)
const summary = {
    outDir,
    url: targetUrl,
    states: results.length,
    pass: passCount,
    fail: failCount,
    results: results.map((result) => ({
        name: result.name,
        pass: result.pass,
        fail: result.failures.length,
        failures: result.failures
    }))
}

await fs.promises.writeFile(path.join(outDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8')
console.log(JSON.stringify(summary, null, 2))
if (failCount > 0) process.exit(1)
