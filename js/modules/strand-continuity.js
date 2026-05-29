import { state } from '../state.js';
import { cleanOptionalValue } from './utils/dom-formatters.js';
import { syncArrivalHandoffOverlay, disposeArrivalHandoffOverlay } from './journey-webgl.js';

const STRAND_CONTINUITY_PHASES = new Set(['idle', 'preview', 'pinned', 'exploring', 'arrived', 'returning']);

export function setStrandContinuityState(phase = 'idle', options = {}) {
    const normalizedPhase = STRAND_CONTINUITY_PHASES.has(phase) ? phase : 'idle';
    state.strandContinuityState = {
        phase: normalizedPhase,
        targetIndex: Number.isFinite(options.targetIndex) ? options.targetIndex : null,
        fromIndex: Number.isFinite(options.fromIndex) ? options.fromIndex : null,
        reason: cleanOptionalValue(options.reason) || '',
        startedAt: performance.now()
    };
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
