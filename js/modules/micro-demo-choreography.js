// js/modules/micro-demo-choreography.js
// Choreography state machine, focus setup, reset, and timed phase chain.

import { state, withStateMutation } from '../state.js';
import { animateCameraToNode, setAutoRotateSuspended } from './camera-controls.js';
import { applyLocalNeighborhoodFocus, clearFocusPocketIndices, clearFocusPocketMeta } from './focus-pocket.js';
import { refreshCompositionState, updateExplorationUi, resetNodePositions } from './lifecycle.js';
import { updateJourneyCompass } from './journey-compass-controller.js';
import { updateSelectedBusiness, applyPointFilterColors } from './journey.js';
import { setInfoPanelOpen } from './bindings/panel-bindings.js';
import { recordCompletion } from './micro-demo-guards.js';
import { captureOverviewCameraSnapshot, animateCameraToOverview, cancelOverviewCameraAnimation } from './micro-demo-camera.js';
import { showVeil, hideVeil, showPill, removePill, showEndToast, bindInputInterceptor, unbindInputInterceptor, injectMicroDemoStyles } from './micro-demo-ui.js';

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
let _demoNodeIndex = null;
let _demoTimers = [];
let _demoCancelled = false;

export function getDemoPhase() { return _demoPhase; }
export function getDemoNodeIndex() { return _demoNodeIndex; }
export function isDemoCancelled() { return _demoCancelled; }
export function setDemoNodeIndex(idx) { _demoNodeIndex = idx; }

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
  if (state.controls) state.controls.enabled = true;
  updateSelectedBusiness(null);
  applyPointFilterColors();
  refreshCompositionState();
  updateJourneyCompass();
  setInfoPanelOpen(true);
}

function demoFocusSetup(demoNode) {
  const point = state.points[demoNode];
  state.selectedPoint = point;
  withStateMutation(() => {
    state.navState.mode = 'focus';
    state.navState.focusedIndex = demoNode;
    state.navState.walkHistoryIndices = [demoNode];
  });
  updateSelectedBusiness(point, { revealCard: true });
  applyPointFilterColors();
  updateExplorationUi();
  updateJourneyCompass('focus');
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

function endDemo(notifyEvent, shouldRecordCompletion) {
  cleanup();
  setAutoRotateSuspended(false);
  if (shouldRecordCompletion) recordCompletion();
  document.dispatchEvent(new CustomEvent(notifyEvent));
}

export function runDemo(cancelMicroDemo) {
  injectMicroDemoStyles();
  document.body.dataset.demoActive = 'true';
  _demoPhase = PHASE.GLIDING;
  _demoCancelled = false;
  captureOverviewCameraSnapshot();
  setAutoRotateSuspended(true);
  if (state.controls) state.controls.enabled = false;
  showVeil(true);
  showPill('Demo -- watch how it works', (reason) => cancelMicroDemo(reason));
  bindInputInterceptor((reason) => cancelMicroDemo(reason));
  const demoNode = _demoNodeIndex;

  _demoTimers.push(window.setTimeout(() => {
    if (_demoCancelled) return;
    document.dispatchEvent(new CustomEvent('micro-demo-node-highlight', {
      detail: { index: demoNode, phase: 'glow' }
    }));
  }, 200));

  _demoTimers.push(window.setTimeout(() => {
    if (_demoCancelled) return;
    animateCameraToNode(demoNode, {
      transitionStyle: 'focus',
      duration: 1600,
      verticalLift: 0.05,
      distance: 0.45
    });
    document.dispatchEvent(new CustomEvent('micro-demo-node-highlight', {
      detail: { index: demoNode, phase: 'gliding' }
    }));
  }, 800));

  _demoTimers.push(window.setTimeout(() => {
    if (_demoCancelled) return;
    _demoPhase = PHASE.ARRIVED;
    demoFocusSetup(demoNode);
    document.body.dataset.focusOrigin = 'micro-demo';
    document.dispatchEvent(new CustomEvent('micro-demo-node-highlight', {
      detail: { index: demoNode, phase: 'arrived' }
    }));
  }, 2400));

  _demoTimers.push(window.setTimeout(() => {
    if (_demoCancelled) return;
    _demoPhase = PHASE.CARD_VISIBLE;
    document.dispatchEvent(new CustomEvent('micro-demo-name-pulse'));
  }, 3000));

  _demoTimers.push(window.setTimeout(() => {
    if (_demoCancelled) return;
    document.dispatchEvent(new CustomEvent('micro-demo-name-pulse'));
  }, 4500));

  _demoTimers.push(window.setTimeout(() => {
    if (_demoCancelled) return;
    _demoPhase = PHASE.PULLBACK;
    animateCameraToNode(demoNode, {
      transitionStyle: 'focus',
      duration: 1200,
      distance: 1.8,
      verticalLift: 0.12
    });
  }, 6000));

  _demoTimers.push(window.setTimeout(() => {
    if (_demoCancelled) return;
    _demoPhase = PHASE.WIDE_VIEW;
    document.dispatchEvent(new CustomEvent('micro-demo-node-highlight', {
      detail: { index: demoNode, phase: 'wide_view' }
    }));
    setInfoPanelOpen(false);
  }, 7200));

  _demoTimers.push(window.setTimeout(() => {
    if (_demoCancelled) return;
    _demoPhase = PHASE.RETURNING;
    demoReset();
    animateCameraToOverview(1000);
    document.dispatchEvent(new CustomEvent('micro-demo-node-highlight', {
      detail: { index: demoNode, phase: 'cleanup' }
    }));
  }, 7800));

  _demoTimers.push(window.setTimeout(() => {
    if (_demoCancelled) return;
    _demoPhase = PHASE.COMPLETE;
    showEndToast();
    endDemo('demo-complete', true);
  }, 8800));
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
