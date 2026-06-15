/**
 * svelte-parity-attrs.test.ts
 *
 * Focused unit tests for the Svelte parity attribute layer
 * introduced 2026-06-06. The parity layer is the Svelte side's
 * authoritative source for the body data-* attributes that the legacy
 * production shell (vector-explorer-polished.html) relies on.
 *
 * Active Vitest suite (tests/unit-active/).
 *
 * These tests use jsdom (vitest default) and cover:
 *
 *   1. PARITY_ATTRIBUTES manifest covers the legacy-required body attrs
 *   2. computeParityAttributes() returns the right map for each state
 *   3. applyParityAttributes() writes/clears body.dataset entries
 *   4. installParityAttributeSync() wires store changes into body.dataset
 *   5. The legacy canvas-hit-test required attrs are present
 *
 * Run: npx vitest run tests/unit-active/svelte-parity-attrs.test.ts
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { get } from 'svelte/store';

import {
  PARITY_ATTRIBUTES,
  PARITY_ATTRIBUTE_KEYS,
  computeParityAttributes,
  applyParityAttributes,
  installParityAttributeSync,
  readParityAttributesFromBody,
  resetParityAttributeCache
} from '@lib/orchestration/parity-attrs';

import { navStore, resetNavState } from '@lib/stores/navigation';
import { journeyStore, resetJourney } from '@lib/stores/journey';
import { focusStore, resetFocus } from '@lib/stores/focus.svelte.ts';
import { searchStore } from '@lib/stores/search.svelte';
import { filterState, resetFilters } from '@lib/stores/filter.svelte';
import { viewport } from '@lib/stores/viewport';
import { demoStore as demoPhaseStore, resetDemo } from '@lib/stores/demo.svelte.ts';
import { cameraStore, resetCamera } from '@lib/stores/camera.svelte.ts';
import { loadingPhaseStore, graphicsModeStore } from '@lib/data-store';

// ── Helpers ──────────────────────────────────────────────────────────────

function snapshotStores() {
  return {
    nav: structuredClone(navStore()),
    journey: structuredClone(journeyStore()),
    focus: structuredClone(focusStore()),
    search: structuredClone(get(searchStore)),
    filters: structuredClone(get(filterState)),
    vp: structuredClone(viewport()),
    loadingPhase: get(loadingPhaseStore),
    demoPhase: get(demoPhaseStore),
    graphicsMode: get(graphicsModeStore),
  };
}

function setBodyDataset(map: Record<string, string>): void {
  // Reset body.dataset to a known starting point
  for (const k of Object.keys(document.body.dataset)) {
    delete document.body.dataset[k as keyof DOMStringMap];
  }
  for (const [k, v] of Object.entries(map)) {
    document.body.dataset[k as keyof DOMStringMap] = v;
  }
}

function readBodyDataset(): Record<string, string> {
  return { ...document.body.dataset } as Record<string, string>;
}

// ── Setup ───────────────────────────────────────────────────────────────

beforeEach(() => {
  // Clean DOM and reset the installer's internal cache
  setBodyDataset({});
  resetParityAttributeCache();
  // Reset singleton stores so mutations from prior tests don't leak
  resetNavState();
  resetJourney();
  resetFocus();
  resetFilters();
  resetDemo();
  resetCamera();
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
        navStore(), journeyStore(), focusStore(),
        get(searchStore), get(filterState), viewport(),
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

  it('cameraSlack mirrors cameraStore.orbitSlack.phase', () => {
    cameraStore.update((s) => ({ ...s, orbitSlack: { ...s.orbitSlack, phase: 'active' } }));
    try {
      const stores = snapshotStores();
      // Pass camera state explicitly as 10th arg
      const map = computeParityAttributes(
        stores.nav, stores.journey, stores.focus,
        stores.search, stores.filters, stores.vp,
        stores.loadingPhase, stores.demoPhase, stores.graphicsMode,
        get(cameraStore)
      );
      expect(map.cameraSlack).toBe('active');
    } finally {
      cameraStore.update((s) => ({ ...s, orbitSlack: { ...s.orbitSlack, phase: 'idle' } }));
    }
  });
});

describe('applyParityAttributes', () => {
  it('writes each non-null key to body.dataset', () => {
    const map: Record<string, string | null> = {
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
