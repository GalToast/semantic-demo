/**
 * svelte-parity-attrs.test.js
 *
 * Focused unit tests for the Svelte parity attribute layer
 * introduced 2026-06-06. The parity layer is the Svelte side's
 * authoritative source for the body data-* attributes that the legacy
 * production shell (vector-explorer-polished.html) relies on.
 *
 * These tests use jsdom (vitest default) and cover:
 *
 *   1. PARITY_ATTRIBUTES manifest covers the legacy-required body attrs
 *   2. computeParityAttributes() returns the right map for each state
 *   3. applyParityAttributes() writes/clears body.dataset entries
 *   4. installParityAttributeSync() wires store changes into body.dataset
 *   5. The legacy canvas-hit-test required attrs are present:
 *        - data-semantic-dive, data-panel-surface, data-trail-depth,
 *          data-journey-compass-phase, data-journey-compass-density,
 *          data-journey-compass-copy, data-journey-navigation-owner,
 *          data-focused-node, data-nav-mode, data-nav-surface,
 *          data-filters-active, data-graph-context
 *
 * Run: npx vitest run tests/unit/svelte-parity-attrs.test.js
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { get } from 'svelte/store';

// jsdom does not implement window.matchMedia by default. The viewport
// store calls matchMedia at module-init time, so we install a minimal
// stub before any imports below are evaluated. This is the same
// pattern used by tests/unit/environment.test.js.
beforeAll(() => {
  if (typeof window.matchMedia !== 'function') {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: (query) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn()
      })
    });
  }
});

// Use relative paths to avoid needing the @lib path alias in vitest.config.js.
// The Svelte stores under src/lib/stores/* are real Svelte stores
// (writable/derived) — they don't require Svelte compilation, so they
// can be imported from .ts here as long as vite-plugin-svelte is in
// the config (it is).
const {
  PARITY_ATTRIBUTES,
  PARITY_ATTRIBUTE_KEYS,
  computeParityAttributes,
  applyParityAttributes,
  installParityAttributeSync,
  readParityAttributesFromBody,
  resetParityAttributeCache
} = await import('../../src/lib/orchestration/parity-attrs.ts');

const { navStore } = await import('../../src/lib/stores/navigation.ts');
const { journeyStore } = await import('../../src/lib/stores/journey.ts');
const { focusStore } = await import('../../src/lib/stores/focus.ts');
const { searchStore } = await import('../../src/lib/stores/search.ts');
const { filterState } = await import('../../src/lib/stores/filter.ts');
const { viewport } = await import('../../src/lib/stores/viewport.ts');
const { demoPhase: demoPhaseStore } = await import('../../src/lib/stores/demo.ts');
const { loadingPhaseStore, graphicsModeStore } = await import('../../src/lib/data-store.ts');

// ── Helpers ──────────────────────────────────────────────────────────────

function snapshotStores() {
  return {
    nav: structuredClone(get(navStore)),
    journey: structuredClone(get(journeyStore)),
    focus: structuredClone(get(focusStore)),
    search: structuredClone(get(searchStore)),
    filters: structuredClone(get(filterState)),
    vp: structuredClone(get(viewport)),
    loadingPhase: get(loadingPhaseStore),
    demoPhase: get(demoPhaseStore),
    graphicsMode: get(graphicsModeStore),
  };
}

function setBodyDataset(map) {
  // Reset body.dataset to a known starting point
  for (const k of Object.keys(document.body.dataset)) {
    delete document.body.dataset[k];
  }
  for (const [k, v] of Object.entries(map)) {
    document.body.dataset[k] = v;
  }
}

function readBodyDataset() {
  return { ...document.body.dataset };
}

// ── Setup ───────────────────────────────────────────────────────────────

beforeEach(() => {
  // Clean DOM and reset the installer's internal cache
  setBodyDataset({});
  resetParityAttributeCache();
});

afterEach(() => {
  setBodyDataset({});
  resetParityAttributeCache();
  vi.restoreAllMocks();
});

// ── Tests ──────────────────────────────────────────────────────────────

describe('PARITY_ATTRIBUTES manifest', () => {
  it('covers the legacy canvas-hit-test required attrs', () => {
    const required = [
      'semanticDive',
      'panelSurface',
      'trailDepth',
      'journeyCompassPhase',
      'journeyCompassDensity',
      'journeyCompassCopy',
      'journeyNavigationOwner',
      'focusedNode',
      'navMode',
      'navSurface',
      'filtersActive',
      'graphContext',
      'strandJourney'
    ];
    for (const key of required) {
      expect(PARITY_ATTRIBUTE_KEYS.has(key), `manifest must include ${key}`).toBe(true);
    }
  });

  it('covers the Svelte-native attrs owned by parity (focusTransition, searchStatus, cameraSlack)', () => {
    // These three are Svelte-native attributes that legacy modules used to
    // write directly. The parity layer is the sole writer now, so the
    // manifest must include them to keep the DOM in sync with stores.
    for (const key of ['focusTransition', 'searchStatus', 'cameraSlack']) {
      expect(PARITY_ATTRIBUTE_KEYS.has(key), `manifest must include ${key}`).toBe(true);
    }
  });

  it('manifest entries have non-empty key and source', () => {
    for (const entry of PARITY_ATTRIBUTES) {
      expect(entry.key.length, 'key must be non-empty').toBeGreaterThan(0);
      expect(entry.source.length, 'source must be non-empty').toBeGreaterThan(0);
      expect(entry.description.length, 'description must be non-empty').toBeGreaterThan(0);
    }
  });
});

describe('computeParityAttributes', () => {
  it('returns overview defaults for empty stores', () => {
    const stores = snapshotStores();
    const map = computeParityAttributes(
      stores.nav, stores.journey, stores.focus,
      stores.search, stores.filters, stores.vp,
      stores.loadingPhase, stores.demoPhase, stores.graphicsMode
    );

    expect(map.navMode).toBe('overview');
    expect(map.navSurface).toBe('idle');
    expect(map.panelSurface).toBe('idle');
    expect(map.journeyCompassPhase).toBe('idle');
    expect(map.semanticDive).toBe('inactive');
    expect(map.trailState).toBe('inactive');
    expect(map.focusedNode).toBeNull();
    expect(map.testReady).toBe('true');
  });

  it('reflects focus state via focused-node attribute', () => {
    navStore.update((s) => ({ ...s, focusedIndex: 42 }));
    try {
      const stores = snapshotStores();
      const map = computeParityAttributes(
        stores.nav, stores.journey, stores.focus,
        stores.search, stores.filters, stores.vp,
        stores.loadingPhase, stores.demoPhase, stores.graphicsMode
      );
      expect(map.focusedNode).toBe('42');
      expect(map.navMode).toBe('overview'); // mode stays until reducer runs
    } finally {
      navStore.update((s) => ({ ...s, focusedIndex: null }));
    }
  });

  it('semantic-dive wins over panel-surface for panelSurfaceMode', () => {
    focusStore.update((s) => ({ ...s, semanticDiveMode: true }));
    try {
      const stores = snapshotStores();
      const map = computeParityAttributes(
        stores.nav, stores.journey, stores.focus,
        stores.search, stores.filters, stores.vp,
        stores.loadingPhase, stores.demoPhase, stores.graphicsMode
      );
      expect(map.semanticDive).toBe('active');
      expect(map.panelSurfaceMode).toBe('semantic-dive');
    } finally {
      focusStore.update((s) => ({ ...s, semanticDiveMode: false }));
    }
  });

  it('semantic-dive reports transitioning when trailDepth >= 2 but no active flag', () => {
    focusStore.update((s) => ({ ...s, semanticDiveMode: false }));
    journeyStore.update((s) => ({ ...s, trailDepth: 2 }));
    try {
      const stores = snapshotStores();
      const map = computeParityAttributes(
        stores.nav, stores.journey, stores.focus,
        stores.search, stores.filters, stores.vp,
        stores.loadingPhase, stores.demoPhase, stores.graphicsMode
      );
      expect(map.semanticDive).toBe('transitioning');
      expect(map.trailDepth).toBe('2');
      expect(map.trailState).toBe('active');
    } finally {
      journeyStore.update((s) => ({ ...s, trailDepth: 0 }));
    }
  });

  it('graph-context reflects inside / focus / search / overview', () => {
    // Inside phase wins
    navStore.update((s) => ({ ...s, mode: 'inside' }));
    let stores = snapshotStores();
    expect(computeParityAttributes(stores.nav, stores.journey, stores.focus, stores.search, stores.filters, stores.vp, stores.loadingPhase, stores.demoPhase, stores.graphicsMode).graphContext).toBe('inside');

    // Focus phase
    navStore.update((s) => ({ ...s, mode: 'focus' }));
    stores = snapshotStores();
    expect(computeParityAttributes(stores.nav, stores.journey, stores.focus, stores.search, stores.filters, stores.vp, stores.loadingPhase, stores.demoPhase, stores.graphicsMode).graphContext).toBe('focus');

    // Map view wins over mode
    navStore.update((s) => ({ ...s, mode: 'overview', currentView: 'map' }));
    stores = snapshotStores();
    expect(computeParityAttributes(stores.nav, stores.journey, stores.focus, stores.search, stores.filters, stores.vp, stores.loadingPhase, stores.demoPhase, stores.graphicsMode).graphContext).toBe('map');

    // Back to overview
    navStore.update((s) => ({ ...s, mode: 'overview', currentView: 'galaxy' }));
  });

  it('strandJourney defaults to idle when strandContinuityPhase is unset', () => {
    const stores = snapshotStores();
    const map = computeParityAttributes(
      stores.nav, stores.journey, stores.focus,
      stores.search, stores.filters, stores.vp,
      stores.loadingPhase, stores.demoPhase, stores.graphicsMode
    );
    expect(map.strandJourney).toBe('idle');
  });

  it('strandJourney reflects exploring phase from focus store', () => {
    focusStore.update((s) => ({ ...s, strandContinuityPhase: 'exploring' }));
    try {
      const stores = snapshotStores();
      const map = computeParityAttributes(
        stores.nav, stores.journey, stores.focus,
        stores.search, stores.filters, stores.vp,
        stores.loadingPhase, stores.demoPhase, stores.graphicsMode
      );
      expect(map.strandJourney).toBe('exploring');
    } finally {
      focusStore.update((s) => ({ ...s, strandContinuityPhase: 'idle' }));
    }
  });

  it('strandJourney reflects arrived phase from focus store', () => {
    focusStore.update((s) => ({ ...s, strandContinuityPhase: 'arrived' }));
    try {
      const stores = snapshotStores();
      const map = computeParityAttributes(
        stores.nav, stores.journey, stores.focus,
        stores.search, stores.filters, stores.vp,
        stores.loadingPhase, stores.demoPhase, stores.graphicsMode
      );
      expect(map.strandJourney).toBe('arrived');
    } finally {
      focusStore.update((s) => ({ ...s, strandContinuityPhase: 'idle' }));
    }
  });

  it('focused-node is null (not "null" string) when no index set', () => {
    navStore.update((s) => ({ ...s, focusedIndex: null }));
    const stores = snapshotStores();
    const map = computeParityAttributes(
      stores.nav, stores.journey, stores.focus,
      stores.search, stores.filters, stores.vp,
      stores.loadingPhase, stores.demoPhase, stores.graphicsMode
    );
    expect(map.focusedNode).toBeNull();
  });

  it('focusTransition mirrors focusStore.transitionMode', () => {
    const stores = snapshotStores();
    const initial = computeParityAttributes(
      stores.nav, stores.journey, stores.focus,
      stores.search, stores.filters, stores.vp,
      stores.loadingPhase, stores.demoPhase, stores.graphicsMode
    );
    expect(initial.focusTransition).toBe('idle');

    focusStore.update((s) => ({ ...s, transitionMode: 'entering' }));
    try {
      const after = computeParityAttributes(
        get(navStore), get(journeyStore), get(focusStore),
        get(searchStore), get(filterState), get(viewport),
        get(loadingPhaseStore), get(demoPhaseStore), get(graphicsModeStore)
      );
      expect(after.focusTransition).toBe('entering');
    } finally {
      focusStore.update((s) => ({ ...s, transitionMode: 'idle' }));
    }
  });

  it('searchStatus mirrors searchStore.status', () => {
    searchStore.update((s) => ({ ...s, status: 'searching' }));
    try {
      const stores = snapshotStores();
      const map = computeParityAttributes(
        stores.nav, stores.journey, stores.focus,
        stores.search, stores.filters, stores.vp,
        stores.loadingPhase, stores.demoPhase, stores.graphicsMode
      );
      expect(map.searchStatus).toBe('searching');
    } finally {
      searchStore.update((s) => ({ ...s, status: 'idle' }));
    }
  });

  it('cameraSlack mirrors cameraStore.orbitSlack.phase', async () => {
    const { cameraStore } = await import('../../src/lib/stores/camera.ts');
    cameraStore.update((s) => ({ ...s, orbitSlack: { ...s.orbitSlack, phase: 'active' } }));
    try {
      const stores = snapshotStores();
      const map = computeParityAttributes(
        stores.nav, stores.journey, stores.focus,
        stores.search, stores.filters, stores.vp,
        stores.loadingPhase, stores.demoPhase, stores.graphicsMode
      );
      expect(map.cameraSlack).toBe('active');
    } finally {
      cameraStore.update((s) => ({ ...s, orbitSlack: { ...s.orbitSlack, phase: 'idle' } }));
    }
  });
});

describe('applyParityAttributes', () => {
  it('writes each non-null key to body.dataset', () => {
    const map = {
      navMode: 'overview',
      navSurface: 'idle',
      panelSurface: 'idle',
      focusedNode: null,
      semanticDive: 'inactive',
      trailDepth: '0'
    };
    applyParityAttributes(map);
    const ds = readBodyDataset();
    expect(ds.navMode).toBe('overview');
    expect(ds.navSurface).toBe('idle');
    expect(ds.panelSurface).toBe('idle');
    expect(ds.semanticDive).toBe('inactive');
    expect(ds.trailDepth).toBe('0');
    expect(ds.focusedNode).toBeUndefined();
  });

  it('removes keys when the new value is null', () => {
    setBodyDataset({ focusedNode: '7', navMode: 'overview' });
    applyParityAttributes({ focusedNode: null, navMode: 'focus' });
    const ds = readBodyDataset();
    expect(ds.focusedNode).toBeUndefined();
    expect(ds.navMode).toBe('focus');
  });
});

describe('installParityAttributeSync', () => {
  it('writes the initial parity snapshot to body on install', () => {
    const cleanup = installParityAttributeSync();
    try {
      const ds = readBodyDataset();
      expect(ds.testReady).toBe('true');
      expect(ds.navMode).toBe('overview');
      expect(ds.navSurface).toBe('idle');
      expect(ds.semanticDive).toBe('inactive');
      expect(ds.journeyCompassPhase).toBe('idle');
    } finally {
      cleanup();
    }
  });

  it('updates body dataset when a relevant store changes', () => {
    const cleanup = installParityAttributeSync();
    try {
      // Trigger focus + semantic dive
      navStore.update((s) => ({ ...s, focusedIndex: 99, surface: 'focus' }));
      focusStore.update((s) => ({ ...s, semanticDiveMode: true }));

      const ds = readBodyDataset();
      expect(ds.focusedNode).toBe('99');
      expect(ds.navSurface).toBe('focus');
      expect(ds.semanticDive).toBe('active');
      expect(ds.panelSurfaceMode).toBe('semantic-dive');
    } finally {
      // Reset for cleanup
      navStore.update((s) => ({ ...s, focusedIndex: null, surface: 'idle' }));
      focusStore.update((s) => ({ ...s, semanticDiveMode: false }));
      cleanup();
    }
  });

  it('updates strandJourney when focus store strandContinuityPhase changes', () => {
    const cleanup = installParityAttributeSync();
    try {
      focusStore.update((s) => ({ ...s, strandContinuityPhase: 'exploring' }));
      let ds = readBodyDataset();
      expect(ds.strandJourney).toBe('exploring');

      focusStore.update((s) => ({ ...s, strandContinuityPhase: 'arrived' }));
      ds = readBodyDataset();
      expect(ds.strandJourney).toBe('arrived');

      focusStore.update((s) => ({ ...s, strandContinuityPhase: 'idle' }));
      ds = readBodyDataset();
      expect(ds.strandJourney).toBe('idle');
    } finally {
      focusStore.update((s) => ({ ...s, strandContinuityPhase: 'idle' }));
      cleanup();
    }
  });

  it('survives multiple consecutive updates without leaks', () => {
    const cleanup = installParityAttributeSync();
    try {
      for (let i = 0; i < 5; i++) {
        navStore.update((s) => ({ ...s, focusedIndex: i }));
      }
      const ds = readBodyDataset();
      expect(ds.focusedNode).toBe('4');
    } finally {
      navStore.update((s) => ({ ...s, focusedIndex: null }));
      cleanup();
    }
  });

  it('readParityAttributesFromBody returns the live DOM snapshot', () => {
    const cleanup = installParityAttributeSync();
    try {
      const live = readParityAttributesFromBody();
      expect(live.testReady).toBe('true');
      expect(live.navMode).toBe('overview');
    } finally {
      cleanup();
    }
  });
});
