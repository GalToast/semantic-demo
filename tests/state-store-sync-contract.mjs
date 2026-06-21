/**
 * state-store-sync-contract.mjs
 *
 * Runtime contract proving that mutations to state.js fields propagate to the
 * matching Svelte stores. This is the load-bearing sync documented in state.js
 * (see state.js header) — without it, Svelte components (FilterChrome,
 * SearchResultsList, etc.) read stale data after vanilla JS writes.
 *
 * Each mirrored field has a single owner:
 *   activeFilters / activeClusterFilter → filter-state.js
 *
 * The other state fields (currentView, loadingPhaseKey,
 * semanticThreadsStatus) are written by state-mutators.js but are NOT
 * mirrored to Svelte stores — no Svelte component reads them, so the
 * sync would be dead weight.
 *
 * Run: node tests/state-store-sync-contract.mjs
 * Gate: tests/run-all-contracts.js
 *
 * Source-only / Fake-DOM — no browser or network required.
 */

import { get } from 'svelte/store'

// ─── Fake DOM bootstrap (subset of what other contracts use) ──────────────────

let _rafNow = 0

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
        return (this.children.push(c), c)
    }
    setAttribute(k, v) {
        this._attr.set(String(k), String(v))
    }
    getAttribute(k) {
        return this._attr.get(String(k)) ?? null
    }
    removeAttribute(k) {
        this._attr.delete(String(k))
    }
    querySelector() {
        return null
    }
    querySelectorAll() {
        return []
    }
}

const fakeBody = new FakeElement('body')
const elementsById = new Map()

globalThis.document = {
    body: fakeBody,
    getElementById: (id) => elementsById.get(id) || null,
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: (tag) => new FakeElement(tag),
    addEventListener: () => {}
}

globalThis.window = {
    innerWidth: 1280,
    location: { search: '' },
    history: { replaceState: () => {}, pushState: () => {} },
    setTimeout: () => 0,
    clearTimeout: () => {},
    requestAnimationFrame: (fn) => {
        _rafNow += 16
        return ++_rafNow
    },
    cancelAnimationFrame: () => {},
    matchMedia: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
    setInterval: () => 0,
    clearInterval: () => {},
    addEventListener: () => {},
    removeEventListener: () => {}
}

globalThis.performance = {
    now: () => {
        _rafNow += 16
        return _rafNow
    }
}

Object.defineProperty(globalThis, 'navigator', {
    value: { userAgent: 'node' },
    writable: true,
    configurable: true
})
Object.defineProperty(globalThis, 'crypto', {
    value: { randomUUID: () => 'fake-uuid-' + Math.random().toString(36).slice(2) },
    writable: true,
    configurable: true
})

// ─── Helpers ─────────────────────────────────────────────────────────────────

function assert(cond, msg) {
    if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`)
}

// ─── Load modules under test (after fake DOM is set up) ──────────────────────

const { state } = await import('./helpers/canonical-state.mjs')
const { filterState, activeClusterFilter, setFilter, setActiveClusterFilter, resetFilters } =
    await import('../src/lib/stores/filter.svelte.ts')

// ─── CONTRACT 1: setFilter mirrors state.activeFilters → filterState ──────

setFilter('status', 'active')
const afStatus = get(filterState)
assert(
    afStatus && afStatus.status === 'active',
    `filterState.status should be 'active' after setFilter('status', 'active'), got ${JSON.stringify(afStatus)}`
)
assert(state.activeFilters.status === 'active', "state.activeFilters.status should also be 'active' (sanity check)")

setFilter('website', true)
const afWebsite = get(filterState)
assert(afWebsite.website === true, `filterState.website should be true, got ${JSON.stringify(afWebsite)}`)

console.log('PASS CONTRACT 1: setFilter() syncs filterState')

// ─── CONTRACT 2: resetFilters clears the store to defaults ─────────

resetFilters()
const afReset = get(filterState)
assert(
    afReset.status === 'all' &&
        afReset.city === '' &&
        afReset.website === false &&
        afReset.email === false &&
        afReset.geocoded === false,
    `filterState should be at defaults after resetFilters, got ${JSON.stringify(afReset)}`
)

console.log('PASS CONTRACT 2: resetFilters() syncs filterState to defaults')

// ─── CONTRACT 3: setActiveClusterFilter mirrors state.activeClusterFilter → activeClusterFilter ──

setActiveClusterFilter(7)
const acfValue = get(activeClusterFilter)
// Canonical store normalizes to string; loose equality accepts both 7 and '7'.
assert(acfValue == 7, `activeClusterFilter should be 7 after setActiveClusterFilter(7), got ${acfValue}`)

setActiveClusterFilter(null)
const acfNull = get(activeClusterFilter)
assert(acfNull === null, `activeClusterFilter should be null after setActiveClusterFilter(null), got ${acfNull}`)

console.log('PASS CONTRACT 3: setActiveClusterFilter() syncs activeClusterFilter')

// ─── CONTRACT 4: store updates do not alias state (objects are cloned) ────────
//
// If the store held the same object reference as state, mutating one would
// silently mutate the other. The sync contract clones objects to prevent this.

setFilter('city', 'Rockville')
const afCity = get(filterState)
afCity.city = 'TAMPERED'
const afStateAfter = state.activeFilters.city
assert(
    afStateAfter === 'Rockville',
    `state.activeFilters.city must be 'Rockville' after store mutation — got '${afStateAfter}'. Sync must clone, not alias.`
)

console.log('PASS CONTRACT 7: store values are cloned, not aliased to state')

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log('\n=== state-store-sync-contract.mjs COMPLETE ===')
console.log('4 contracts verified. State ↔ Svelte store sync is load-bearing.')
console.log('')
console.log('Sync map:')
console.log('  state.activeFilters         ↔ activeFiltersStore         (filter-state.js)')
console.log('  state.activeClusterFilter   ↔ activeClusterFilterStore   (filter-state.js)')
console.log('')
console.log('Panel-toggle stores (isInfoPanelOpen, isLegendPanelOpen) are owned by the')
console.log('Svelte chrome components and have no state.js counterpart.')
console.log('')
console.log('Decorative stores (currentView, loadingPhaseKey, semanticThreadsStatus)')
console.log('were removed — no Svelte component read them, so the sync was dead weight.')
console.log('The state writes themselves still happen via state-mutators.js.')
