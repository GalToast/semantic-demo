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
 *   currentView / loadingPhaseKey / semanticThreadsStatus → state-mutators.js
 *
 * Run: node tests/state-store-sync-contract.mjs
 * Gate: tests/run-all-contracts.js
 *
 * Source-only / Fake-DOM — no browser or network required.
 */

import { get } from 'svelte/store';

// ─── Fake DOM bootstrap (subset of what other contracts use) ──────────────────

let _rafNow = 0;

class FakeClassList {
    constructor() { this._items = new Set(); }
    add(...n)    { n.forEach(x => this._items.add(x)); }
    remove(...n)  { n.forEach(x => this._items.delete(x)); }
    contains(n)   { return this._items.has(n); }
    toggle(n, f) {
        const on = f !== undefined ? f : !this._items.has(n);
        on ? this._items.add(n) : this._items.delete(n);
        return on;
    }
}

class FakeElement {
    constructor(tag = 'div') {
        this.tagName = tag.toUpperCase();
        this.classList = new FakeClassList();
        this.dataset = {};
        this.style = {};
        this.children = [];
        this._innerHTML = '';
        this._text = '';
        this._attr = new Map();
        this.hidden = false;
    }
    get innerHTML()  { return this._innerHTML; }
    set innerHTML(v) { this._innerHTML = String(v); }
    get textContent() { return this._text; }
    set textContent(v) { this._text = String(v); }
    appendChild(c)   { return this.children.push(c), c; }
    setAttribute(k, v) { this._attr.set(String(k), String(v)); }
    getAttribute(k)  { return this._attr.get(String(k)) ?? null; }
    removeAttribute(k) { this._attr.delete(String(k)); }
    querySelector()    { return null; }
    querySelectorAll() { return []; }
}

const fakeBody = new FakeElement('body');
const elementsById = new Map();

globalThis.document = {
    body: fakeBody,
    getElementById: id => elementsById.get(id) || null,
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: tag => new FakeElement(tag),
    addEventListener: () => {},
};

globalThis.window = {
    innerWidth: 1280,
    location: { search: '' },
    history: { replaceState: () => {}, pushState: () => {} },
    setTimeout: () => 0,
    clearTimeout: () => {},
    requestAnimationFrame: fn => { _rafNow += 16; return ++_rafNow; },
    cancelAnimationFrame: () => {},
    matchMedia: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
    setInterval: () => 0,
    clearInterval: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
};

globalThis.performance = { now: () => { _rafNow += 16; return _rafNow; } };

Object.defineProperty(globalThis, 'navigator', {
    value: { userAgent: 'node' },
    writable: true,
    configurable: true,
});
Object.defineProperty(globalThis, 'crypto', {
    value: { randomUUID: () => 'fake-uuid-' + Math.random().toString(36).slice(2) },
    writable: true,
    configurable: true,
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function assert(cond, msg) {
    if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

// ─── Load modules under test (after fake DOM is set up) ──────────────────────

const { state } = await import('../js/state.js');
const {
    activeFiltersStore,
    activeClusterFilterStore,
    currentViewStore,
    loadingPhaseKeyStore,
    semanticThreadsStatusStore
} = await import('../js/modules/stores.js');
const {
    setActiveFilter,
    setActiveClusterFilter,
    resetActiveFilters
} = await import('../js/modules/filter-state.js');
const {
    setCurrentView,
    updateLoadingPhaseKey,
    updateSemanticThreadsStatus
} = await import('../js/modules/state-mutators.js');

// ─── CONTRACT 1: setActiveFilter mirrors state.activeFilters → activeFiltersStore ──

setActiveFilter('status', 'active');
const afStatus = get(activeFiltersStore);
assert(afStatus && afStatus.status === 'active',
    `activeFiltersStore.status should be 'active' after setActiveFilter('status', 'active'), got ${JSON.stringify(afStatus)}`);
assert(state.activeFilters.status === 'active',
    "state.activeFilters.status should also be 'active' (sanity check)");

setActiveFilter('website', true);
const afWebsite = get(activeFiltersStore);
assert(afWebsite.website === true,
    `activeFiltersStore.website should be true, got ${JSON.stringify(afWebsite)}`);

console.log('PASS CONTRACT 1: setActiveFilter() syncs activeFiltersStore');

// ─── CONTRACT 2: resetActiveFilters clears the store to defaults ──────────────

resetActiveFilters();
const afReset = get(activeFiltersStore);
assert(afReset.status === 'all' && afReset.city === 'all' && afReset.website === false
    && afReset.email === false && afReset.geocoded === false,
    `activeFiltersStore should be at defaults after resetActiveFilters, got ${JSON.stringify(afReset)}`);

console.log('PASS CONTRACT 2: resetActiveFilters() syncs activeFiltersStore to defaults');

// ─── CONTRACT 3: setActiveClusterFilter mirrors state.activeClusterFilter → activeClusterFilterStore ──

setActiveClusterFilter(7);
const acfValue = get(activeClusterFilterStore);
assert(acfValue === 7,
    `activeClusterFilterStore should be 7 after setActiveClusterFilter(7), got ${acfValue}`);

setActiveClusterFilter(null);
const acfNull = get(activeClusterFilterStore);
assert(acfNull === null,
    `activeClusterFilterStore should be null after setActiveClusterFilter(null), got ${acfNull}`);

console.log('PASS CONTRACT 3: setActiveClusterFilter() syncs activeClusterFilterStore');

// ─── CONTRACT 4: setCurrentView mirrors state.currentView → currentViewStore ──

setCurrentView('map');
const cvValue = get(currentViewStore);
assert(cvValue === 'map',
    `currentViewStore should be 'map' after setCurrentView('map'), got ${cvValue}`);
assert(state.currentView === 'map',
    "state.currentView should also be 'map' (sanity check)");

setCurrentView('galaxy');
assert(get(currentViewStore) === 'galaxy', "currentViewStore should return to 'galaxy'");

console.log('PASS CONTRACT 4: setCurrentView() syncs currentViewStore');

// ─── CONTRACT 5: updateLoadingPhaseKey mirrors state.loadingPhaseKey → loadingPhaseKeyStore ──

updateLoadingPhaseKey('scene');
const lpValue = get(loadingPhaseKeyStore);
assert(lpValue === 'scene',
    `loadingPhaseKeyStore should be 'scene' after updateLoadingPhaseKey('scene'), got ${lpValue}`);

updateLoadingPhaseKey('launch');
assert(get(loadingPhaseKeyStore) === 'launch', "loadingPhaseKeyStore should be 'launch' after update");

console.log('PASS CONTRACT 5: updateLoadingPhaseKey() syncs loadingPhaseKeyStore');

// ─── CONTRACT 6: updateSemanticThreadsStatus mirrors state.semanticThreadsStatus → semanticThreadsStatusStore ──

updateSemanticThreadsStatus('ready');
const stsValue = get(semanticThreadsStatusStore);
assert(stsValue === 'ready',
    `semanticThreadsStatusStore should be 'ready' after updateSemanticThreadsStatus('ready'), got ${stsValue}`);

updateSemanticThreadsStatus('loading');
assert(get(semanticThreadsStatusStore) === 'loading', "semanticThreadsStatusStore should be 'loading' after update");

console.log('PASS CONTRACT 6: updateSemanticThreadsStatus() syncs semanticThreadsStatusStore');

// ─── CONTRACT 7: store updates do not alias state (objects are cloned) ────────
//
// If the store held the same object reference as state, mutating one would
// silently mutate the other. The sync contract clones objects to prevent this.

setActiveFilter('city', 'Rockville');
const afCity = get(activeFiltersStore);
afCity.city = 'TAMPERED';
const afStateAfter = state.activeFilters.city;
assert(afStateAfter === 'Rockville',
    `state.activeFilters.city must be 'Rockville' after store mutation — got '${afStateAfter}'. Sync must clone, not alias.`);

console.log('PASS CONTRACT 7: store values are cloned, not aliased to state');

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log('\n=== state-store-sync-contract.mjs COMPLETE ===');
console.log('7 contracts verified. State ↔ Svelte store sync is load-bearing.');
console.log('');
console.log('Sync map:');
console.log('  state.activeFilters         ↔ activeFiltersStore         (filter-state.js)');
console.log('  state.activeClusterFilter   ↔ activeClusterFilterStore   (filter-state.js)');
console.log('  state.currentView           ↔ currentViewStore           (state-mutators.js)');
console.log('  state.loadingPhaseKey       ↔ loadingPhaseKeyStore       (state-mutators.js)');
console.log('  state.semanticThreadsStatus ↔ semanticThreadsStatusStore (state-mutators.js)');
console.log('');
console.log('Panel-toggle stores (isInfoPanelOpen, isLegendPanelOpen) are owned by the');
console.log('Svelte chrome components and have no state.js counterpart.');
