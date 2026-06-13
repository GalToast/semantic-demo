/**
 * strand-continuity.ts
 *
 * TypeScript shadow for strand-continuity.js
 * Strand phase and arrival continuity state for journey and thread inspector.
 */

import { state, withStateMutation, type StrandContinuityState, type Point } from '../state.ts';
import { cleanOptionalValue, formatBusinessName } from './utils/dom-formatters.ts';
import { truncateMicrocopy } from './journey-text-helpers.ts';
import { syncArrivalHandoffOverlay, disposeArrivalHandoffOverlay } from './journey-webgl.ts';

const STRAND_CONTINUITY_PHASES: Set<string> = new Set(['idle', 'preview', 'pinned', 'exploring', 'arrived', 'returning']);

const _timers: Map<string, number> = new Map();

export function setTimer(key: string, ms: number, callback: () => void): void {
    clearTimer(key);
    const id = window.setTimeout(() => {
        _timers.delete(key);
        callback();
    }, ms);
    _timers.set(key, id);
}

export function clearTimer(key: string): void {
    const id = _timers.get(key);
    if (id !== undefined) {
        window.clearTimeout(id);
        _timers.delete(key);
    }
}

export function disposeTimers(): void {
    for (const [, id] of _timers) {
        window.clearTimeout(id);
    }
    _timers.clear();
}

interface StrandContinuityOptions {
    targetIndex?: number | null;
    fromIndex?: number | null;
    reason?: string;
}

export function setStrandContinuityState(phase: string = 'idle', options: StrandContinuityOptions = {}): StrandContinuityState {
    const normalizedPhase = STRAND_CONTINUITY_PHASES.has(phase) ? phase : 'idle';
    withStateMutation(() => {
        state.strandContinuityState = {
            phase: normalizedPhase,
            targetIndex: Number.isFinite(options.targetIndex) ? options.targetIndex ?? null : null,
            fromIndex: Number.isFinite(options.fromIndex) ? options.fromIndex ?? null : null,
            reason: cleanOptionalValue(options.reason) || '',
            startedAt: performance.now()
        } as StrandContinuityState;
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

export function clearStrandContinuityState(reason: string = 'clear'): StrandContinuityState {
    return setStrandContinuityState('idle', { reason });
}

export function getStrandArrivalNote(point: Point | null = null): string {
    if (state.strandContinuityState.phase !== 'arrived') return '';
    const targetIndex = state.strandContinuityState.targetIndex;
    const targetPoint = Number.isFinite(targetIndex) ? state.points[targetIndex!] : null;
    const currentPoint = point || targetPoint;
    if (!currentPoint || targetPoint !== currentPoint) return '';
    const fromPoint = Number.isFinite(state.strandContinuityState.fromIndex)
        ? state.points[state.strandContinuityState.fromIndex!]
        : null;
    const fromName = fromPoint ? formatBusinessName(fromPoint.name || 'the prior stop') : 'the prior stop';
    const targetName = formatBusinessName(currentPoint.name || 'this stop');
    return truncateMicrocopy(
        `Arrived by connection from ${fromName}. ${targetName} is now the anchor; inspect another connection, follow it, or backtrack without losing the trail.`,
        154
    );
}
