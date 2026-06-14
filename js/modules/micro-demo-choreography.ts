import { state, withStateMutation } from '../state.ts';
import { animateCameraToNode, setAutoRotateSuspended } from './camera-controls.ts';
import { applyLocalNeighborhoodFocus, clearFocusPocketIndices, clearFocusPocketMeta } from './focus-pocket.ts';
import { refreshCompositionState, updateExplorationUi, resetNodePositions } from './lifecycle.ts';
import { updateJourneyCompass } from './journey-compass-controller.ts';
import { updateSelectedBusiness, applyPointFilterColors } from './journey.ts';
import { setInfoPanelOpen } from './bindings/panel-bindings.ts';
import { recordCompletion } from './micro-demo-guards.ts';
import { captureOverviewCameraSnapshot, animateCameraToOverview, cancelOverviewCameraAnimation } from './micro-demo-camera.ts';
import { showVeil, hideVeil, showPill, removePill, showEndToast, bindInputInterceptor, unbindInputInterceptor, injectMicroDemoStyles } from './micro-demo-ui.ts';

export const PHASE = {
  IDLE: 'idle',
  GLIDING: 'gliding',
  ARRIVED: 'arrived',
  CARD_VISIBLE: 'card_visible',
  PULLBACK: 'pullback',
  WIDE_VIEW: 'wide_view',
  RETURNING: 'returning',
  COMPLETE: 'complete',
  CANCELLED: 'cancelled'
};

let _demoPhase = PHASE.IDLE;
let _demoNodeIndex: number | null = null;
let _demoTimers: number[] = [];
let _demoCancelled = false;

export function getDemoPhase() { return _demoPhase; }
export function getDemoNodeIndex() { return _demoNodeIndex; }
export function isDemoCancelled() { return _demoCancelled; }
export function setDemoNodeIndex(idx: number | null) { _demoNodeIndex = idx; }

export function clearDemoTimers() {
  _demoTimers.forEach((t) => window.clearTimeout(t));
  _demoTimers = [];
}

export function resetRetryState() {
  _demoPhase = PHASE.IDLE;
  _demoNodeIndex = null;
  _demoCancelled = false;
}

function demoReset() {
  state.selectedPoint = null;
  withStateMutation(() => {
    state.navState.mode = 'overview';
    state.navState.focusedIndex = null;
    state.navState.trailSeedIndex = null;
    state.navState.trailNeighborIndices = [];
    state.navState.trailCursor = -1;
    state.navState.walkHistoryIndices = [];
  });
  clearFocusPocketIndices();
  clearFocusPocketMeta();
  state.focusCameraAssistActive = false;
  state.focusCameraOffset = null;
  state.focusTransitionMode = 'idle';
  document.body.dataset.focusTransition = '';
  document.body.dataset.focusTransitionPhase = '';
  if (state.controls) (state.controls as { enabled: boolean }).enabled = true;
  updateSelectedBusiness(null);
  applyPointFilterColors();
  refreshCompositionState();
  updateJourneyCompass();
  setInfoPanelOpen(true);
}

function demoFocusSetup(demoNode: number) {
  const point = state.points[demoNode];
  state.selectedPoint = point ?? null;
  withStateMutation(() => {
    state.navState.mode = 'focus';
    state.navState.focusedIndex = demoNode;
    state.navState.walkHistoryIndices = [demoNode];
  });
  updateSelectedBusiness(point, { revealCard: true });
  applyPointFilterColors();
  updateExplorationUi();
  updateJourneyCompass();
  refreshCompositionState();
  resetNodePositions();
  if (typeof applyLocalNeighborhoodFocus === 'function') {
    applyLocalNeighborhoodFocus(demoNode);
  }
}

function cleanup() {
  document.body.removeAttribute('data-demo-active');
  clearDemoTimers();
  cancelOverviewCameraAnimation();
  hideVeil();
  removePill();
  unbindInputInterceptor();
  _demoPhase = PHASE.IDLE;
  _demoNodeIndex = null;
  _demoCancelled = false;
}

function endDemo(notifyEvent: string, shouldRecordCompletion: boolean) {
  cleanup();
  setAutoRotateSuspended(false);
  if (shouldRecordCompletion) recordCompletion();
  document.dispatchEvent(new CustomEvent(notifyEvent));
}

export function runDemo(cancelMicroDemo: (reason: string) => void) {
  injectMicroDemoStyles();
  document.body.dataset.demoActive = 'true';
  _demoPhase = PHASE.GLIDING;
  _demoCancelled = false;
  captureOverviewCameraSnapshot();
  setAutoRotateSuspended(true);
  if (state.controls) (state.controls as { enabled: boolean }).enabled = false;
  showVeil(true);
  showPill('Demo -- watch how it works', (reason) => cancelMicroDemo(reason));
  bindInputInterceptor((reason) => cancelMicroDemo(reason));
  const demoNode = _demoNodeIndex as number;

  _demoTimers.push(window.setTimeout(() => {
    if (_demoCancelled) return;
    document.dispatchEvent(new CustomEvent('micro-demo-node-highlight', {
      detail: { index: demoNode, phase: 'glow' }
    }));
  }, 50));

  _demoTimers.push(window.setTimeout(() => {
    if (_demoCancelled) return;
    animateCameraToNode(demoNode, {
      transitionStyle: 'focus',
      duration: 1200,
      verticalLift: 0.05,
      distance: 0.45
    });
    document.dispatchEvent(new CustomEvent('micro-demo-node-highlight', {
      detail: { index: demoNode, phase: 'gliding' }
    }));
  }, 100));

  _demoTimers.push(window.setTimeout(() => {
    if (_demoCancelled) return;
    _demoPhase = PHASE.ARRIVED;
    demoFocusSetup(demoNode);
    document.body.dataset.focusOrigin = 'micro-demo';
    document.dispatchEvent(new CustomEvent('micro-demo-node-highlight', {
      detail: { index: demoNode, phase: 'arrived' }
    }));
  }, 1400));

  _demoTimers.push(window.setTimeout(() => {
    if (_demoCancelled) return;
    _demoPhase = PHASE.CARD_VISIBLE;
    document.dispatchEvent(new CustomEvent('micro-demo-name-pulse'));
  }, 1520));

  _demoTimers.push(window.setTimeout(() => {
    if (_demoCancelled) return;
    document.dispatchEvent(new CustomEvent('micro-demo-name-pulse'));
  }, 2520));

  _demoTimers.push(window.setTimeout(() => {
    if (_demoCancelled) return;
    _demoPhase = PHASE.PULLBACK;
    animateCameraToNode(demoNode, {
      transitionStyle: 'focus',
      duration: 1200,
      distance: 1.8,
      verticalLift: 0.12
    });
  }, 3320));

  _demoTimers.push(window.setTimeout(() => {
    if (_demoCancelled) return;
    _demoPhase = PHASE.WIDE_VIEW;
    document.dispatchEvent(new CustomEvent('micro-demo-node-highlight', {
      detail: { index: demoNode, phase: 'wide_view' }
    }));
    setInfoPanelOpen(false);
  }, 4520));

  _demoTimers.push(window.setTimeout(() => {
    if (_demoCancelled) return;
    _demoPhase = PHASE.RETURNING;
    demoReset();
    animateCameraToOverview(1000);
    document.dispatchEvent(new CustomEvent('micro-demo-node-highlight', {
      detail: { index: demoNode, phase: 'cleanup' }
    }));
  }, 4870));

  _demoTimers.push(window.setTimeout(() => {
    if (_demoCancelled) return;
    _demoPhase = PHASE.COMPLETE;
    showEndToast();
    endDemo('demo-complete', true);
  }, 5870));
}

export function cancelChoreography(reason = 'user-input') {
  if (_demoPhase === PHASE.IDLE || _demoPhase === PHASE.COMPLETE || _demoCancelled) return false;
  _demoCancelled = true;
  _demoPhase = PHASE.CANCELLED;
  clearDemoTimers();
  demoReset();
  if (state.camera && state.controls && (reason === 'escape-key' || reason === 'user-input')) {
    animateCameraToOverview(800);
  }
  const shouldRecord = reason === 'user-input' || reason === 'escape-key' || reason === 'skip-button';
  endDemo('demo-cancelled', shouldRecord);
  return true;
}

export function isMicroDemoRunning() {
  return _demoPhase !== PHASE.IDLE && _demoPhase !== PHASE.COMPLETE && _demoPhase !== PHASE.CANCELLED;
}
