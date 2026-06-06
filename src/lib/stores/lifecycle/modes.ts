/**
 * @lib/stores/lifecycle/modes.ts — Port of js/modules/lifecycle-modes.js
 *
 * Mode/depth setters, descriptions, bloom/bridge recomputation,
 * composition refresh, exploration UI sync, and declarative event subscriptions.
 *
 * Writes to: navStore, journeyStore, focusStore, businessRecords.
 * Reads from: all of the above.
 * Publishes: VIEW_CHANGED, EXPLORATION_DEPTH_CHANGED, COMPOSITION_UPDATED.
 */
import { get } from 'svelte/store';
import { navStore } from '@lib/stores/navigation';
import { journeyStore } from '@lib/stores/journey';
import { focusStore } from '@lib/stores/focus';
import { searchStore } from '@lib/stores/search';
import { businessRecords } from '@lib/data-store';
import { publish, subscribe, EVENTS } from '@lib/orchestration/event-bus';
import type { BusinessRecord } from '@lib/types/business';

// ── Module-level index storage ──────────────────────────────────────────────
// Preserves bloom/bridge indices for the Three.js engine bridge to consume.
// The JS original writes to state.bloomIndices / state.bridgeIndices directly.
// These are module-level Sets readable via getter exports.
let _bloomIndices = new Set<number>();
let _bridgeIndices = new Set<number>();

/** Read access for bloom indices (consumed by Three.js engine bridge). */
export function getBloomIndices(): ReadonlySet<number> {
  return _bloomIndices;
}

/** Read access for bridge indices (consumed by Three.js engine bridge). */
export function getBridgeIndices(): ReadonlySet<number> {
  return _bridgeIndices;
}

// ── Descriptions ────────────────────────────────────────────────────────────

export const MODE_DESCRIPTIONS: Record<string, string> = {
  default: 'County-wide overview across all visible records.',
  bloom: 'Living records with high relationship potential.',
  bridge: 'Connective nodes linking disparate county themes.',
  trail: 'Focused path of related business entities.',
  inside: 'Immersive exploration of local neighborhoods.'
};

export const STORY_DESCRIPTIONS: Record<string, string> = {
  standard: 'A semantic journey through Montgomery County.',
  market: 'Market exploration through business relationships.',
  civic: 'Civic connectivity across community anchors.',
  growth: 'Economic growth and development pathways.',
  'signal-rich': 'Explore the densest local business clusters with high relationship potential.',
  'bridge-businesses': 'Explore connectors between business communities.',
  'mapped-food': 'Follow food trails across the county map.',
  'disqualified-ghosts': 'View records that are disqualified but still present in the corpus.'
};

// ── Composition & exploration UI ────────────────────────────────────────────

/**
 * Refresh composition state by syncing body data attributes from stores.
 * Replaces legacy applyCompositionState({ state, root: document.body }).
 * Publishes COMPOSITION_UPDATED after sync.
 */
export function refreshCompositionState(): void {
  const $nav = get(navStore);
  const $search = get(searchStore);
  const $focus = get(focusStore);

  if (typeof document !== 'undefined' && document.body) {
    document.body.dataset.navMode = $nav.mode;
    document.body.dataset.panelSurface = $nav.surface;
    document.body.dataset.viewMode = $nav.currentView;
    document.body.dataset.searchStatus = $search.status;
    document.body.dataset.focusTransition = $focus.transitionMode;
    document.body.dataset.semanticDive = String($focus.semanticDiveMode);
  }

  publish(EVENTS.COMPOSITION_UPDATED);
}

export function updateExplorationUi(): void {
  refreshCompositionState();
}

// ── Mode setters ────────────────────────────────────────────────────────────

export function setMyceliumMode(
  mode: string,
  options: { skipUrlSync?: boolean } = {}
): void {
  const currentMode = get(navStore).myceliumMode;
  if (currentMode === mode) return;

  navStore.update((s) => ({ ...s, myceliumMode: mode }));

  if (mode === 'bloom') {
    recomputeBloomIndices();
  }
  if (mode === 'bridge') {
    recomputeBridgeIndices();
  }
  if (mode === 'trail') {
    setTrailDepth(1, { ...options, skipUrlSync: true });
  }
  if (mode === 'inside') {
    setTrailDepth(2, { ...options, fromUserGesture: true, skipUrlSync: true });
  }

  if (!options.skipUrlSync) {
    publish(EVENTS.VIEW_CHANGED, { myceliumMode: mode });
  }

  updateExplorationUi();
}

export function setTrailDepth(
  depth: number,
  options: {
    fromUserGesture?: boolean;
    skipUrlSync?: boolean;
    allowDiveExit?: boolean;
  } = {}
): void {
  const prevDepth = Number(get(journeyStore).trailDepth || 0);
  const nextDepth = Number.isFinite(Number(depth)) ? Number(depth) : 0;
  const enteringSemanticDive = nextDepth === 2 && prevDepth < 2;
  const leavingSemanticDive = prevDepth >= 2 && nextDepth < 2;

  if (enteringSemanticDive && !options.fromUserGesture) {
    return;
  }
  if (leavingSemanticDive && !options.fromUserGesture && !options.allowDiveExit) {
    return;
  }

  journeyStore.update((s) => ({ ...s, trailDepth: nextDepth }));
  navStore.update((s) => ({
    ...s,
    trailDepth: nextDepth,
    mode: nextDepth >= 2
      ? ('inside' as const)
      : nextDepth > 0 && s.mode !== 'focus'
        ? ('trail' as const)
        : s.mode
  }));

  if (!options.skipUrlSync) {
    publish(EVENTS.EXPLORATION_DEPTH_CHANGED, { depth: nextDepth });
  }

  updateExplorationUi();
}

export function setSemanticDiveMode(enabled: boolean): void {
  const nextActive = !!enabled;
  focusStore.update((s) => ({ ...s, semanticDiveMode: nextActive }));

  if (nextActive) {
    if (document.body) document.body.dataset.semanticDive = 'transitioning';
    setTrailDepth(2, { fromUserGesture: true });
    window.setTimeout(() => {
      const $focus = get(focusStore);
      if ($focus.semanticDiveMode && document.body?.dataset.semanticDive === 'transitioning') {
        document.body.dataset.semanticDive = 'active';
      }
    }, 820);
  } else {
    setTrailDepth(1, { allowDiveExit: true, skipUrlSync: true });
  }

  updateExplorationUi();
}

// ── Internal helpers ────────────────────────────────────────────────────────

function recomputeBloomIndices(): Set<number> {
  const points = get(businessRecords);
  _bloomIndices = new Set(
    (points ?? [])
      .map((point: BusinessRecord, index: number) => ({ point, index }))
      .filter(({ point }) => point.status === 'active' && point.website)
      .map(({ index }) => index)
  );
  return _bloomIndices;
}

function recomputeBridgeIndices(): Set<number> {
  const points = get(businessRecords);
  _bridgeIndices = new Set(
    (points ?? [])
      .map((point: BusinessRecord, index: number) => ({ point, index }))
      .filter(({ point }) => {
        const text = `${point.what || ''} ${point.public_note || ''} ${point.public_detail || ''}`.toLowerCase();
        return text.includes('bridge') || text.includes('network') || text.includes('community');
      })
      .map(({ index }) => index)
  );
  return _bridgeIndices;
}

// ── Declarative event subscriptions ─────────────────────────────────────────

subscribe(EVENTS.DIVE_MODE_REQUESTED, ({ enabled }) => {
  setSemanticDiveMode(enabled);
});

subscribe(EVENTS.TRAIL_DEPTH_UPDATE_REQUESTED, ({ depth, options }) => {
  setTrailDepth(depth, options ?? {});
});
