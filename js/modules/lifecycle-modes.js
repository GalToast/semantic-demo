// lifecycle-modes.js — Mode/depth setters, descriptions, bloom/bridge recomputation,
// composition refresh, exploration UI sync, and declarative event subscriptions
import { state, withStateMutation } from '../state.js';
import { publish, subscribe, EVENTS } from './event-bus.js';
import { applyCompositionState } from './composition-state.js';
import { applyPointFilterColors } from './journey.js';
import {
  getMyceliumMode, getTrailDepth, getNavState,
  getSemanticDiveMode, getPoints
} from '../state/selectors/index.js';

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

export function setMyceliumMode(mode, options = {}) {
  if (getMyceliumMode() === mode) return;
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

export function setTrailDepth(depth, options = {}) {
  const prevDepth = Number(getTrailDepth() || 0);
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
    else if (nextDepth > 0 && getNavState()?.mode !== 'focus') state.navState.mode = 'trail';
  });
  if (!options.skipUrlSync) {
    publish(EVENTS.EXPLORATION_DEPTH_CHANGED, { depth: nextDepth });
  }
  updateExplorationUi();
}

export function setSemanticDiveMode(enabled) {
  const nextActive = !!enabled;
  state.semanticDiveMode = nextActive;
  if (nextActive) {
    if (document.body) document.body.dataset.semanticDive = 'transitioning';
    setTrailDepth(2, { fromUserGesture: true });
    window.setTimeout(() => {
      if (getSemanticDiveMode() && document.body?.dataset.semanticDive === 'transitioning') {
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
    (getPoints() || [])
      .map((point, index) => ({ point, index }))
      .filter(({ point }) => point.status === 'active' && point.website)
      .map(({ index }) => index)
  );
  return state.bloomIndices;
}

function recomputeBridgeIndices() {
  state.bridgeIndices = new Set(
    (getPoints() || [])
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

subscribe(EVENTS.DIVE_MODE_REQUESTED, ({ enabled }) => {
  setSemanticDiveMode(enabled);
});

subscribe(EVENTS.TRAIL_DEPTH_UPDATE_REQUESTED, ({ depth, options }) => {
  setTrailDepth(depth, options);
});
