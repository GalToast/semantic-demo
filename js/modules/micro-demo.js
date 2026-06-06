// js/modules/micro-demo.js
// Thin facade: orchestration entry (guards, retries, showcase pool) delegates
// choreography to micro-demo-choreography.js.

import { state } from '../state.js';
import { debugWarn } from './diagnostic-adapter.js';
import {
    isAppReadyForDemo, guardNotSeen, guardReducedMotion, guardWebGL, guardUrlParam,
    notifyDemoUnableToStart, SESSION_STORAGE_KEY
} from './micro-demo-guards.js';
import {
    setDemoNodeIndex, runDemo, cancelChoreography, isMicroDemoRunning, PHASE
} from './micro-demo-choreography.js';
import { seededUnit } from './utils/seeded-random.js';

const DEMO_START_DELAY_MS = 25000;
const MAX_START_RETRIES = 100;

const SHOWCASE_POOL = [50, 707, 1525, 2908, 3899, 4102, 6684, 7938];

function _fisherYatesShuffle(array, seed = 0xDEAD) {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(seededUnit(i + seed) * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

const _shuffledPool = _fisherYatesShuffle(SHOWCASE_POOL);

let _startRetryTimer = null;
let _startRetryDeadline = 0;
let _startRetryCount = 0;
let _startGuardClaimed = false;

function _getDemoNode() {
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

function _clearRetryTimer() {
    if (_startRetryTimer !== null) {
        window.clearTimeout(_startRetryTimer);
        _startRetryTimer = null;
    }
    _startRetryDeadline = 0;
}

// === Public API ===

export function initMicroDemo() {
    const params = new URLSearchParams(window.location.search);
    const forceDemo = params.has('demo') && params.get('demo') === 'force';
    if (!forceDemo) {
        if (!guardNotSeen())    { debugWarn('[demo] blocked -- already seen'); return; }
        if (!guardReducedMotion()) { debugWarn('[demo] blocked -- reduced motion'); return; }
        if (!guardWebGL())      { debugWarn('[demo] blocked -- no WebGL / software renderer'); return; }
        if (!guardUrlParam())   { debugWarn('[demo] blocked -- nodemo URL param'); return; }
    }
    startMicroDemo();
}

export function shouldRunMicroDemo() {
    const params = new URLSearchParams(window.location.search);
    const forceDemo = params.get('demo') === 'force';
    if (!forceDemo && sessionStorage.getItem(SESSION_STORAGE_KEY)) return false;
    if (!isAppReadyForDemo()) return false;
    return true;
}

export function startMicroDemo() {
    if (PHASE === undefined) {
        // Defensive: choreography module failed to load
        debugWarn('[demo] choreography module not loaded');
        return;
    }
    // Atomic re-entry guard
    if (_startGuardClaimed) return;
    _startGuardClaimed = true;

    const params = new URLSearchParams(window.location.search);
    const forceDemo = params.get('demo') === 'force';

    if (!forceDemo) {
        if (sessionStorage.getItem(SESSION_STORAGE_KEY)) { _startGuardClaimed = false; return; }
        if (!guardNotSeen()) { _startGuardClaimed = false; return; }
    }

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
                _startGuardClaimed = false;
                startMicroDemo();
            }, 150);
            return;
        }
        _startGuardClaimed = false;
        try { sessionStorage.setItem(SESSION_STORAGE_KEY, 'skipped-no-conditions'); } catch {}
        notifyDemoUnableToStart();
        return;
    }
    const node = _getDemoNode();
    if (node === null) {
        _startGuardClaimed = false;
        try { sessionStorage.setItem(SESSION_STORAGE_KEY, 'skipped-no-node'); } catch {}
        notifyDemoUnableToStart();
        return;
    }
    try { sessionStorage.setItem(SESSION_STORAGE_KEY, new Date().toISOString()); } catch {}
    _startGuardClaimed = false;
    _startRetryDeadline = 0;
    setDemoNodeIndex(node);
    runDemo(cancelMicroDemo);
}

export function cancelMicroDemo(reason = 'user-input') {
    cancelChoreography(reason);
}

export { isMicroDemoRunning };
