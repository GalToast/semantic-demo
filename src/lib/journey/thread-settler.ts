/**
 * @lib/journey/thread-settler.ts — Thread walk traversal, neighbor timers, inspection settle flow
 *
 * Ported from: js/modules/journey-thread-settler.js
 *
 * Uses StrandContinuityManager from Phase 0 for all timer management.
 * Fixes Bug #6: Race between walkThreadNeighbor and stale arrival callbacks.
 */

import type { BusinessRecord } from '@lib/types/business';
import type { Point3D } from '@lib/types/webgl';
import { formatBusinessName, cleanOptionalValue } from '@lib/utils/dom-formatters';
import { normalizeCityForFilter } from '@lib/utils/geo-data';
import { getStrandContinuityManager } from '@lib/utils/strand-continuity';
import { debugWarn } from '@lib/utils/diagnostic-adapter';
import { summarizeNeighborReason, getInsideRelationshipLabel, cancelAllThreadTimers, setTimer, clearTimer, getStrandArrivalNote } from './thread-settler-adapter';
import { walkThreadNeighbor, traverseNeighbor, walkInsideToNextStop } from './thread-settler-adapter';
import type { ThreadCandidate, WalkCandidate } from './thread-model';

export { summarizeNeighborReason, getInsideRelationshipLabel, cancelAllThreadTimers, setTimer, clearTimer, getStrandArrivalNote, walkThreadNeighbor, traverseNeighbor, walkInsideToNextStop };

// Re-export types
export type { ThreadCandidate, WalkCandidate };

/**
 * ThreadSettler class — orchestrates thread walking with safe timer management.
 * Uses StrandContinuityManager internally to prevent timer-ID drop bugs.
 */
export class ThreadSettler {
	private manager = getStrandContinuityManager();
	private callbacks: {
		onWalk?: (index: number, options: WalkOptions) => void;
		onFocus?: (point: BusinessRecord | null) => void;
		onCompassUpdate?: () => void;
		onSemanticDiveSync?: () => void;
		onShowToast?: (title: string, message: string) => void;
	} = {};

	setCallbacks(cb: ThreadSettler['callbacks']): void {
		this.callbacks = { ...this.callbacks, ...cb };
	}

	walkThreadNeighbor(index: number, options: WalkOptions = {}): WalkResult | null {
		if (!Number.isFinite(index)) return null;
		const rawFromIndex = options.fromIndex ?? this.getCurrentTrailFocusIndex();
		const fromIndex = Number.isFinite(rawFromIndex) ? (rawFromIndex as number) : 0;
		// In a real implementation, this would access state.navState.threadCandidates
		const candidate = { index, reason: options.reason };
		const targetPoint = this.getPointByIndex(index);
		const fromPoint = this.getPointByIndex(fromIndex);
		const reason = options.reason || summarizeNeighborReason(candidate, targetPoint, fromPoint) || 'nearby business relationship';

		this.clearAllTimers();

		this.manager.setPhase('exploring', { targetIndex: index, fromIndex, reason });
		this.dispatchNavTransition('WALK_TO', { index, fromIndex, appendHistory: !options.restoreHistory });
		this.callbacks.onFocus?.(targetPoint);
		this.manager.setPhase('arrived', { targetIndex: index, fromIndex, reason });
		this.callbacks.onFocus?.(targetPoint);
		this.callbacks.onCompassUpdate?.();

		return { targetIndex: index, fromIndex, reason };
	}

	traverseNeighbor(step: number): void {
		const currentIndex = this.getCurrentTrailFocusIndex();
		if (currentIndex === null) return;
		if (!this.primeBoundedSemanticNeighborhoodForTraversal(currentIndex)) return;

		if (step < 0) {
			const previousCandidate = this.getBoundedNeighborhoodWalkCandidate(-1, currentIndex, { commit: true });
			if (previousCandidate) {
				this.walkThreadNeighbor(previousCandidate.index, { fromIndex: currentIndex, surface: 'neighborhood-loop', reason: previousCandidate.reason });
				return;
			}
			// Backtrack logic
			return;
		}

		const nextCandidate = this.getNextWalkCandidateForIndex(currentIndex, {
			requireSemantic: true,
			requireOnCanvas: true,
			commitNeighborhood: true
		});
		if (!nextCandidate) {
			this.callbacks.onShowToast?.('End of path', 'No more connected neighbors are ready.');
			return;
		}
		this.walkThreadNeighbor(nextCandidate.index, { fromIndex: currentIndex, surface: 'neighborhood-loop', reason: nextCandidate.reason });
	}

	walkInsideToNextStop(): void {
		// Delegate to traverseNeighbor for inside mode
		this.traverseNeighbor(1);
	}

	previewInsideNextThread(): WalkCandidate | null {
		const currentIndex = this.getCurrentTrailFocusIndex();
		if (currentIndex === null || !Number.isFinite(currentIndex)) return null;
		const nextCandidate = this.getNextWalkCandidateForIndex(currentIndex, {
			requireSemantic: true,
			requireOnCanvas: true,
			commitNeighborhood: false
		}) || this.getNextWalkCandidateForIndex(currentIndex, {
			requireSemantic: false,
			requireOnCanvas: false,
			commitNeighborhood: false
		});
		if (!nextCandidate || !Number.isFinite(nextCandidate.index)) return null;
		return this.inspectThreadNeighbor(nextCandidate.index, { force: true, preserveJourney: true, surface: 'inside-cue' });
	}

	clearAllTimers(): void {
		this.manager.cancelAll();
	}

	// Stub methods - these would be implemented with proper state access
	private getCurrentTrailFocusIndex(): number | null {
		debugWarn('[journey] Stub function hit: getCurrentTrailFocusIndex');
		return null;
	}
	private getPointByIndex(_index: number): BusinessRecord | null {
		debugWarn('[journey] Stub function hit: getPointByIndex');
		return null;
	}
	private getNextWalkCandidateForIndex(_index: number, _options: Record<string, unknown>): WalkCandidate | null {
		debugWarn('[journey] Stub function hit: getNextWalkCandidateForIndex');
		return null;
	}
	private getBoundedNeighborhoodWalkCandidate(_step: number, _index: number, _options: Record<string, unknown>): WalkCandidate | null {
		debugWarn('[journey] Stub function hit: getBoundedNeighborhoodWalkCandidate');
		return null;
	}
	private primeBoundedSemanticNeighborhoodForTraversal(_index: number): boolean {
		debugWarn('[journey] Stub function hit: primeBoundedSemanticNeighborhoodForTraversal');
		return false;
	}
	private inspectThreadNeighbor(_index: number, _options: Record<string, unknown>): WalkCandidate | null {
		debugWarn('[journey] Stub function hit: inspectThreadNeighbor');
		return null;
	}
	private dispatchNavTransition(_action: string, _payload: Record<string, unknown>): void {
		debugWarn('[journey] Stub function hit: dispatchNavTransition');
	}
}

export interface WalkOptions {
	fromIndex?: number;
	fromCanvasNode?: boolean;
	fromTraversal?: boolean;
	preserveNeighborhood?: boolean;
	appendHistory?: boolean;
	restoreHistory?: boolean;
	surface?: string;
	reason?: string;
	arrivalDelay?: number;
	settleDelay?: number;
}

export interface WalkResult {
	targetIndex: number;
	fromIndex: number;
	reason: string;
}

// Singleton instance
let _threadSettler: ThreadSettler | null = null;
export function getThreadSettler(): ThreadSettler {
	if (!_threadSettler) _threadSettler = new ThreadSettler();
	return _threadSettler;
}