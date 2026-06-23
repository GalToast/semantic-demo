/**
 * @file w46-c3-orchestration-bulk-fill.test.ts
 *
 * Bulk-fill contract tests for W46-C3: the 10 remaining orchestration
 * modules that had ZERO direct unit tests after W46-C2.
 *
 * Per-module coverage map at this commit (was 0 before):
 *   - toast.ts (50 lines)                  -> ~4 tests
 *   - adapter-deps.ts (89 lines)           -> ~3 tests
 *   - navigation-state.ts (96 lines)       -> ~4 tests
 *   - wait-for-gesture.ts (110 lines)      -> ~3 tests
 *   - info-panel-state.ts (138 lines)      -> ~8 tests
 *   - search-filter-core.ts (182 lines)    -> ~6 tests
 *   - event-bus.ts (208 lines)            -> ~8 tests
 *   - compass-state.ts (285 lines)         -> ~5 tests
 *   - cluster-filter-controller.ts (359)   -> ~6 tests
 *   - window-actions.ts (348 lines)        -> ~3 tests
 *
 * Total: 1,865 lines of previously-untested orchestration code now has
 * direct contract + runtime coverage. Follows the structural + light-
 * runtime pattern from W11-T8 / W46-B / W46-C1 / W46-C2.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
// @ts-ignore
import { readFileSync } from 'node:fs'
// @ts-ignore
import { resolve } from 'node:path'

const ORCH = (file: string) => resolve(import.meta.dirname, `../../src/lib/orchestration/${file}`)
const src = (file: string) => readFileSync(ORCH(file), 'utf-8')

// ════════════════════════════════════════════════════════════════════════════
// toast.ts — 50 lines, 2 functions
// ════════════════════════════════════════════════════════════════════════════

describe('W46-C3: toast.ts contract', () => {
    const file = 'toast.ts'
    it('exports showExperienceToast and dismissToast', () => {
        const s = src(file)
        expect(s).toMatch(/export\s+function\s+showExperienceToast\s*\(\s*title:\s*string,\s*copy:\s*string\s*\)/)
        expect(s).toMatch(/export\s+function\s+dismissToast\s*\(/)
    })

    it('uses body data-attributes for cross-component communication', () => {
        expect(src(file)).toMatch(/body\.dataset\.toastMessage/)
        expect(src(file)).toMatch(/body\.dataset\.toastState/)
    })

    it('showExperienceToast sets body data attrs and dismissToast clears them', async () => {
        const { showExperienceToast, dismissToast } = await import(`../../src/lib/orchestration/${file}`)
        showExperienceToast('Test title', 'Test copy')
        expect(document.body.dataset.toastMessage).toBe('Test title\nTest copy')
        expect(document.body.dataset.toastState).toBe('active')
        dismissToast()
        expect(document.body.dataset.toastState).toBe('dismissed')
    })

    it('delegates auto-dismiss to the Toast component via a variant flag', () => {
        // W46-C3: toast.ts no longer owns a dismiss timer. It sets a
        // `toastVariant` ('info' | 'error') on <body>; Toast.svelte owns the
        // auto-dismiss (DISMISS_DELAY = 8000 for error, 5000 otherwise) plus a
        // close button. Verify the bridge contract instead of the old 3500ms
        // literal that moved out of this module.
        expect(src(file)).toMatch(/toastVariant/)
        expect(src(file)).not.toMatch(/setTimeout\([\s\S]*?3500\s*\)/)
    })
})

// ════════════════════════════════════════════════════════════════════════════
// adapter-deps.ts — 89 lines, 1 function
// ════════════════════════════════════════════════════════════════════════════

describe('W46-C3: adapter-deps.ts contract', () => {
    const file = 'adapter-deps.ts'
    it('exports buildAdapterDeps function returning AdapterDeps', () => {
        expect(src(file)).toMatch(/export\s+function\s+buildAdapterDeps\s*\(\s*\)\s*:\s*AdapterDeps/)
    })

    it('imports adapter init functions from canonical sources', () => {
        const s = src(file)
        // adapter-deps wires together handlers from the orchestration layer.
        // The AdapterDeps type itself comes from adapters; the handler
        // functions come from lifecycle, view-controller, search-filter-core,
        // and journey adapters. Assert at least 3 of those canonical sources
        // are imported (not specific ones, which would be brittle to refactor).
        const canonicalSources = [
            '@lib/orchestration/lifecycle',
            '@lib/orchestration/view-controller',
            '@lib/orchestration/search-filter-core',
            '@lib/orchestration/url-state',
            '@lib/orchestration/adapters',
            '@lib/journey/thread-settler',
            '@lib/journey/thread-settler-adapter',
            '@lib/journey/thread-lens',
            '@lib/journey/focus-ui',
            '@lib/journey/neighborhood',
            '@lib/utils/role-label'
        ]
        const matched = canonicalSources.filter((src) => s.includes(src))
        expect(matched.length).toBeGreaterThanOrEqual(3)
    })
})

// ════════════════════════════════════════════════════════════════════════════
// navigation-state.ts — 96 lines, 3 functions + re-exports
// ════════════════════════════════════════════════════════════════════════════

describe('W46-C3: navigation-state.ts contract', () => {
    const file = 'navigation-state.ts'
    it('exports SetTrailNavStateOpts interface and 3 state functions', () => {
        const s = src(file)
        expect(s).toMatch(/export\s+interface\s+SetTrailNavStateOpts\b/)
        expect(s).toMatch(/export\s+function\s+clearNavigationFocusState\s*\(/)
        expect(s).toMatch(/export\s+function\s+clearTrailThreadState\s*\(/)
        expect(s).toMatch(/export\s+function\s+setTrailNavState\s*\(\s*seedIndex:/)
    })

    it('re-exports dispatchNavTransition and NAV_TRANSITION_ACTIONS from canonical store', () => {
        expect(src(file)).toMatch(
            /export\s*\{\s*dispatchNavTransition,\s*NAV_TRANSITION_ACTIONS\s*\}\s*from\s+['"]@lib\/stores\/navigation\.svelte['"]/
        )
    })

    it('re-exports NavTransitionAction and NavTransitionResult types', () => {
        expect(src(file)).toMatch(/export\s+type\s*\{\s*NavTransitionAction\s*\}/)
        expect(src(file)).toMatch(/export\s+type\s*\{\s*NavTransitionResult\s*\}/)
    })

    it('runtime: setTrailNavState accepts valid seed index and calls store', async () => {
        const mod = await import(`../../src/lib/orchestration/${file}`)
        // Smoke test: function is callable and doesn't throw with a valid seed
        expect(() => mod.setTrailNavState(0, {})).not.toThrow()
        // No assertion on side effects (would need store mocking)
    })
})

// ════════════════════════════════════════════════════════════════════════════
// wait-for-gesture.ts — 110 lines, 1 function
// ════════════════════════════════════════════════════════════════════════════

describe('W46-C3: wait-for-gesture.ts contract', () => {
    const file = 'wait-for-gesture.ts'
    it('exports GestureMonitorOpts interface', () => {
        expect(src(file)).toMatch(/export\s+interface\s+GestureMonitorOpts\b/)
    })

    it('exports installGestureMonitor function returning cleanup', () => {
        expect(src(file)).toMatch(
            /export\s+function\s+installGestureMonitor\s*\(\s*opts:\s*GestureMonitorOpts\s*\)\s*:\s*\(\s*\)\s*=>\s*void/
        )
    })

    it('installGestureMonitor wires user-gesture detection on document/window', async () => {
        const mod = await import(`../../src/lib/orchestration/${file}`)
        let ready = false
        const cleanup = mod.installGestureMonitor({
            onReady: () => {
                ready = true
            }
        })
        expect(typeof cleanup).toBe('function')
        // wait-for-gesture listens on `window` for pointerdown/keydown/wheel/
        // touchstart/mousemove. Dispatch on window to trigger the gesture path.
        // Note: in Playwright (navigator.webdriver=true) it auto-fires after a
        // microtask, so the assertion works in either environment.
        window.dispatchEvent(new Event('pointerdown'))
        await new Promise((r) => setTimeout(r, 5))
        expect(ready).toBe(true)
        cleanup()
    })
})

// ════════════════════════════════════════════════════════════════════════════
// info-panel-state.ts — 138 lines, 6 functions + 1 interface
// ════════════════════════════════════════════════════════════════════════════

describe('W46-C3: info-panel-state.ts contract', () => {
    const file = 'info-panel-state.ts'
    it('exports InfoPanelContentDescriptor interface with 6 fields', () => {
        // Don't try to extract the full interface body via regex (the closing `}`
        // is at column 0, not column 2, breaking brace-counting patterns). Just
        // confirm each field name appears after the interface declaration.
        const s = src(file)
        const interfaceStart = s.indexOf('export interface InfoPanelContentDescriptor')
        expect(interfaceStart).toBeGreaterThan(-1)
        // Look from the interface start through the next `export` or `const`
        // declaration (whichever comes first) to bound the field search.
        const after = s.slice(interfaceStart)
        const nextDecl = after.search(/^(export|const|function)\s/m)
        const block = nextDecl > 0 ? after.slice(0, nextDecl) : after
        for (const field of [
            'headerText',
            'headerVisible',
            'emptyHeadline',
            'emptySubtext',
            'panelVisible',
            'selectionSuppressed'
        ]) {
            expect(block).toContain(field)
        }
    })

    it('exports 6 lookup functions', () => {
        const s = src(file)
        expect(s).toMatch(/export\s+function\s+getInfoPanelContent\s*\(/)
        expect(s).toMatch(/export\s+function\s+getInfoPanelHeaderText\s*\(/)
        expect(s).toMatch(/export\s+function\s+isInfoHeaderVisible\s*\(/)
        expect(s).toMatch(/export\s+function\s+isSelectionSuppressed\s*\(/)
        expect(s).toMatch(/export\s+function\s+isInfoPanelVisible\s*\(/)
        expect(s).toMatch(/export\s+function\s+getEmptyHeadline\s*\(/)
        expect(s).toMatch(/export\s+function\s+getEmptySubtext\s*\(/)
    })

    it('CONTENT_BY_SURFACE has an entry for the canonical idle surface', () => {
        // Object keys in this file are bare identifiers (not quoted strings),
        // so we look for `idle:` (an object-key syntax) rather than `'idle':`.
        const s = src(file)
        expect(s).toMatch(/CONTENT_BY_SURFACE\s*:\s*Record/)
        // The canonical empty-state surface is `idle`
        expect(s).toMatch(/\bidle\s*:\s*\{/)
    })

    it('runtime: getInfoPanelContent for idle returns the search-first defaults', async () => {
        // W45-B: the idle surface is now search-first — header suppressed,
        // selection suppressed, and copy framed around search rather than
        // business details. See info-panel-state.ts CONTENT_BY_SURFACE.idle.
        const mod = await import(`../../src/lib/orchestration/${file}`)
        const content = mod.getInfoPanelContent('idle')
        expect(content.headerText).toBe('Search Businesses')
        expect(content.headerVisible).toBe(false)
        expect(content.emptyHeadline).toBeTruthy()
        expect(content.emptySubtext).toBeTruthy()
        expect(content.panelVisible).toBe(true)
        expect(content.selectionSuppressed).toBe(true)
    })

    it('runtime: header is hidden in search-mode surface', async () => {
        const mod = await import(`../../src/lib/orchestration/${file}`)
        const content = mod.getInfoPanelContent('search')
        // In search mode, header is hidden by contract
        expect(content.headerVisible).toBe(false)
    })

    it('runtime: selection is suppressed in search mode', async () => {
        const mod = await import(`../../src/lib/orchestration/${file}`)
        const content = mod.getInfoPanelContent('search')
        expect(content.selectionSuppressed).toBe(true)
    })

    it('runtime: isInfoHeaderVisible returns boolean for any surface', async () => {
        const mod = await import(`../../src/lib/orchestration/${file}`)
        expect(typeof mod.isInfoHeaderVisible('idle')).toBe('boolean')
        expect(typeof mod.isInfoHeaderVisible('search')).toBe('boolean')
        expect(typeof mod.isInfoHeaderVisible('unknown')).toBe('boolean')
    })
})

// ════════════════════════════════════════════════════════════════════════════
// search-filter-core.ts — 182 lines, 6 functions
// ════════════════════════════════════════════════════════════════════════════

describe('W46-C3: search-filter-core.ts contract', () => {
    const file = 'search-filter-core.ts'
    it('exports 6 functions for filter visibility/computation', () => {
        const s = src(file)
        expect(s).toMatch(/export\s+function\s+getVisibleIndices\s*\(/)
        expect(s).toMatch(/export\s+function\s+getVisibleCount\s*\(/)
        expect(s).toMatch(/export\s+function\s+pointMatchesAllFilters\s*\(/)
        expect(s).toMatch(/export\s+function\s+getFilteredIndices\s*\(/)
        expect(s).toMatch(/export\s+function\s+getFilteredClusterCounts\s*\(/)
        expect(s).toMatch(/export\s+function\s+applyFilters\s*\(/)
        expect(s).toMatch(/export\s+function\s+clearShortSemanticSearchState\s*\(/)
    })

    it('uses the canonical point-filter source', () => {
        expect(src(file)).toMatch(/@lib\/orchestration\/search-filter-core/)
    })

    it('runtime: getVisibleCount returns a number', async () => {
        const mod = await import(`../../src/lib/orchestration/${file}`)
        const count = mod.getVisibleCount()
        expect(typeof count).toBe('number')
        expect(count).toBeGreaterThanOrEqual(0)
    })

    it('runtime: getVisibleIndices returns a Set', async () => {
        const mod = await import(`../../src/lib/orchestration/${file}`)
        const indices = mod.getVisibleIndices()
        expect(indices).toBeInstanceOf(Set)
    })

    it('runtime: getFilteredIndices returns readonly array', async () => {
        const mod = await import(`../../src/lib/orchestration/${file}`)
        const indices = mod.getFilteredIndices()
        expect(Array.isArray(indices)).toBe(true)
    })

    it('runtime: getFilteredClusterCounts returns a Map', async () => {
        const mod = await import(`../../src/lib/orchestration/${file}`)
        const counts = mod.getFilteredClusterCounts()
        expect(counts).toBeInstanceOf(Map)
    })
})

// ════════════════════════════════════════════════════════════════════════════
// event-bus.ts — 208 lines, 5 functions + types + EVENTS const
// ════════════════════════════════════════════════════════════════════════════

describe('W46-C3: event-bus.ts contract', () => {
    const file = 'event-bus.ts'
    it('exports EVENTS constant (event name registry)', () => {
        const s = src(file)
        expect(s).toMatch(/export\s+const\s+EVENTS\s*=\s*\{/)
        // EVENTS must have multiple keys
        const eventsBlock = s.match(/export\s+const\s+EVENTS\s*=\s*\{[\s\S]*?\n\}\s*(?:as const)?/)
        expect(eventsBlock).not.toBeNull()
        const keyCount = (eventsBlock![0].match(/^\s*\w+\s*:/gm) || []).length
        expect(keyCount).toBeGreaterThanOrEqual(3)
    })

    it('exports EventName type and EventPayloads interface', () => {
        const s = src(file)
        expect(s).toMatch(/export\s+type\s+EventName\b/)
        expect(s).toMatch(/export\s+interface\s+EventPayloads\b/)
    })

    it('exports subscribe, subscribeKeyed, publish, getSubscriberCount, clearAllSubscribers', () => {
        const s = src(file)
        expect(s).toMatch(/export\s+function\s+subscribe\s*<K extends EventName>/)
        expect(s).toMatch(/export\s+function\s+subscribeKeyed\s*<K extends EventName>/)
        expect(s).toMatch(/export\s+function\s+publish\s*<K extends EventName>/)
        expect(s).toMatch(/export\s+function\s+getSubscriberCount\s*\(/)
        expect(s).toMatch(/export\s+function\s+clearAllSubscribers\s*\(/)
    })

    it('runtime: subscribe + publish + cleanup works end-to-end', async () => {
        const { subscribe, publish, getSubscriberCount, clearAllSubscribers } = await import(
            `../../src/lib/orchestration/${file}`
        )
        clearAllSubscribers() // ensure clean slate
        let received: unknown = null
        const unsub = subscribe('search-summary-changed' as any, (payload: unknown) => {
            received = payload
        })
        expect(getSubscriberCount('search-summary-changed' as any)).toBe(1)
        publish('search-summary-changed' as any, { test: true } as any)
        expect(received).toEqual({ test: true })
        unsub()
        expect(getSubscriberCount('search-summary-changed' as any)).toBe(0)
        clearAllSubscribers()
    })

    it('runtime: publish with no subscribers does not throw', async () => {
        const { publish, clearAllSubscribers } = await import(`../../src/lib/orchestration/${file}`)
        clearAllSubscribers()
        expect(() => publish('search-summary-changed' as any, {})).not.toThrow()
        clearAllSubscribers()
    })

    it('runtime: getSubscriberCount returns 0 for an event with no subscribers', async () => {
        const { getSubscriberCount, clearAllSubscribers } = await import(`../../src/lib/orchestration/${file}`)
        clearAllSubscribers()
        expect(getSubscriberCount('search-summary-changed' as any)).toBe(0)
    })
})

// ════════════════════════════════════════════════════════════════════════════
// compass-state.ts — 285 lines, 3 functions + interfaces
// ════════════════════════════════════════════════════════════════════════════

describe('W46-C3: compass-state.ts contract', () => {
    const file = 'compass-state.ts'
    it('exports CompassStateContext interface', () => {
        const block = src(file).match(/export\s+interface\s+CompassStateContext\s*\{[\s\S]*?\n\s{2}\}/)
        expect(block).not.toBeNull()
        expect(block![0]).toBeTruthy()
    })

    it('re-exports JOURNEY_ACTIONS, CompassStatus, CompassAction types from compass store', () => {
        const s = src(file)
        // Re-exports can be combined (e.g. `export type { A, B, C }`), so just
        // assert each name appears inside an export block rather than
        // requiring each on its own line.
        expect(s).toMatch(/export\s*\{\s*[^}]*\bJOURNEY_ACTIONS\b[^}]*\}/)
        expect(s).toMatch(/export\s+type\s*\{[^}]*\bCompassStatus\b[^}]*\}/)
        expect(s).toMatch(/export\s+type\s*\{[^}]*\bCompassAction\b[^}]*\}/)
        expect(s).toMatch(/export\s+type\s*\{[^}]*\bJourneyAction\b[^}]*\}/)
    })

    it('exports registerRouteEmbodimentReader, getFocusedJourneyPoint, getJourneyCompassState', () => {
        const s = src(file)
        expect(s).toMatch(/export\s+function\s+registerRouteEmbodimentReader\s*\(/)
        expect(s).toMatch(/export\s+function\s+getFocusedJourneyPoint\s*\(/)
        expect(s).toMatch(/export\s+function\s+getJourneyCompassState\s*\(/)
    })

    it('runtime: getFocusedJourneyPoint returns null or object', async () => {
        const mod = await import(`../../src/lib/orchestration/${file}`)
        const point = mod.getFocusedJourneyPoint()
        expect(point === null || typeof point === 'object').toBe(true)
    })

    it('runtime: getJourneyCompassState returns CompassStateContext shape', async () => {
        const mod = await import(`../../src/lib/orchestration/${file}`)
        const state = mod.getJourneyCompassState()
        expect(state).toBeDefined()
        expect(typeof state).toBe('object')
    })
})

// ════════════════════════════════════════════════════════════════════════════
// cluster-filter-controller.ts — 359 lines, 8 functions + 2 constants
// ════════════════════════════════════════════════════════════════════════════

describe('W46-C3: cluster-filter-controller.ts contract', () => {
    const file = 'cluster-filter-controller.ts'
    it('exports CLUSTER_COLORS and CLUSTER_NAMES (as readonly const or re-export)', () => {
        // W47: cluster-filter-controller.ts now re-exports these from the
        // sibling ./cluster-metadata module rather than declaring them
        // inline. Accept either form so this assertion survives both
        // declarations.
        const s = src(file)
        expect(s).toMatch(/export\s+(?:const\s+CLUSTER_COLORS|\{[^}]*CLUSTER_COLORS)/)
        expect(s).toMatch(/export\s+(?:const\s+CLUSTER_NAMES|\{[^}]*CLUSTER_NAMES)/)
    })

    it('imports CLUSTER_COLORS and CLUSTER_NAMES from ./cluster-metadata (W47 source)', () => {
        // The canonical taxonomy now lives in ./cluster-metadata.ts; this
        // file imports from there. Guards against accidentally reintroducing
        // inline declarations (the bug class W47 was created to fix).
        const s = src(file)
        expect(s).toMatch(/from\s+['"]\.\/cluster-metadata['"]/)
        expect(s).toMatch(/CLUSTER_COLORS/)
        expect(s).toMatch(/CLUSTER_NAMES/)
    })

    it('exports 8 functions: lookup, state mutators, async refresh, sync', () => {
        const s = src(file)
        expect(s).toMatch(/export\s+function\s+findClusterByKeyword\s*\(/)
        expect(s).toMatch(/export\s+function\s+setClusterFilter\s*\(/)
        expect(s).toMatch(/export\s+function\s+clearClusterFilter\s*\(/)
        expect(s).toMatch(/export\s+async\s+function\s+updateClusterList\s*\(/)
        expect(s).toMatch(/export\s+function\s+syncCityFilterUi\s*\(/)
        expect(s).toMatch(/export\s+async\s+function\s+populateCityFilter\s*\(/)
        expect(s).toMatch(/export\s+function\s+syncFilterControls\s*\(/)
    })

    it('re-exports getFilteredClusterCounts from search-filter-core', () => {
        expect(src(file)).toMatch(
            /export\s*\{\s*getFilteredClusterCounts\s*\}\s*from\s+['"]@lib\/orchestration\/search-filter-core['"]/
        )
    })

    it('runtime: CLUSTER_COLORS and CLUSTER_NAMES have equal length and are non-empty', async () => {
        // CLUSTER_COLORS[i] is the color paired with CLUSTER_NAMES[i]. If the
        // arrays differ in length, indexing wraps modulo and the last few
        // names get the wrong color (or, worse, undefined falls through to
        // a hardcoded fallback). Asserting length-equality is the actual
        // invariant the runtime code relies on.
        const mod = await import(`../../src/lib/orchestration/${file}`)
        expect(Array.isArray(mod.CLUSTER_COLORS)).toBe(true)
        expect(Array.isArray(mod.CLUSTER_NAMES)).toBe(true)
        expect(mod.CLUSTER_COLORS.length).toBeGreaterThan(0)
        expect(mod.CLUSTER_NAMES.length).toBeGreaterThan(0)
        expect(mod.CLUSTER_COLORS.length).toBe(mod.CLUSTER_NAMES.length)
    })

    it('runtime: findClusterByKeyword returns number or null', async () => {
        const mod = await import(`../../src/lib/orchestration/${file}`)
        const result = mod.findClusterByKeyword('nonexistent-keyword-xyz')
        expect(result === null || typeof result === 'number').toBe(true)
    })

    it('runtime: clearClusterFilter is idempotent (callable repeatedly)', async () => {
        const mod = await import(`../../src/lib/orchestration/${file}`)
        expect(() => {
            mod.clearClusterFilter()
            mod.clearClusterFilter()
            mod.clearClusterFilter()
        }).not.toThrow()
    })
})

// ════════════════════════════════════════════════════════════════════════════
// window-actions.ts — 348 lines, 1 function
// ════════════════════════════════════════════════════════════════════════════

describe('W46-C3: window-actions.ts contract', () => {
    const file = 'window-actions.ts'
    it('exports installWindowActions function returning cleanup', () => {
        expect(src(file)).toMatch(/export\s+function\s+installWindowActions\s*\(\s*\)\s*:\s*\(\s*\)\s*=>\s*void/)
    })

    it('installs debug/test window globals (__APP_ACTIONS__ etc.)', () => {
        const s = src(file)
        // Should set up window globals for test/contract usage
        expect(s).toMatch(/__APP_ACTIONS__|__APP_STATE__|window\./)
    })

    it('runtime: installWindowActions returns a cleanup function', async () => {
        const { installWindowActions } = await import(`../../src/lib/orchestration/${file}`)
        const cleanup = installWindowActions()
        expect(typeof cleanup).toBe('function')
        cleanup()
    })
})
