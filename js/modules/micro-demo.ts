/**
 * js/modules/micro-demo.ts
 *
 * TypeScript shadow of micro-demo.js.
 * Micro-demo facade re-exporting public API.
 */
import { state } from '../state.js';
import { animateCameraToNode, setAutoRotateSuspended } from './camera-controls.js';
import { applyLocalNeighborhoodFocus, clearFocusPocketIndices, clearFocusPocketMeta } from './focus-pocket.js';
import { debugWarn } from './diagnostic-adapter.js';
import { refreshCompositionState, updateExplorationUi, resetNodePositions } from './lifecycle.js';
import { updateJourneyCompass } from './journey-compass-controller.js';
import { updateSelectedBusiness, applyPointFilterColors } from './journey.js';
import { setInfoPanelOpen } from './bindings/panel-bindings.js';
import {
    isAppReadyForDemo, guardNotSeen, guardReducedMotion, guardWebGL, guardUrlParam,
    recordCompletion, notifyDemoUnableToStart, SESSION_STORAGE_KEY
} from './micro-demo-guards.js';
import {
    captureOverviewCameraSnapshot, animateCameraToOverview
} from './micro-demo-camera.js';
import {
    showVeil, hideVeil, showPill, removePill, showEndToast,
    bindInputInterceptor, unbindInputInterceptor, injectMicroDemoStyles
} from './micro-demo-ui.js';

const DEMO_START_DELAY_MS = 25000;

const PHASE = {
    IDLE: 'idle',
    GLIDING: 'gliding',
    ARRIVED: 'arrived',
    CARD_VISIBLE: 'card_visible',
    PULLBACK: 'pullback',
    WIDE_VIEW: 'wide_view',
    RETURNING: 'returning',
    COMPLETE: 'complete',
    CANCELLED: 'cancelled'
} as const;

const SHOWCASE_POOL = [50, 707, 1525, 2908, 3899, 4102, 6684, 7938];
const _shuffledPool = [...SHOWCASE_POOL].sort(() => Math.random() - 0.5);

let _demoPhase: string = PHASE.IDLE;
let _demoNodeIndex: number | null = null;
let _demoTimers: ReturnType<typeof setTimeout>[] = [];
let _demoCancelled = false;
let _startRetryTimer: ReturnType<typeof setTimeout> | null = null;
let _startRetryDeadline = 0;
let _startRetryCount = 0;
const MAX_START_RETRIES = 100;

function _clearDemoTimers(): void {
    _demoTimers.forEach((t) => window.clearTimeout(t));
    _demoTimers = [];
    if (_startRetryTimer !== null) {
        window.clearTimeout(_startRetryTimer);
        _startRetryTimer = null;
    }
    _startRetryDeadline = 0;
}

function _getDemoNode(): number | null {
    for (const idx of _shuffledPool) {
        const point = state.points[idx];
        if (!point) continue;
        if (point.status === 'disqualified') continue;
        const name = (point.name || '').trim();
        if (!name || name.length < 3) continue;
        return idx;
    }
    if (!state.points || !state.points.length) return null;
    for (let i = 0; i < state.points.length; i++) {
        const point = state.points[i];
        if (!point) continue;
        if (point.status === 'disqualified') continue;
        const name = (point.name || '').trim();
        if (!name || name.length < 3) continue;
        return i;
    }
    return null;
}

function __demoReset(): void {
    state.selectedPoint = null;
    state.navState.mode = 'overview';
    state.navState.focusedIndex = null;
    state.navState.trailSeedIndex = null;
    state.navState.trailNeighborIndices = [];
    state.navState.trailCursor = -1;
    state.navState.walkHistoryIndices = [];
    clearFocusPocketIndices();
    clearFocusPocketMeta();
    (state as any).focusCameraAssistActive = false;
    (state as any).focusCameraOffset = null;
    state.focusTransitionMode = 'idle';
    document.body.dataset.focusTransition = '';
    document.body.dataset.focusTransitionPhase = '';
    if (state.controls) (state.controls as any).enabled = true;
    updateSelectedBusiness(null);
    applyPointFilterColors();
    refreshCompositionState();
    updateJourneyCompass();
    setInfoPanelOpen(true);
}

function __demoFocusSetup(demoNode: number): void {
    const point = state.points[demoNode];
    state.selectedPoint = point;
    state.navState.mode = 'focus';
    state.navState.focusedIndex = demoNode;
    state.navState.walkHistoryIndices = [demoNode];
    updateSelectedBusiness(point, { revealCard: true });
    applyPointFilterColors();
    updateExplorationUi();
    updateJourneyCompass('focus');
    refreshCompositionState();
    if (typeof window !== 'undefined' && typeof (window as any).resetNodePositions === 'function') {
        (window as any).resetNodePositions();
    } else {
        resetNodePositions();
    }
    if (typeof applyLocalNeighborhoodFocus === 'function') {
        applyLocalNeighborhoodFocus(demoNode);
    }
}

function _resetAppState(): void {
    __demoReset();
}

function _runDemo(): void {
    injectMicroDemoStyles();
    document.body.dataset.demoActive = 'true';
    _demoPhase = PHASE.GLIDING;
    _demoCancelled = false;
    captureOverviewCameraSnapshot();
    setAutoRotateSuspended(false);
    if (state.controls) (state.controls as any).enabled = false;
    showVeil(true);
    showPill('Demo -- watch how it works', (reason: string) => cancelMicroDemo(reason));
    bindInputInterceptor((reason: string) => cancelMicroDemo(reason));
    const demoNode = _demoNodeIndex!;

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
        __demoFocusSetup(demoNode);
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
        _resetAppState();
        animateCameraToOverview(1000);
        document.dispatchEvent(new CustomEvent('micro-demo-node-highlight', {
            detail: { index: demoNode, phase: 'cleanup' }
        }));
    }, 7800));

    _demoTimers.push(window.setTimeout(() => {
        if (_demoCancelled) return;
        _demoPhase = PHASE.COMPLETE;
        showEndToast();
        _endDemo('demo-complete', true);
    }, 8800));
}

function _cleanup(): void {
    document.body.removeAttribute('data-demo-active');
    _clearDemoTimers();
    hideVeil();
    removePill();
    unbindInputInterceptor();
    _demoPhase = PHASE.IDLE;
    _demoNodeIndex = null;
    _demoCancelled = false;
}

function _endDemo(notifyEvent: string, shouldRecordCompletion: boolean): void {
    _cleanup();
    setAutoRotateSuspended(false);
    if (shouldRecordCompletion) recordCompletion();
    window.dispatchEvent(new CustomEvent(notifyEvent));
}

export function initMicroDemo(): void {
    const params = new URLSearchParams(window.location.search);
    const forceDemo = params.has('demo') && params.get('demo') === 'force';
    if (!forceDemo) {
        if (!guardNotSeen()) { debugWarn('[demo] blocked -- already seen'); return; }
        if (!guardReducedMotion()) { debugWarn('[demo] blocked -- reduced motion'); return; }
        if (!guardWebGL()) { debugWarn('[demo] blocked -- no WebGL / software renderer'); return; }
        if (!guardUrlParam()) { debugWarn('[demo] blocked -- nodemo URL param'); return; }
    }
    startMicroDemo();
}

export function shouldRunMicroDemo(): boolean {
    const params = new URLSearchParams(window.location.search);
    const forceDemo = params.get('demo') === 'force';
    if (!forceDemo && sessionStorage.getItem(SESSION_STORAGE_KEY)) return false;
    if (!isAppReadyForDemo()) return false;
    return true;
}

export function startMicroDemo(): void {
    if (_demoPhase !== PHASE.IDLE) return;
    const params = new URLSearchParams(window.location.search);
    const forceDemo = params.get('demo') === 'force';
    if (!forceDemo && sessionStorage.getItem(SESSION_STORAGE_KEY)) return;
    if (!isAppReadyForDemo()) {
        const now = performance.now();
        if (!_startRetryDeadline) {
            _startRetryDeadline = now + DEMO_START_DELAY_MS;
            _startRetryCount = 0;
        }
        if (now < _startRetryDeadline && _startRetryCount < MAX_START_RETRIES) {
            _startRetryCount++;
            _startRetryTimer = window.setTimeout(() => {
                _startRetryTimer = null;
                startMicroDemo();
            }, 150);
            return;
        }
        try { sessionStorage.setItem(SESSION_STORAGE_KEY, 'skipped-no-conditions'); } catch {}
        notifyDemoUnableToStart();
        return;
    }
    const node = _getDemoNode();
    if (node === null) {
        try { sessionStorage.setItem(SESSION_STORAGE_KEY, 'skipped-no-node'); } catch {}
        notifyDemoUnableToStart();
        return;
    }
    try { sessionStorage.setItem(SESSION_STORAGE_KEY, new Date().toISOString()); } catch {}
    _startRetryDeadline = 0;
    _demoNodeIndex = node;
    _runDemo();
}

export function cancelMicroDemo(reason = 'user-input'): void {
    if (_demoPhase === PHASE.IDLE || _demoPhase === PHASE.COMPLETE || _demoCancelled) return;
    _demoCancelled = true;
    _demoPhase = PHASE.CANCELLED;
    _clearDemoTimers();
    _resetAppState();
    if (state.camera && state.controls && (reason === 'escape-key' || reason === 'user-input')) {
        animateCameraToOverview(800);
    }
    const shouldRecord = reason === 'user-input' || reason === 'escape-key' || reason === 'skip-button';
    _endDemo('demo-cancelled', shouldRecord);
}

export function isMicroDemoRunning(): boolean {
    return _demoPhase !== PHASE.IDLE && _demoPhase !== PHASE.COMPLETE && _demoPhase !== PHASE.CANCELLED;
}
