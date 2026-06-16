// lifecycle-modes.js — Mode/depth setters, descriptions, bloom/bridge recomputation,
// composition refresh, exploration UI sync, and declarative event subscriptions
import { state, withStateMutation } from '@lib/engine/state-bridge';
import { publish, subscribe, EVENTS } from '@lib/orchestration/event-bus';
import { applyCompositionState } from './composition-state.ts';
import { applyPointFilterColors } from './journey.ts';
import { appState } from '@lib/state/app.svelte';

interface ModeOptions {
  skipUrlSync?: boolean;
  fromUserGesture?: boolean;
  allowDiveExit?: boolean;
}

interface PointLike {
  status?: string;
  website?: string;
  what?: string;
  public_note?: string;
  public_detail?: string;
  [key: string]: unknown;
}

// ── Descriptions ────────────────────────────────────────────────────────────

export const MODE_DESCRIPTIONS = {
  default: 'County-wide overview across all visible records.',
  bloom: 'Living records with high relationship potential.',
  bridge: 'Connective nodes linking disparate county themes.',
  trail: 'Focused path of related business entities.',
  inside: 'Immersive exploration of local neighborhoods.'
};

export const STORY_DESCRIPTIONS = {
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

export function refreshCompositionState() {
  applyCompositionState({ state, root: document.body });
  publish(EVENTS.COMPOSITION_UPDATED);
}

export function updateExplorationUi() {
  refreshCompositionState();
}

// ── Mode setters ────────────────────────────────────────────────────────────

export function setMyceliumMode(mode: string, options: ModeOptions = {}) {
  if (appState.myceliumMode === mode) return;
  state.myceliumMode = mode;
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
  applyPointFilterColors();
  if (!options.skipUrlSync) {
    publish(EVENTS.VIEW_CHANGED, { myceliumMode: mode });
  }
  updateExplorationUi();
}

export function setTrailDepth(depth: number | string, options: ModeOptions = {}) {
  const prevDepth = Number(appState.trailDepth || 0);
  const nextDepth = Number.isFinite(Number(depth)) ? Number(depth) : 0;
  const enteringSemanticDive = nextDepth === 2 && prevDepth < 2;
  const leavingSemanticDive = prevDepth >= 2 && nextDepth < 2;
  if (enteringSemanticDive && !options.fromUserGesture) {
    return;
  }
  if (leavingSemanticDive && !options.fromUserGesture && !options.allowDiveExit) {
    return;
  }
  state.trailDepth = nextDepth;
  withStateMutation(() => {
    state.navState.trailDepth = nextDepth;
    if (nextDepth >= 2) state.navState.mode = 'inside';
    else if (nextDepth > 0 && appState.navState?.mode !== 'focus') state.navState.mode = 'trail';
  });
  if (!options.skipUrlSync) {
    publish(EVENTS.EXPLORATION_DEPTH_CHANGED, { depth: nextDepth });
  }
  updateExplorationUi();
}

export function setSemanticDiveMode(enabled: boolean) {
  const nextActive = !!enabled;
  state.semanticDiveMode = nextActive;
  if (nextActive) {
    if (document.body) document.body.dataset.semanticDive = 'transitioning';
    setTrailDepth(2, { fromUserGesture: true });
    window.setTimeout(() => {
      if (appState.semanticDiveMode && document.body?.dataset.semanticDive === 'transitioning') {
        document.body.dataset.semanticDive = 'active';
      }
    }, 820);
  } else {
    setTrailDepth(1, { allowDiveExit: true, skipUrlSync: true });
  }
  updateExplorationUi();
}

// ── Internal helpers ────────────────────────────────────────────────────────

function recomputeBloomIndices() {
  state.bloomIndices = new Set(
    ((appState.points || []) as PointLike[])
      .map((point, index) => ({ point, index }))
      .filter(({ point }) => point.status === 'active' && point.website)
      .map(({ index }) => index)
  );
  return state.bloomIndices;
}

function recomputeBridgeIndices() {
  state.bridgeIndices = new Set(
    ((appState.points || []) as PointLike[])
      .map((point, index) => ({ point, index }))
      .filter(({ point }) => {
        const text = `${point?.what || ''} ${point?.public_note || ''} ${point?.public_detail || ''}`.toLowerCase();
        return text.includes('bridge') || text.includes('network') || text.includes('community');
      })
      .map(({ index }) => index)
  );
  return state.bridgeIndices;
}

// ── Declarative event subscriptions ─────────────────────────────────────────

subscribe(EVENTS.DIVE_MODE_REQUESTED, (payload: Record<string, unknown>) => {
  setSemanticDiveMode(!!payload.enabled);
});

subscribe(EVENTS.TRAIL_DEPTH_UPDATE_REQUESTED, (payload: Record<string, unknown>) => {
  setTrailDepth(payload.depth as number | string, payload.options as ModeOptions);
});
