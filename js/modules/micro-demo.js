// js/modules/micro-demo.js
// Micro-demo: 10-second guided first-time interaction
// Fires once per browser session, shows new users the core interaction loop
// Spec: MICRO-DEMO-SPEC.md v1.0

import { state } from '../state.js';
import * as THREE from 'three';
import { easeInOutSine } from '../utils.js';
import { animateCameraToNode } from './camera-controls.js';
import { applyLocalNeighborhoodFocus, clearFocusPocketIndices, clearFocusPocketMeta } from './focus-pocket.js';

// === Constants ===
const SESSION_STORAGE_KEY = 'moco_mycelium_demo_session_v1';
const DEMO_START_DELAY_MS = 25000; // wait for scene reveal, app settle, and data

// State machine phases
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
};

// Hardcoded showcase pool — indices verified against bundle alignment
// Criteria: non-generic name, cluster has neighbors, status active
const SHOWCASE_POOL = [50, 707, 1525, 2908, 3899, 4102, 6684, 7938];

// Shuffle pool once at load time
const _shuffledPool = [...SHOWCASE_POOL].sort(() => Math.random() - 0.5);

// === Demo State ===
let _demoPhase = PHASE.IDLE;
let _demoNodeIndex = null;
let _demoTimers = [];
let _demoCancelled = false;
let _inputCleanup = null;
let _overviewCameraSnapshot = null;
let _startRetryTimer = null;
let _startRetryDeadline = 0;

// === Helpers ===

function _isAppReadyForDemo() {
    const overlay = document.getElementById('loading-overlay');
    return (
        state.currentView === 'galaxy' &&
        state.focusedNode === null &&
        !state.currentSearchSummary &&
        state.navState.mode === 'overview' &&
        !state.sceneRevealActive &&
        Array.isArray(state.points) &&
        state.points.length > 0 &&
        overlay && overlay.classList.contains('hidden')
    );
}

function _notifyDemoUnableToStart() {
    if (window.demoController?.isRunning?.()) {
        window.demoController.cancel();
        return;
    }
    window.dispatchEvent(new CustomEvent('demo-cancelled'));
}

function _getDemoNode() {
    // Try shuffled pool first
    for (const idx of _shuffledPool) {
        const point = state.points[idx];
        if (!point) continue;
        if (point.status === 'disqualified') continue;
        const name = (point.name || '').trim();
        if (!name || name.length < 3) continue;
        // Prefer geocoded nodes for richer card content
        return idx;
    }
    // Fallback: scan for any valid node
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

function _clearDemoTimers() {
    _demoTimers.forEach((t) => window.clearTimeout(t));
    _demoTimers = [];
    if (_startRetryTimer !== null) {
        window.clearTimeout(_startRetryTimer);
        _startRetryTimer = null;
    }
    _startRetryDeadline = 0;
}

function _captureOverviewCameraSnapshot() {
    if (!state.camera?.position?.clone || !state.controls?.target?.clone) return;
    _overviewCameraSnapshot = {
        camera: state.camera.position.clone(),
        target: state.controls.target.clone()
    };
}

function _getOverviewCameraSnapshot() {
    if (_overviewCameraSnapshot?.camera?.clone && _overviewCameraSnapshot?.target?.clone) {
        return {
            camera: _overviewCameraSnapshot.camera.clone(),
            target: _overviewCameraSnapshot.target.clone()
        };
    }
    return {
        camera: new THREE.Vector3(0, 3.5, 5),
        target: new THREE.Vector3(0, 0, 0)
    };
}

function _animateCameraToOverview(duration = 1000) {
    if (!state.camera || !state.controls) return;
    const startPos = state.camera.position.clone();
    const startTarget = state.controls.target.clone();
    const { camera: overviewPos, target: overviewTarget } = _getOverviewCameraSnapshot();
    const prefersReducedCameraMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
    if (prefersReducedCameraMotion) {
        state.camera.position.copy(overviewPos);
        state.controls.target.copy(overviewTarget);
        state.controls.update();
        return;
    }
    const startTime = performance.now();
    let _rafCancelled = false;

    function step(now) {
        if (_rafCancelled) return;
        const raw = (now - startTime) / duration;
        const t = Math.min(Math.max(raw, 0), 1);
        const eased = easeInOutSine(t);
        state.camera.position.lerpVectors(startPos, overviewPos, eased);
        state.controls.target.lerpVectors(startTarget, overviewTarget, eased);
        state.controls.update();
        if (t < 0.999) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
}

function _showVeil(active) {
    const veil = document.getElementById('micro-demo-veil');
    if (!veil) return;
    if (active) {
        // Force a reflow before adding active class so CSS transition fires
        void veil.offsetWidth;
        veil.classList.add('active');
        veil.removeAttribute('aria-hidden');
    } else {
        veil.classList.remove('active');
        veil.setAttribute('aria-hidden', 'true');
    }
}

function _bindInputInterceptor() {
    // Block canvas interactions during demo
    const canvasOverlay = document.createElement('div');
    canvasOverlay.id = 'micro-demo-blocker';
    Object.assign(canvasOverlay.style, {
        position: 'fixed',
        inset: '0',
        zIndex: '1', // Behind DOM UI, but above 3D canvas
        pointerEvents: 'all',
        cursor: 'default',
        background: 'transparent'
    });
    document.body.appendChild(canvasOverlay);

    // Cancel on any canvas/user interaction
    function onInput(e) {
        // Ignore interactions on sidebar/panel elements
        const tag = e.target.tagName.toLowerCase();
        if (tag === 'button' || tag === 'input' || tag === 'select' || tag === 'textarea') return;
        if (e.target.closest('#info-panel') || e.target.closest('.journey-compass')) return;
        cancelMicroDemo('user-input');
    }

    document.addEventListener('mousedown', onInput, { once: false, capture: true });
    document.addEventListener('touchstart', onInput, { once: false, capture: true });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') cancelMicroDemo('escape-key');
    }, { once: false, capture: true });

    _inputCleanup = () => {
        document.removeEventListener('mousedown', onInput, { capture: true });
        document.removeEventListener('touchstart', onInput, { capture: true });
        const existing = document.getElementById('micro-demo-blocker');
        if (existing) existing.remove();
        _inputCleanup = null;
    };
}

function _showPill(text) {
    const pill = document.createElement('div');
    pill.id = 'micro-demo-pill';
    pill.setAttribute('role', 'status');
    pill.setAttribute('aria-live', 'polite');
    Object.assign(pill.style, {
        position: 'fixed',
        top: '12px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: '9997',
        background: 'rgba(17, 24, 39, 0.85)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        border: '1px solid rgba(78, 205, 196, 0.3)',
        borderRadius: '9999px',
        padding: '6px 12px 6px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        fontSize: '13px',
        fontWeight: '500',
        color: '#e5e7eb',
        fontFamily: 'inherit',
        animation: 'microDemoPillIn 0.3s ease-out forwards'
    });
    const dot = document.createElement('span');
    Object.assign(dot.style, {
        width: '8px',
        height: '8px',
        borderRadius: '50%',
        background: '#4ecdc4',
        animation: 'microDemoPulse 1.2s ease-in-out infinite',
        flexShrink: '0'
    });
    pill.appendChild(dot);
    pill.appendChild(document.createTextNode(text));

    // Skip button
    const skipBtn = document.createElement('button');
    skipBtn.type = 'button';
    skipBtn.setAttribute('aria-label', 'Skip demo');
    Object.assign(skipBtn.style, {
        background: 'rgba(255, 255, 255, 0.1)',
        border: '1px solid rgba(255, 255, 255, 0.2)',
        borderRadius: '9999px',
        color: '#9ca3af',
        fontSize: '11px',
        fontWeight: '500',
        fontFamily: 'inherit',
        padding: '2px 10px',
        cursor: 'pointer',
        marginLeft: '4px',
        transition: 'background 0.15s ease, color 0.15s ease',
        flexShrink: '0'
    });
    skipBtn.textContent = 'Skip';
    skipBtn.addEventListener('mouseenter', () => {
        skipBtn.style.background = 'rgba(255, 255, 255, 0.2)';
        skipBtn.style.color = '#e5e7eb';
    });
    skipBtn.addEventListener('mouseleave', () => {
        skipBtn.style.background = 'rgba(255, 255, 255, 0.1)';
        skipBtn.style.color = '#9ca3af';
    });
    skipBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        cancelMicroDemo('skip-button');
    });
    pill.appendChild(skipBtn);

    document.body.appendChild(pill);
    return pill;
}

function _removePill() {
    const pill = document.getElementById('micro-demo-pill');
    if (pill) pill.remove();
}

function _showEndToast() {
    _removePill();
    const toast = document.createElement('div');
    toast.id = 'micro-demo-toast';
    Object.assign(toast.style, {
        position: 'fixed',
        bottom: '24px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: '9997',
        background: 'rgba(17, 24, 39, 0.9)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        border: '1px solid rgba(78, 205, 196, 0.4)',
        borderRadius: '9999px',
        padding: '10px 20px',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        fontSize: '13px',
        fontWeight: '500',
        color: '#e5e7eb',
        fontFamily: 'inherit',
        animation: 'microDemoToastIn 0.2s ease-out forwards'
    });
    toast.appendChild(document.createTextNode("That's the basics — explore freely"));

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', 'Dismiss');
    Object.assign(closeBtn.style, {
        background: 'none',
        border: 'none',
        color: '#9ca3af',
        fontSize: '16px',
        cursor: 'pointer',
        padding: '2px 4px',
        lineHeight: '1',
        minWidth: '24px',
        minHeight: '24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
    });
    closeBtn.textContent = '×';
    closeBtn.addEventListener('click', () => toast.remove());
    toast.appendChild(closeBtn);
    document.body.appendChild(toast);

    // Auto-dismiss
    const autoRemove = setTimeout(() => toast.remove(), 3000);
    toast._autoRemove = autoRemove;
    return toast;
}

/**
 * Named orchestration helper for demo reset.
 * All demo-to-overview state writes MUST stay inside this function.
 */
function __demoReset() {
    state.focusedNode = null;
    state.selectedPoint = null;
    state.navState.mode = 'overview';
    state.navState.focusedIndex = null;
    state.navState.trailSeedIndex = null;
    state.navState.trailNeighborIndices = [];
    state.navState.trailCursor = -1;
    state.navState.walkHistoryIndices = [];
    clearFocusPocketIndices();
    clearFocusPocketMeta();
    state.focusCameraAssistActive = false;
    state.focusCameraOffset = null;
    state.focusTransitionMode = 'idle';

    document.body.dataset.focusTransition = '';
    document.body.dataset.focusTransitionPhase = '';

    if (state.controls) state.controls.enabled = true;

    if (typeof window.updateSelectedBusiness === 'function') {
        window.updateSelectedBusiness(null);
    }
    if (typeof window.applyPointFilterColors === 'function') {
        window.applyPointFilterColors();
    }
    if (typeof window.refreshCompositionState === 'function') {
        window.refreshCompositionState();
    }
    if (typeof window.updateJourneyCompass === 'function') {
        window.updateJourneyCompass();
    }
    if (typeof window.setInfoPanelOpen === 'function') {
        window.setInfoPanelOpen(true);
    }
}

/**
 * Named orchestration helper for demo focus setup.
 * All demo focus-state writes (focusedNode, selectedPoint, navState, UI side-effects)
 * MUST stay inside this function.
 * @param {number} demoNode - index into state.points
 */
function __demoFocusSetup(demoNode) {
    const point = state.points[demoNode];
    state.focusedNode = demoNode;
    state.selectedPoint = point;
    state.navState.mode = 'focus';
    state.navState.focusedIndex = demoNode;
    state.navState.walkHistoryIndices = [demoNode];

    if (typeof window.updateSelectedBusiness === 'function') {
        window.updateSelectedBusiness(point, { revealCard: true });
    }
    if (typeof window.applyPointFilterColors === 'function') {
        window.applyPointFilterColors();
    }
    if (typeof window.updateExplorationUi === 'function') {
        window.updateExplorationUi();
    }
    if (typeof window.updateJourneyCompass === 'function') {
        window.updateJourneyCompass('focus');
    }
    if (typeof window.refreshCompositionState === 'function') {
        window.refreshCompositionState();
    }
    if (typeof applyLocalNeighborhoodFocus === 'function') {
        applyLocalNeighborhoodFocus(demoNode);
    }
}

function _resetAppState() {
    // Delegates to named orchestration helper — all demo state writes MUST stay inside __demoReset
    __demoReset();
}

// === Public API ===

/**
 * Check whether the micro-demo should run on this page load.
 * Returns false if sessionStorage flag is already set.
 */
window.shouldRunMicroDemo = function () {
    const params = new URLSearchParams(window.location.search);
    const forceDemo = params.get('demo') === 'force';
    if (!forceDemo && sessionStorage.getItem(SESSION_STORAGE_KEY)) return false;
    if (!_isAppReadyForDemo()) return false;
    return true;
};

let _startRetryCount = 0;
const MAX_START_RETRIES = 100; // ~15 seconds of polling at 150ms

/**
 * Start the micro-demo if conditions are right.
 * Sets sessionStorage flag immediately to prevent double-fires.
 */
window.startMicroDemo = function () {
    if (_demoPhase !== PHASE.IDLE) return;
    const params = new URLSearchParams(window.location.search);
    const forceDemo = params.get('demo') === 'force';
    if (!forceDemo && sessionStorage.getItem(SESSION_STORAGE_KEY)) return;
    if (!_isAppReadyForDemo()) {
        const now = performance.now();
        if (!_startRetryDeadline) {
            _startRetryDeadline = now + DEMO_START_DELAY_MS;
            _startRetryCount = 0;
        }
        if (now < _startRetryDeadline && _startRetryCount < MAX_START_RETRIES) {
            _startRetryCount++;
            _startRetryTimer = window.setTimeout(() => {
                _startRetryTimer = null;
                window.startMicroDemo();
            }, 150);
            return;
        }
        // Mark as seen even on skip — don't re-run on refresh
        try { sessionStorage.setItem(SESSION_STORAGE_KEY, 'skipped-no-conditions'); } catch {}
        _notifyDemoUnableToStart();
        return;
    }

    _demoNodeIndex = _getDemoNode();
    if (_demoNodeIndex === null) {
        try { sessionStorage.setItem(SESSION_STORAGE_KEY, 'skipped-no-node'); } catch {}
        _notifyDemoUnableToStart();
        return;
    }

    try { sessionStorage.setItem(SESSION_STORAGE_KEY, new Date().toISOString()); } catch {}
    _startRetryDeadline = 0;
    _runDemo();
};

function _runDemo() {
    document.body.dataset.demoActive = 'true';
    _demoPhase = PHASE.GLIDING;
    _demoCancelled = false;
    _captureOverviewCameraSnapshot();

    // Suspend auto-rotate for demo duration
    if (typeof window.setAutoRotateSuspended === 'function') {
        window.setAutoRotateSuspended(true);
    }

    // Disable orbit controls during demo
    if (state.controls) state.controls.enabled = false;

    // Show veil
    _showVeil(true);

    // Show demo pill
    _showPill('Demo — watch how it works');

    // Bind input interceptor
    _bindInputInterceptor();

    const demoNode = _demoNodeIndex;

    // T = 200ms: ambient glow begins (handled via CSS pulse on spotlight ring)
    _demoTimers.push(window.setTimeout(() => {
        if (_demoCancelled) return;
        // Trigger spotlight ring on the demo node via custom event
        document.dispatchEvent(new CustomEvent('micro-demo-node-highlight', {
            detail: { index: demoNode, phase: 'glow' }
        }));
    }, 200));

    // T = 800ms: Camera begins glide to demo node
    _demoTimers.push(window.setTimeout(() => {
        if (_demoCancelled) return;
        animateCameraToNode(demoNode, {
            transitionStyle: 'focus',
            duration: 1600, // Cinematic duration
            verticalLift: 0.05,
            distance: 0.45
        });
        // Signal spotlight to intensify during glide
        document.dispatchEvent(new CustomEvent('micro-demo-node-highlight', {
            detail: { index: demoNode, phase: 'gliding' }
        }));
    }, 800));

    // T = 2400ms: Node "clicked" — set focusedNode state
    _demoTimers.push(window.setTimeout(() => {
        if (_demoCancelled) return;
        _demoPhase = PHASE.ARRIVED;

        // All demo focus state writes MUST go through named orchestration helper
        __demoFocusSetup(demoNode);

        document.body.dataset.focusOrigin = 'micro-demo';

        // Signal spotlight ring to show "clicked" state
        document.dispatchEvent(new CustomEvent('micro-demo-node-highlight', {
            detail: { index: demoNode, phase: 'arrived' }
        }));
    }, 2400));

    // T = 3000ms: Info card should be visible (focusNode already triggered it)
    _demoTimers.push(window.setTimeout(() => {
        if (_demoCancelled) return;
        _demoPhase = PHASE.CARD_VISIBLE;
        // Card is already shown by updateSelectedBusiness call above
        // Pulse highlight on business name
        document.dispatchEvent(new CustomEvent('micro-demo-name-pulse'));
    }, 3000));

    // T = 4500ms: Card pause complete, name pulse fires
    _demoTimers.push(window.setTimeout(() => {
        if (_demoCancelled) return;
        document.dispatchEvent(new CustomEvent('micro-demo-name-pulse'));
    }, 4500));

    // T = 6000ms: Pullback begins — zoom out to neighborhood view
    _demoTimers.push(window.setTimeout(() => {
        if (_demoCancelled) return;
        _demoPhase = PHASE.PULLBACK;

        // Pull camera back to a wider view around the demo node
        animateCameraToNode(demoNode, {
            transitionStyle: 'focus',
            duration: 1200,
            distance: 1.8,
            verticalLift: 0.12
        });
    }, 6000));

    // T = 7200ms: Wide view reached — card slides out, spotlight dims
    _demoTimers.push(window.setTimeout(() => {
        if (_demoCancelled) return;
        _demoPhase = PHASE.WIDE_VIEW;
        document.dispatchEvent(new CustomEvent('micro-demo-node-highlight', {
            detail: { index: demoNode, phase: 'wide_view' }
        }));
        // Slide out info card
        if (typeof window.setInfoPanelOpen === 'function') {
            window.setInfoPanelOpen(false);
        }
    }, 7200));

    // T = 7800ms: Return to overview
    _demoTimers.push(window.setTimeout(() => {
        if (_demoCancelled) return;
        _demoPhase = PHASE.RETURNING;

        // Reset to overview: clear focused state
        _resetAppState();

        // Animate camera back to the captured overview pose.
        _animateCameraToOverview(1000);

        // Clean up spotlight
        document.dispatchEvent(new CustomEvent('micro-demo-node-highlight', {
            detail: { index: demoNode, phase: 'cleanup' }
        }));
    }, 7800));

    // T = 8800ms: Demo complete
    _demoTimers.push(window.setTimeout(() => {
        if (_demoCancelled) return;
        _demoPhase = PHASE.COMPLETE;
        _cleanup();
        _showEndToast();

        // Resume auto-rotate
        if (typeof window.setAutoRotateSuspended === 'function') {
            window.setAutoRotateSuspended(false);
        }

        // Notify demo-controller so it writes localStorage and transitions state
        window.dispatchEvent(new CustomEvent('demo-complete'));
    }, 8800));
}

function _cleanup() {
    document.body.removeAttribute('data-demo-active');
    _clearDemoTimers();
    _showVeil(false);
    _removePill();
    if (_inputCleanup) _inputCleanup();
    _demoPhase = PHASE.IDLE;
    _demoNodeIndex = null;
    _demoCancelled = false;
}

/**
 * Cancel the running demo immediately.
 * @param {string} reason - 'user-input' | 'escape-key' | 'error'
 */
export function cancelMicroDemo(reason = 'user-input') {
    if (_demoPhase === PHASE.IDLE || _demoPhase === PHASE.COMPLETE || _demoCancelled) return;
    _demoCancelled = true;
    _demoPhase = PHASE.CANCELLED;

    // Stop all pending timers
    _clearDemoTimers();

    // Reset app state to clean overview
    _resetAppState();

    // If cancelled mid-demo, do a quick smooth return to the captured overview pose.
    if (state.camera && state.controls && (reason === 'escape-key' || reason === 'user-input')) {
        _animateCameraToOverview(800);
    }

    _cleanup();
    _showVeil(false);

    // Resume auto-rotate
    if (typeof window.setAutoRotateSuspended === 'function') {
        window.setAutoRotateSuspended(false);
    }

    // Notify demo-controller so it transitions state
    window.dispatchEvent(new CustomEvent('demo-cancelled'));
}
window.cancelMicroDemo = cancelMicroDemo;

// === CSS keyframe injection ===
const _cssInjected = () => document.getElementById('micro-demo-styles');
if (!_cssInjected()) {
    const style = document.createElement('style');
    style.id = 'micro-demo-styles';
    style.textContent = `
@keyframes microDemoPulse {
    0%, 100% { transform: scale(1); opacity: 1; }
    50% { transform: scale(1.6); opacity: 0.7; }
}
@keyframes microDemoPillIn {
    from { opacity: 0; transform: translateX(-50%) translateY(-8px); }
    to { opacity: 1; transform: translateX(-50%) translateY(0); }
}
@keyframes microDemoToastIn {
    from { opacity: 0; transform: translateX(-50%) translateY(8px); }
    to { opacity: 1; transform: translateX(-50%) translateY(0); }
}
`;
    document.head.appendChild(style);
}
