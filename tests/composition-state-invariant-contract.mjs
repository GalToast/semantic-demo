/**
 * composition-state-invariant-contract.mjs
 *
 * Focused contract around refreshCompositionState / derivePanelSurface invariants:
 *   - body dataset ownership is unambiguous across all state tuples
 *   - contradictory state tuples are rejected / detected
 *
 * Specifically validates:
 *   1. semanticDive='active' requires trailDepth>=2 AND hasFocus (selectedPoint |
 *      focusedNode | focusedIndex). A contradictory tuple is logged and asserted.
 *   2. reset (resetStateBeforeUrlRestore) must clear the focus tuple and return
 *      dataset to idle values — no stale focus ownership leaking through.
 *   3. map view forces semanticDive='inactive' regardless of trailDepth or dive mode.
 *   4. search-with-focus resolves to panelSurface='focus-search' with one owner;
 *      no two competing owners (e.g., 'search' + 'focus' simultaneously).
 *   5. derivePanelSurface returns exactly one panelSurface value per state tuple.
 *
 * This contract does NOT re-test the transition table (covered by
 * state-transition-contract.mjs). It focuses on the INVARIANTS — the rules that
 * reject or detect contradictory state.
 *
 * Run (canonical — @lib import needs the loader):
 *   node --experimental-transform-types --import ./tests/helpers/svelte-rune-shim.mjs \n *        --loader ./tests/helpers/ts-resolve-loader.mjs tests/composition-state-invariant-contract.mjs
 *   (or: node tests/run-all-contracts.js --single=composition-state-invariant-contract.mjs)
 * Gate: node tests/run-all-contracts.js --validate
 */

let _rafNow = 0
let _rafQueue = []

class FakeClassList {
    constructor() {
        this._items = new Set()
    }
    add(...n) {
        n.forEach((x) => this._items.add(x))
    }
    remove(...n) {
        n.forEach((x) => this._items.delete(x))
    }
    contains(n) {
        return this._items.has(n)
    }
    toggle(n, f) {
        const on = f !== undefined ? f : !this._items.has(n)
        on ? this._items.add(n) : this._items.delete(n)
        return on
    }
}

class FakeElement {
    constructor(tag = 'div') {
        this.tagName = tag.toUpperCase()
        this.classList = new FakeClassList()
        this.dataset = {}
        this.style = {}
        this.children = []
        this._innerHTML = ''
        this._text = ''
        this._attr = new Map()
        this.hidden = false
        this.disabled = false
        this.inert = false
        this.title = ''
    }
    get innerHTML() {
        return this._innerHTML
    }
    set innerHTML(v) {
        this._innerHTML = String(v)
    }
    get textContent() {
        return this._text
    }
    set textContent(v) {
        this._text = String(v)
    }
    appendChild(c) {
        this.children.push(c)
        return c
    }
    setAttribute(k, v) {
        this._attr.set(String(k), String(v))
    }
    getAttribute(k) {
        return this._attr.get(String(k)) ?? null
    }
    removeAttribute(k) {
        this._attr.delete(String(k))
        if (k === 'title') this.title = ''
    }
    querySelector() {
        return null
    }
}

// ── Global shim ────────────────────────────────────────────────────────────────

const fakeBody = new FakeElement('body')
const elementsById = new Map()

globalThis.document = {
    body: fakeBody,
    getElementById: (id) => elementsById.get(id) || null,
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: (tag) => new FakeElement(tag)
}

globalThis.window = {
    location: { search: '' },
    history: { replaceState: () => {} },
    setTimeout: () => 0,
    clearTimeout: () => {},
    requestAnimationFrame: (fn) => {
        _rafQueue.push(fn)
        return ++_rafNow
    },
    cancelAnimationFrame: () => {},
    matchMedia: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
    syncRouteDirectorState: () => {},
    syncSemanticDiveUi: () => {},
    updateJourneyCompass: () => {},
    updateFocusNeighborRail: () => {},
    refreshMapMarkers: () => {},
    refreshMapRouteEmbodiment: () => {},
    refreshRouteTraceOverlay: () => {},
    clearMobileRouteFieldPeek: () => {},
    updateLegendGuideState: () => {},
    updateSelectedCardHeading: () => {},
    getRouteEmbodimentIndices: () => [],
    getRouteLayerOrigin: () => 'galaxy',
    setSearchPanelState: () => {},
    hideTooltip: () => {},
    clearSearchPreviewHoverTimer: () => {},
    clearSearchPreviewOverlay: () => {},
    clearSearchGlow: () => {},
    updateSearchTrailCue: () => {},
    syncFocusStage: () => {},
    applyFilters: () => {},
    updateExplorationUi: () => {},
    updateSearchStatusMessage: () => {},
    resetNodePositions: () => {},
    updateSelectedBusiness: () => {}
}

globalThis.performance = {
    now: () => {
        _rafNow += 16
        return _rafNow
    }
}

// ── Assert helpers ────────────────────────────────────────────────────────────

function assert(cond, msg) {
    if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`)
}

function assertEq(actual, expected, label) {
    if (actual !== expected) throw new Error(`ASSERTION FAILED: ${label} — got '${actual}', want '${expected}'`)
}

// ── Import real modules ───────────────────────────────────────────────────────

import './helpers/svelte-rune-shim.mjs'

const { state, withStateMutation } = await import('./helpers/canonical-state.mjs')
const { updateNavState } = await import('../src/lib/stores/navigation.svelte')
const { searchStore, setSearchSummary } = await import('../src/lib/stores/search.svelte')
const { focusStore } = await import('../src/lib/stores/focus.svelte')
const { journeyStore, setTrailDepth: setJourneyTrailDepth } = await import('../src/lib/stores/journey.svelte')

updateNavState // Mark as read
searchStore // Mark as read
focusStore // Mark as read
journeyStore // Mark as read

let refreshCompositionState
let resetStateBeforeUrlRestore
try {
    const lc = await import('../src/lib/stores/lifecycle.ts')
    refreshCompositionState = lc.refreshCompositionState ?? undefined
    resetStateBeforeUrlRestore = lc.resetStateBeforeUrlRestore ?? undefined
} catch (e) {
    void e
}
if (typeof refreshCompositionState !== 'function' || typeof resetStateBeforeUrlRestore !== 'function') {
    try {
        const lc2 = await import('../src/lib/orchestration/lifecycle.ts')
        if (typeof refreshCompositionState !== 'function') refreshCompositionState = lc2.refreshCompositionState
        if (typeof resetStateBeforeUrlRestore !== 'function')
            resetStateBeforeUrlRestore = lc2.resetStateBeforeUrlRestore
    } catch (e) {
        void e
    }
}
if (typeof refreshCompositionState !== 'function') {
    refreshCompositionState = globalThis.window?.refreshCompositionState
}
if (typeof resetStateBeforeUrlRestore !== 'function') {
    resetStateBeforeUrlRestore = globalThis.window?.resetStateBeforeUrlRestore
}

assert(typeof refreshCompositionState === 'function', 'refreshCompositionState is callable')
assert(typeof resetStateBeforeUrlRestore === 'function', 'resetStateBeforeUrlRestore is callable')

// ── Helpers ───────────────────────────────────────────────────────────────────

function ds(k) {
    return fakeBody.dataset[k]
}
function syncStoresFromState() {
    const searchInput = elementsById.get('search-input')
    const query = String(state.searchState.currentSearchSummary?.query ?? searchInput?.value ?? '')
    const hasSearchIntent = !!state.searchState.currentSearchSummary || query.trim().length >= 2
    const hasFocus =
        state.navState.focusedIndex != null || state.focusedNode != null || state.focusState.selectedPoint != null
    const activeView = state.currentView || 'galaxy'
    const semanticDiveActive = activeView === 'galaxy' && hasFocus && state.semanticDiveMode === true

    const mode = hasFocus ? 'focus' : hasSearchIntent ? 'search' : 'overview'
    const surface = (() => {
        if (activeView === 'map') {
            if (hasFocus && hasSearchIntent) return 'map-focus-search'
            if (hasFocus) return 'focus'
            if (hasSearchIntent) return 'search'
            return 'idle'
        }
        if (hasFocus && hasSearchIntent) return 'focus-search'
        if (semanticDiveActive) return 'inside'
        if (hasFocus) return 'focus'
        if (hasSearchIntent) return 'search'
        return 'idle'
    })()

    updateNavState({
        currentView: activeView,
        focusedIndex: hasFocus ? (state.navState.focusedIndex ?? state.focusedNode) : null,
        mode,
        surface,
        trailDepth: state.trailDepth
    })
    setJourneyTrailDepth(state.trailDepth)

    if (state.searchState.currentSearchSummary) {
        setSearchSummary({ query, ...state.searchState.currentSearchSummary })
    } else {
        setSearchSummary(null)
    }
}
function commit() {
    syncStoresFromState()
    refreshCompositionState()
}
function setCurrentViewForTest(view) {
    withStateMutation(() => {
        state.currentView = view
    })
    updateNavState({ currentView: view })
}

// Snapshot the dataset fields that refreshCompositionState writes
const COMPOSITION_FIELDS = [
    'activeView',
    'trailState',
    'graphContext',
    'mapContext',
    'semanticDive',
    'panelSurface',
    'panelSurfaceDetail'
]

function snapshotDataset() {
    return Object.fromEntries(COMPOSITION_FIELDS.map((f) => [f, fakeBody.dataset[f]]))
}

function resetState() {
    withStateMutation(() => {
        state.currentView = 'galaxy'
        state.focusedNode = null
        state.focusState.selectedPoint = null
        state.navState.focusedIndex = null
        state.navState.mode = 'overview'
        state.navState.trailCursor = -1
        state.navState.trailSeedIndex = null
        state.navState.trailNeighborIndices = []
        state.navState.walkHistoryIndices = []
        state.navState.threadCandidates = []
        state.trailDepth = 0
        state.semanticDiveMode = false
        state.searchState.currentSearchSummary = null
        state.activeFilters = { status: 'all', city: 'all', website: false, email: false, geocoded: false }
    })
    updateNavState({
        currentView: 'galaxy',
        focusedIndex: null,
        mode: 'overview',
        trailCursor: -1,
        trailSeedIndex: null,
        trailNeighborIndices: [],
        walkHistoryIndices: [],
        threadCandidates: [],
        trailDepth: 0
    })
    focusStore.update((s) => {
        const next = { ...s }
        next.selectedBusiness = null
        next.semanticDiveMode = false
        return next
    })
    setSearchSummary(null)
    state.trailIndices.clear()
    fakeBody.dataset = {}
    _rafQueue = []
    elementsById.clear()
}

// Convenience: set hasFocus via selectedPoint (most common real-world path)
function setFocusViaSelectedPoint(index) {
    const p = state.points?.[index] ?? { lead_id: `fake-${index}`, name: `Biz ${index}`, cluster: 1 }
    state.focusState.selectedPoint = p
    state.focusedNode = index
    state.navState.focusedIndex = index
    updateNavState({ focusedIndex: index })
    focusStore.update((s) => {
        const next = { ...s }
        next.selectedBusiness = p
        return next
    })
}

function setTrailDepthOnAll(depth) {
    state.trailDepth = depth
    updateNavState({ trailDepth: depth })
    journeyStore.update((s) => {
        const next = { ...s }
        next.depth = depth
        next.trailDepth = depth
        return next
    })
    focusStore.update((s) => {
        const next = { ...s }
        next.semanticDiveMode = depth === 2
        return next
    })
}

// Convenience: set hasSearchIntent
function setSearchIntent(query = 'coffee') {
    const sum = { query, visibleMatches: 5 }
    state.searchState.currentSearchSummary = sum
    setSearchSummary(sum)
    const input = new FakeElement('input')
    input.value = query
    elementsById.set('search-input', input)
}

// ── INVARIANT 1 ────────────────────────────────────────────────────────────────
// semanticDive='active' requires trailDepth>=2 AND hasFocus (at least one of
// selectedPoint, focusedNode, focusedIndex is set).
//
// Contradictions to detect & reject:
//   A. semanticDive='active' but trailDepth < 2
//   B. semanticDive='active' but hasFocus is false (all focus fields null)

console.log('\n=== Composition State Invariant Contract ===\n')
console.log('[INVARIANT 1] semanticDive active requires trailDepth>=2 and hasFocus')

// ── 1A: Valid semantic-dive state (trailDepth=2 + hasFocus) ───────────────────
console.log('[TEST] 1A — valid semantic-dive (trailDepth=2, hasFocus)')
resetState()
setFocusViaSelectedPoint(4)
setTrailDepthOnAll(2)
// semanticDiveMode getter returns true when trailDepth=2
commit()
assertEq(ds('semanticDive'), 'active', '1A: semanticDive is active')
assertEq(ds('panelSurface'), 'semantic-dive', '1A: panelSurface is semantic-dive')
assertEq(ds('graphContext'), 'focus', '1A: graphContext is focus (semantic-dive suppresses focus-search)')
console.log('  PASS: valid semantic-dive state accepted\n')

// ── 1B: Contradiction — semanticDive='active' but trailDepth < 2 ───────────────
// This is impossible in the real code path (semanticDive derives from trailDepth
// and hasFocus), but we force the contradiction via fakeBody.dataset.semanticDive
// to prove the invariant is understood.
// Note: refreshCompositionState computes semanticDive from state.semanticDiveMode
// and hasFocus, so it cannot produce this contradiction on its own. This test
// documents that if a caller manually sets body.dataset.semanticDive='active'
// while trailDepth<2, it is a bug.
console.log('[TEST] 1B — contradiction: semanticDive active but trailDepth<2')
resetState()
setFocusViaSelectedPoint(4)
setTrailDepthOnAll(1) // < 2 means semanticDiveMode=false
assertEq(state.semanticDiveMode, false, '1B: precondition — semanticDiveMode must be false when trailDepth<2')
commit()
assertEq(ds('semanticDive'), 'inactive', '1B: semanticDive must be inactive when trailDepth<2 (computed from state)')
console.log('  PASS: code path prevents trailDepth<2 + semanticDive active\n')

// ── 1C: Contradiction — semanticDive='active' but no focus ────────────────────
// refreshCompositionState computes: semanticDive = semanticDiveMode && hasFocus ? 'active' : 'inactive'
// So hasFocus=false always yields semanticDive='inactive'. This is not a runtime
// contradiction but a source-level invariant: any path that sets semanticDive='active'
// must also set hasFocus=true.
console.log('[TEST] 1C — contradiction: semanticDiveMode=true but hasFocus=false')
resetState()
// No focus set — all focus fields null
state.trailDepth = 2 // semanticDiveMode=true
assertEq(state.semanticDiveMode, true, '1C: precondition — semanticDiveMode=true when trailDepth=2')
commit()
assertEq(ds('semanticDive'), 'inactive', '1C: semanticDive must be inactive when hasFocus=false')
assertEq(ds('panelSurface'), 'idle', '1C: panelSurface must be idle when no focus')
console.log('  PASS: hasFocus=false forces semanticDive=inactive and panelSurface=idle\n')

// ── 1D: Mixed — semanticDiveMode=true, trailDepth=2, but only focusedNode set
// (no selectedPoint). This is valid — any one focus field is sufficient.
console.log('[TEST] 1D — valid: semanticDiveMode + focusedNode only (no selectedPoint)')
resetState()
state.focusedNode = 7
state.focusState.selectedPoint = null
// Update nav store and trail depth
updateNavState({ focusedIndex: 7 })
setTrailDepthOnAll(2)
commit()
assertEq(ds('semanticDive'), 'active', '1D: semanticDive active with only focusedNode set')
assertEq(ds('panelSurface'), 'semantic-dive', '1D: panelSurface is semantic-dive')
console.log('  PASS: focusedNode alone is sufficient for semantic-dive\n')

// ── INVARIANT 2 ────────────────────────────────────────────────────────────────
// resetStateBeforeUrlRestore must clear the entire focus tuple and leave dataset
// in idle state. No stale focus ownership may leak through.

console.log('[INVARIANT 2] reset must clear focus tuple and return dataset to idle')

// ── 2A: Reset from deep state (semantic-dive) ─────────────────────────────────
console.log('[TEST] 2A — reset from deep state returns to idle')
resetState()
setCurrentViewForTest('galaxy')
setFocusViaSelectedPoint(4)
setTrailDepthOnAll(2)
setSearchIntent()
commit()
assertEq(ds('panelSurface'), 'semantic-dive', '2A: pre-condition — panelSurface is semantic-dive before reset')
assertEq(ds('semanticDive'), 'active', '2A: pre-condition — semanticDive is active before reset')

// Perform the reset
resetStateBeforeUrlRestore({ clearSearchInput: true })
commit()

assertEq(state.focusedNode, null, '2A: focusedNode is null after reset')
assertEq(state.focusState.selectedPoint, null, '2A: selectedPoint is null after reset')
assertEq(state.navState.focusedIndex, null, '2A: focusedIndex is null after reset')
assertEq(state.trailDepth, 0, '2A: trailDepth is 0 after reset')
assertEq(state.semanticDiveMode, false, '2A: semanticDiveMode is false after reset')
assertEq(state.searchState.currentSearchSummary, null, '2A: currentSearchSummary is null after reset')
assertEq(ds('panelSurface'), 'idle', '2A: panelSurface is idle after reset')
assertEq(ds('semanticDive'), 'inactive', '2A: semanticDive is inactive after reset')
assertEq(ds('graphContext'), 'idle', '2A: graphContext is idle after reset')
assertEq(ds('trailState'), 'inactive', '2A: trailState is inactive after reset')
console.log('  PASS: deep state reset clears focus tuple and returns idle\n')

// ── 2B: Reset from focus-only state (no semantic-dive) ─────────────────────────
console.log('[TEST] 2B — reset from focus-only state returns to idle')
resetState()
setFocusViaSelectedPoint(2)
setSearchIntent()
commit()
assertEq(ds('panelSurface'), 'focus-search', '2B: pre — panelSurface is focus-search before reset')

resetStateBeforeUrlRestore({ clearSearchInput: true })
commit()

assertEq(state.focusedNode, null, '2B: focusedNode is null after reset')
assertEq(state.focusState.selectedPoint, null, '2B: selectedPoint is null after reset')
assertEq(ds('panelSurface'), 'idle', '2B: panelSurface is idle after reset')
assertEq(ds('graphContext'), 'idle', '2B: graphContext is idle after reset')
console.log('  PASS: focus-only reset clears focus tuple and returns idle\n')

// ── 2C: Reset must not leave stale mapContext on galaxy view ───────────────────
console.log('[TEST] 2C — reset must not leave stale mapContext')
resetState()
setCurrentViewForTest('map') // simulate prior map state
setFocusViaSelectedPoint(3)
setSearchIntent()
commit()
assertEq(ds('activeView'), 'map', '2C: pre — activeView is map')

// Reset back to galaxy
resetStateBeforeUrlRestore({ clearSearchInput: true })
setCurrentViewForTest('galaxy') // manually restore galaxy (resetStateBeforeUrlRestore doesn't change currentView)
commit()

assertEq(ds('activeView'), 'galaxy', '2C: activeView restored to galaxy')
assertEq(ds('mapContext'), 'idle', '2C: mapContext is idle on galaxy view')
console.log('  PASS: reset does not leave stale mapContext on galaxy view\n')

// ── INVARIANT 3 ────────────────────────────────────────────────────────────────
// map view forces semanticDive='inactive' — even if trailDepth=2 and
// semanticDiveMode=true, entering map view overrides semanticDive to inactive.

console.log('[INVARIANT 3] map view forces semanticDive=inactive regardless of trailDepth')

// ── 3A: map + semanticDiveMode (contradiction should be neutralized) ───────────
console.log('[TEST] 3A — map view overrides semanticDive to inactive')
resetState()
setCurrentViewForTest('map')
setFocusViaSelectedPoint(4)
state.trailDepth = 2 // would set semanticDiveMode=true
setSearchIntent()
commit()

assertEq(ds('activeView'), 'map', '3A: activeView is map')
assertEq(ds('semanticDive'), 'inactive', '3A: semanticDive is forced inactive in map view')
assertEq(ds('mapContext'), 'focus-search', '3A: mapContext is focus-search')
assertEq(ds('panelSurface'), 'map-focus-search', '3A: panelSurface is map-focus-search')
console.log('  PASS: map view overrides semantic-dive invariants\n')

// ── 3B: map + focusedNode only (no search) ───────────────────────────────────
console.log('[TEST] 3B — map view with focus but no search')
resetState()
setCurrentViewForTest('map')
setFocusViaSelectedPoint(5)
state.searchState.currentSearchSummary = null
setSearchSummary(null)
elementsById.delete('search-input')
commit()

assertEq(ds('semanticDive'), 'inactive', '3B: semanticDive is inactive in map view')
assertEq(ds('mapContext'), 'focus', '3B: mapContext is focus (no search intent)')
assertEq(ds('panelSurface'), 'map-focus', '3B: panelSurface is map-focus')
console.log('  PASS: map view with focus-only works correctly\n')

// ── 3C: map view with semanticDiveMode=true but currentView=map ───────────────
// This is a real-world contradiction that users could trigger: they are in
// semantic-dive (trailDepth=2) and click the Map button. The code must
// force semanticDive='inactive' without throwing.
console.log('[TEST] 3C — exiting semantic-dive into map view (real user flow)')
resetState()
setCurrentViewForTest('galaxy')
setFocusViaSelectedPoint(4)
setTrailDepthOnAll(2)
setSearchIntent()
commit()
assertEq(ds('semanticDive'), 'active', '3C: pre — semanticDive is active before switch')

// Simulate switchView('map') — which sets currentView='map' then calls refreshCompositionState
setCurrentViewForTest('map')
commit()

assertEq(ds('activeView'), 'map', '3C: activeView is map')
assertEq(ds('semanticDive'), 'inactive', '3C: semanticDive forced inactive when entering map from semantic-dive')
assertEq(ds('panelSurface'), 'map-focus-search', '3C: panelSurface is map-focus-search')
console.log('  PASS: semantic-dive → map transition forces semanticDive=inactive\n')

// ── INVARIANT 4 ────────────────────────────────────────────────────────────────
// search-with-focus resolves to exactly ONE owner: panelSurface='focus-search'.
// graphContext must be 'focus-search', NOT 'search' or 'focus' simultaneously.
// No two competing owners for the info panel.

console.log('[INVARIANT 4] search-with-focus resolves to focus-search, not competing owners')

// ── 4A: Both search intent AND focus are present → focus-search ────────────────
console.log('[TEST] 4A — search+focus resolves to focus-search')
resetState()
setFocusViaSelectedPoint(3)
setSearchIntent()
commit()

assertEq(ds('panelSurface'), 'focus-search', '4A: panelSurface must be focus-search')
assertEq(ds('graphContext'), 'focus-search', '4A: graphContext must be focus-search')
assertEq(ds('trailState'), 'active', '4A: trailState is active')
// No competing 'search' or 'focus' as separate owners — single unified owner
assert(
    ds('panelSurface') !== 'search' && ds('panelSurface') !== 'focus',
    '4A: panelSurface is NOT search or focus alone — must be unified focus-search'
)
console.log('  PASS: search+focus resolves to single unified owner\n')

// ── 4B: Search only (no focus) → panelSurface='search', not 'focus-search' ───
console.log('[TEST] 4B — search-only (no focus) resolves to search')
resetState()
setSearchIntent()
commit()

assertEq(ds('panelSurface'), 'search', '4B: panelSurface must be search (no focus)')
assertEq(ds('graphContext'), 'corridor', '4B: graphContext must be corridor')
assertEq(ds('trailState'), 'inactive', '4B: trailState is inactive when no focus')
console.log('  PASS: search-only resolves correctly\n')

// ── 4C: Focus only (no search) → panelSurface='focus', not 'focus-search' ─────
console.log('[TEST] 4C — focus-only (no search) resolves to focus')
resetState()
setFocusViaSelectedPoint(7)
state.searchState.currentSearchSummary = null
elementsById.delete('search-input')
commit()

assertEq(ds('panelSurface'), 'focus', '4C: panelSurface must be focus (no search)')
assertEq(ds('graphContext'), 'focus', '4C: graphContext must be focus')
console.log('  PASS: focus-only resolves correctly\n')

// ── 4D: No search intent, no focus → panelSurface='idle' ───────────────────────
console.log('[TEST] 4D — idle state (no search, no focus)')
resetState()
commit()

assertEq(ds('panelSurface'), 'idle', '4D: panelSurface must be idle')
assertEq(ds('graphContext'), 'idle', '4D: graphContext must be idle')
assertEq(ds('activeView'), 'galaxy', '4D: activeView is galaxy')
console.log('  PASS: idle state resolves correctly\n')

// ── 4E: Short search input (< 2 chars) → no search intent ───────────────────
// This is not a contradiction but confirms the threshold boundary.
console.log('[TEST] 4E — single-char input below threshold')
resetState()
const shortInput = new FakeElement('input')
shortInput.value = 'x'
elementsById.set('search-input', shortInput)
commit()

assertEq(ds('panelSurface'), 'idle', '4E: panelSurface must be idle (1 char below threshold)')
assertEq(ds('graphContext'), 'idle', '4E: graphContext must be idle')
console.log('  PASS: sub-threshold input does not create search intent\n')

// ── INVARIANT 5 ────────────────────────────────────────────────────────────────
// derivePanelSurface returns exactly one panelSurface value for every valid
// input tuple. No undefined, no null, no empty string.

console.log('[INVARIANT 5] derivePanelSurface returns exactly one valid panelSurface per state tuple')

// ── 5A: All known view=galaxy states have a defined panelSurface ───────────────
const GALAXY_STATES = [
    { label: 'idle', hasFocus: false, hasSearch: false, semanticDive: 'inactive' },
    { label: 'search', hasFocus: false, hasSearch: true, semanticDive: 'inactive' },
    { label: 'focus', hasFocus: true, hasSearch: false, semanticDive: 'inactive' },
    { label: 'focus-search', hasFocus: true, hasSearch: true, semanticDive: 'inactive' },
    { label: 'semantic-dive', hasFocus: true, hasSearch: false, semanticDive: 'active' }
]

console.log('[TEST] 5A — all galaxy states produce exactly one panelSurface')
for (const s of GALAXY_STATES) {
    resetState()
    if (s.hasFocus) setFocusViaSelectedPoint(1)
    if (s.hasSearch) setSearchIntent()
    if (s.semanticDive === 'active') state.trailDepth = 2
    commit()
    const ps = ds('panelSurface')
    assert(ps && ps.length > 0, `5A[${s.label}]: panelSurface is non-empty (got '${ps}')`)
    assert(ps !== 'undefined' && ps !== 'null' && ps !== '', `5A[${s.label}]: panelSurface is not a nullish string`)
    console.log(`  PASS: ${s.label} → panelSurface='${ps}'`)
}
console.log('  PASS: all galaxy states produce exactly one valid panelSurface\n')

// ── 5B: All known view=map states have a defined panelSurface ─────────────────
const MAP_STATES = [
    { label: 'map-idle', hasMapFocus: false, hasSearch: false },
    { label: 'map-search', hasMapFocus: false, hasSearch: true },
    { label: 'map-focus', hasMapFocus: true, hasSearch: false },
    { label: 'map-focus-search', hasMapFocus: true, hasSearch: true }
]

console.log('[TEST] 5B — all map states produce exactly one panelSurface')
for (const s of MAP_STATES) {
    resetState()
    setCurrentViewForTest('map')
    if (s.hasMapFocus) setFocusViaSelectedPoint(2)
    if (s.hasSearch) setSearchIntent()
    commit()
    const ps = ds('panelSurface')
    assert(ps && ps.length > 0, `5B[${s.label}]: panelSurface is non-empty (got '${ps}')`)
    assert(ps.startsWith('map-'), `5B[${s.label}]: panelSurface must start with 'map-' (got '${ps}')`)
    console.log(`  PASS: ${s.label} → panelSurface='${ps}'`)
}
console.log('  PASS: all map states produce exactly one valid panelSurface\n')

// ── 5C: No state tuple produces two competing panelSurface values ────────────
// By design: panelSurface is a single string attribute. This test confirms
// the implementation does not accidentally write multiple values or arrays.
console.log('[TEST] 5C — panelSurface is always a single string value')
resetState()
setFocusViaSelectedPoint(2)
setSearchIntent()
commit()
const ps = ds('panelSurface')
assert(typeof ps === 'string', `5C: panelSurface is a string (got ${typeof ps})`)
assert(!ps.includes(','), '5C: panelSurface contains no comma (not a list)')
console.log('  PASS: panelSurface is always a single string\n')

// ── INVARIANT 6 ───────────────────────────────────────────────────────────────
// dataset field consistency: after every refreshCompositionState call,
// all COMPOSITION_FIELDS must be present on body.dataset (no missing keys).

console.log('[INVARIANT 6] All composition fields are always present after refresh')

// ── 6A: All composition fields present in every canonical state ───────────────
const CANONICAL_STATES = [
    { label: 'overview-idle', currentView: 'galaxy', setup: () => {} },
    { label: 'search', currentView: 'galaxy', setup: () => setSearchIntent() },
    {
        label: 'focus-search',
        currentView: 'galaxy',
        setup: () => {
            setFocusViaSelectedPoint(2)
            setSearchIntent()
        }
    },
    {
        label: 'semantic-dive',
        currentView: 'galaxy',
        setup: () => {
            setFocusViaSelectedPoint(2)
            state.trailDepth = 2
        }
    },
    {
        label: 'map-focus-search',
        currentView: 'map',
        setup: () => {
            setFocusViaSelectedPoint(2)
            setSearchIntent()
        }
    },
    { label: 'map-search', currentView: 'map', setup: () => setSearchIntent() }
]

console.log('[TEST] 6A — all composition fields present in every canonical state')
for (const s of CANONICAL_STATES) {
    resetState()
    setCurrentViewForTest(s.currentView)
    s.setup()
    commit()
    const snap = snapshotDataset()
    for (const field of COMPOSITION_FIELDS) {
        assert(
            field in snap && snap[field] !== undefined && snap[field] !== undefined,
            `6A[${s.label}]: field '${field}' is present (got '${snap[field]}')`
        )
    }
    // After reset invariant 2, all fields should be back to baseline
    if (s.label === 'overview-idle') {
        resetStateBeforeUrlRestore({ clearSearchInput: true })
        commit()
        const postReset = snapshotDataset()
        assertEq(postReset.panelSurface, 'idle', `6A[${s.label}]: post-reset panelSurface is idle`)
    }
    console.log(`  PASS: ${s.label} — all ${COMPOSITION_FIELDS.length} fields present`)
}
console.log('  PASS: all composition fields present across all canonical states\n')

// ── SUMMARY ───────────────────────────────────────────────────────────────────
console.log('\n=== composition-state-invariant-contract.mjs PASSED ===')
console.log('All 6 invariants verified across their edge-case matrix.')
console.log('')
console.log('Key invariants confirmed:')
console.log('  1. semanticDive=active requires trailDepth>=2 AND hasFocus — code enforces this')
console.log('  2. resetStateBeforeUrlRestore clears focus tuple → dataset returns to idle')
console.log('  3. map view forces semanticDive=inactive regardless of trailDepth/dive mode')
console.log('  4. search+focus → unified focus-search owner, no competing owners')
console.log('  5. derivePanelSurface returns exactly one non-null panelSurface per tuple')
console.log('  6. all composition fields always present after refreshCompositionState')
