/**
 * @lib/journey/thread-settler-adapter.ts — Adapter functions for thread-settler.ts
 *
 * Provides the bridge functions that thread-settler imports from the legacy
 * runtime. Once fully ported, these become direct implementations.
 *
 * Ported from: js/modules/journey-thread-settler.js (adapter functions)
 */

import {
	traverseNeighbor as _traverseNeighborImpl,
	previewInsideNextThread as _previewInsideNextThreadImpl
} from './thread-settler';

export function traverseNeighbor(step: number) {
	return _traverseNeighborImpl(step);
}

export function previewInsideNextThread(options?: Record<string, unknown>) {
	return _previewInsideNextThreadImpl(options);
}

// Re-exports from thread-settler for backward compatibility and type safety

export {
	setTimer,
	clearTimer,
	cancelAllThreadTimers,
	initJourneyTimerAdapter,
	summarizeNeighborReason,
	getInsideRelationshipLabel,
	getStrandArrivalNote,
	walkThreadNeighbor
} from './thread-settler';

export type { ThreadCandidate } from './thread-model';
export type { WalkOptions, WalkResult, PreviewInsideOptions } from './thread-settler';
