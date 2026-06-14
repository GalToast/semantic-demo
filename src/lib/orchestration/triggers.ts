/**
 * @lib/orchestration/triggers.ts — Neutral cross-module event subscriptions
 *
 * Houses event subscriptions that bridge search lifecycle events to
 * compass controller updates. Extracted from search-sync.ts to break
 * the circular dependency:
 *
 *   compass-controller → @lib/stores/lifecycle (barrel) → search-sync → compass-controller
 *
 * By placing these subscriptions in a neutral module that imports from
 * both compass-controller and lifecycle leaf modules (not the barrel),
 * the cycle is broken. This module is a leaf — nothing in the
 * lifecycle barrel imports it.
 *
 * Import this module from App.svelte (or another init entry) to install
 * the subscriptions. The subscriptions are registered at import time
 * (module side-effect) matching the original search-sync.ts pattern.
 */
import { subscribe, EVENTS } from '@lib/orchestration/event-bus';
import { updateJourneyCompass } from '@lib/orchestration/compass-controller';
import { refreshCompositionState } from '@lib/stores/lifecycle/modes';
import { recordEmptySearch } from '@lib/stores/lifecycle/search-sync';
import { setActiveResult, setSearchStatus } from '@lib/stores/search.svelte';
import { returnToOverview, recenterFocusedNode } from './lifecycle';
import { traverseNeighbor } from '@lib/journey/thread-settler-adapter';
import { navStore } from '@lib/stores/navigation.svelte';
import { activeClusterFilter } from '@lib/stores/filter.svelte';
import {
  addTrailStop,
  setThreadCandidates,
  setTrailDepth,
  setTrailNeighborIndices
} from '@lib/stores/journey.svelte';
import { getBusinessRecords } from '@lib/data-store';
import {
  buildNeighborhoodManifest,
  getSemanticThreadDisplayLimit
} from '@lib/journey/neighborhood';
import { state as legacyState, withStateMutation } from '@legacy-js/state.js';
import { get } from 'svelte/store';

// ── Keyboard Support ──────────────────────────────────────────────────────────

function isKeyboardTextEntryTarget(target: HTMLElement): boolean {
  if (!target || typeof target.tagName !== 'string') return false;
  const tagName = target.tagName.toLowerCase();
  const type = (target as HTMLInputElement).type?.toLowerCase() ?? '';
  return (
    (tagName === 'input' && ['text', 'search', 'email', 'url', 'password'].includes(type)) ||
    tagName === 'textarea' ||
    target.isContentEditable
  );
}

/**
 * Top-level keydown handler for the application shell.
 * Replaces the imperative listeners from global-bindings.js.
 */
export function handleGlobalKeydown(event: KeyboardEvent): void {
  const target = event.target as HTMLElement;
  if (isKeyboardTextEntryTarget(target)) return;

  const key = event.key;

  if (key === 'Escape') {
    // Check if we have anything to reset
    const nav = get(navStore);
    if (nav.focusedIndex !== null || nav.currentView !== 'galaxy' || get(activeClusterFilter) !== null) {
      event.preventDefault();
      returnToOverview();
    }
    return;
  }

  if (key === 'ArrowLeft' || key === 'ArrowUp') {
    event.preventDefault();
    traverseNeighbor(-1);
  } else if (key === 'ArrowRight' || key === 'ArrowDown') {
    event.preventDefault();
    traverseNeighbor(1);
  } else if (key === 'Home') {
    event.preventDefault();
    returnToOverview();
  } else if (key === 'End' || (key === 'c' && !event.ctrlKey && !event.metaKey)) {
    event.preventDefault();
    recenterFocusedNode();
  }
}

// ── Search → Compass Subscriptions ────────────────────────────────────────────
//
// These were previously in search-sync.ts at module scope.  Moving them
// here eliminates search-sync's import of compass-controller, which was
// the reverse edge of the cycle.

subscribe(EVENTS.SEARCH_SUCCESS, () => {
  refreshCompositionState();
  updateJourneyCompass();
});

subscribe(EVENTS.SEARCH_EMPTY, ({ query }) => {
  refreshCompositionState();
  updateJourneyCompass();
  recordEmptySearch(query);
});

subscribe(EVENTS.SEARCH_STARTED, () => {
  refreshCompositionState();
});

subscribe(EVENTS.SEARCH_CLEARED, () => {
  refreshCompositionState();
  updateJourneyCompass();
});

subscribe(EVENTS.SEARCH_FOCUS_TRANSITION_STARTED, () => {
  refreshCompositionState();
  updateJourneyCompass();
});

subscribe(EVENTS.SEARCH_FOCUS_TRANSITION_SETTLED, () => {
  refreshCompositionState();
  updateJourneyCompass();
});

// ── Engine → Compass Subscriptions ───────────────────────────────────────────
//
// These were previously in compass-controller.ts at module scope.
// Moving them here keeps all cross-module event wiring in one place.

// CAMERA_NODE_FOCUSED is published by the legacy focusOnNode() (called from
// canvas clicks, traversal, and the search focus pipeline). The Svelte
// navStore needs a mirror so FocusPocket, ThreadInspector, and the focus
// stage render with the new anchor. We preserve an existing 'focus-search'
// surface so a search-result click that emits CAMERA_NODE_FOCUSED right
// after SEARCH_FOCUS_REQUESTED keeps its search context.
subscribe(EVENTS.CAMERA_NODE_FOCUSED, (payload: { index?: number; point?: unknown; options?: Record<string, unknown> } = {} as any) => {
  const index = Number((payload as any)?.index);
  if (Number.isFinite(index) && index >= 0) {
    navStore.update((s) => ({
      ...s,
      focusedIndex: index,
      mode: 'focus',
      surface: s.surface === 'focus-search' ? s.surface : 'focus',
      trailDepth: Math.max(1, s.trailDepth ?? 0)
    }));
  }
  updateJourneyCompass();
});
subscribe(EVENTS.EXPLORATION_DEPTH_CHANGED, updateJourneyCompass);
subscribe(EVENTS.STATE_RESET, updateJourneyCompass);

// ── Search Focus → Nav Subscriptions ─────────────────────────────────────────
//
// Ported from js/modules/app.ts subscribeKeyed('app:search-focus-requested', ...).
// The Svelte migration owns focus/nav state in navState; we set the focused
// index + mode here so FocusPocket, ThreadInspector, and the focus stage
// reactively render. The legacy engine reads the same focus state via its
// own state mirror.

subscribe(EVENTS.SEARCH_FOCUS_REQUESTED, ({ index }: { index: number }) => {
  if (!Number.isFinite(index)) return;
  const manifest = buildNeighborhoodManifest(index, [], {
    displayLimit: getSemanticThreadDisplayLimit()
  });
  const candidateIndices = manifest?.candidateIndices ?? [];
  const threadSource = manifest && manifest.anchorEdgeCount > 0 ? 'semantic' : 'geometric-fallback';
  const threadReasonByIndex = new Map(
    candidateIndices.map((candidateIndex) => [
      candidateIndex,
      threadSource === 'semantic' ? 'semantic neighbor' : 'geometric proximity'
    ])
  );
  navStore.update((s) => ({
    ...s,
    focusedIndex: index,
    mode: 'focus',
    surface: 'focus-search',
    trailDepth: 1,
    trailSeedIndex: index,
    trailNeighborIndices: candidateIndices,
    threadCandidates: candidateIndices,
    threadReasonByIndex,
    threadSource
  }));
  withStateMutation(() => {
    const nav = legacyState.navState as unknown as {
      trailSeedIndex?: number | null;
      trailNeighborIndices?: number[];
      threadCandidates?: Array<{ index: number; source: string; reason: string }>;
      threadReasonByIndex?: Map<number, string>;
      threadSource?: string;
    };
    nav.trailSeedIndex = index;
    nav.trailNeighborIndices = [...candidateIndices];
    nav.threadCandidates = candidateIndices.map((candidateIndex) => ({
      index: candidateIndex,
      source: threadSource,
      reason: threadReasonByIndex.get(candidateIndex) ?? 'nearby business relationship'
    }));
    nav.threadReasonByIndex = threadReasonByIndex;
    nav.threadSource = threadSource;
  });
  // Add the focused node as the first trail stop so MapSummary
  // (which gates on hasTrail() && trail.length > 0) renders.
  const records = getBusinessRecords();
  const record = records[Number(index)];
  addTrailStop({
    index: Number(index),
    name: record?.name ?? `Node ${index}`,
    reason: 'search-focus',
    visitedAt: Date.now()
  });
  setTrailNeighborIndices(candidateIndices);
  setThreadCandidates(candidateIndices, threadSource, threadReasonByIndex);
  setTrailDepth(1);
  setActiveResult(String(index));
  setSearchStatus('focusing');
  refreshCompositionState();
  updateJourneyCompass();
});
