import { state, withStateMutation } from '../state.js';
import { cleanOptionalValue, formatBusinessName } from './utils/dom-formatters.js';
import { truncateMicrocopy } from './journey-text-helpers.js';
import { syncArrivalHandoffOverlay, disposeArrivalHandoffOverlay } from './journey-webgl.js';

const STRAND_CONTINUITY_PHASES = new Set(['idle', 'preview', 'pinned', 'exploring', 'arrived', 'returning']);

const _timers = new Map();

export function setTimer(key, ms, callback) {
    clearTimer(key);
    const id = window.setTimeout(() => {
        _timers.delete(key);
        callback();
    }, ms);
    _timers.set(key, id);
}

export function clearTimer(key) {
    const id = _timers.get(key);
    if (id !== undefined) {
        window.clearTimeout(id);
        _timers.delete(key);
    }
}

export function disposeTimers() {
    for (const [, id] of _timers) {
        window.clearTimeout(id);
    }
    _timers.clear();
}

export function setStrandContinuityState(phase = 'idle', options = {}) {
    const normalizedPhase = STRAND_CONTINUITY_PHASES.has(phase) ? phase : 'idle';
    withStateMutation(() => {
        state.strandContinuityState.phase = normalizedPhase;
        state.strandContinuityState.targetIndex = Number.isFinite(options.targetIndex) ? options.targetIndex : null;
        state.strandContinuityState.fromIndex = Number.isFinite(options.fromIndex) ? options.fromIndex : null;
        state.strandContinuityState.reason = cleanOptionalValue(options.reason) || '';
        state.strandContinuityState.startedAt = performance.now();
    });
    if (document.body) {
        document.body.dataset.strandJourney = normalizedPhase;
        document.body.dataset.strandJourneyTarget = Number.isFinite(state.strandContinuityState.targetIndex)
            ? String(state.strandContinuityState.targetIndex)
            : '';
        document.body.dataset.strandJourneyFrom = Number.isFinite(state.strandContinuityState.fromIndex)
            ? String(state.strandContinuityState.fromIndex)
            : '';
        document.body.dataset.strandJourneyReason = state.strandContinuityState.reason;
    }
    if (['exploring', 'arrived'].includes(normalizedPhase)) {
        syncArrivalHandoffOverlay();
    } else if (normalizedPhase === 'idle') {
        disposeArrivalHandoffOverlay();
    }
    return state.strandContinuityState;
}

export function clearStrandContinuityState(reason = 'clear') {
    setStrandContinuityState('idle', { reason });
}

export function getStrandArrivalNote(point = null) {
    if (state.strandContinuityState.phase !== 'arrived') return '';
    const targetIndex = state.strandContinuityState.targetIndex;
    const targetPoint = Number.isFinite(targetIndex) ? state.points[targetIndex] : null;
    const currentPoint = point || targetPoint;
    if (!currentPoint || targetPoint !== currentPoint) return '';
    const fromPoint = Number.isFinite(state.strandContinuityState.fromIndex)
        ? state.points[state.strandContinuityState.fromIndex]
        : null;
    const fromName = fromPoint ? formatBusinessName(fromPoint.name || 'the prior stop') : 'the prior stop';
    const targetName = formatBusinessName(currentPoint.name || 'this stop');
    return truncateMicrocopy(
        `Arrived by connection from ${fromName}. ${targetName} is now the anchor; inspect another connection, follow it, or backtrack without losing the trail.`,
        154
    );
}
