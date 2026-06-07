/**
 * @lib/journey/thread-settler-adapter.ts — Adapter functions for thread-settler.ts
 *
 * Provides the bridge functions that thread-settler imports from the legacy
 * runtime. During migration, these delegate to stores and the engine bridge.
 * Once fully ported, these become direct implementations.
 *
 * Ported from: js/modules/journey-thread-settler.js (adapter functions)
 */
import type { BusinessRecord } from '@lib/types/business';
import type { ThreadCandidate } from './thread-model';
import { debugWarn } from '@lib/utils/diagnostic-adapter';
import { getStrandContinuityManager } from '@lib/utils/strand-continuity';

// ── Timer Bridge ──────────────────────────────────────────────────────────────

export function setTimer(purpose: string, ms: number, callback: () => void): void {
  const manager = getStrandContinuityManager();
  manager.setTimer(purpose, ms, callback);
}

export function clearTimer(purpose: string): void {
  const manager = getStrandContinuityManager();
  manager.clearTimer(purpose);
}

export function cancelAllThreadTimers(): void {
  const manager = getStrandContinuityManager();
  manager.cancelAll();
}

// ── Neighbor Reason Summaries ─────────────────────────────────────────────────

/**
 * Summarize the reason for a neighbor relationship.
 * Ported from journey-thread-settler.js summarizeNeighborReason().
 */
export function summarizeNeighborReason(
  candidate: { index?: number; reason?: string; threadType?: string; source?: string; relationshipRole?: string; sameCity?: boolean; sameStatus?: boolean },
  _point: BusinessRecord | null,
  _focusPoint: BusinessRecord | null
): string {
  if (!candidate) return 'nearby business relationship';
  if (candidate.reason && candidate.reason !== 'nearby business relationship') return candidate.reason;
  if (candidate.threadType === 'approximate_projected_neighbor') return 'approximate cloud projection neighbor';
  if (candidate.source === 'semantic') return 'semantic business relationship';
  return 'nearby business relationship';
}

/**
 * Get the inside relationship label for a candidate.
 * Ported from thread-inspector.js getInsideRelationshipLabel().
 */
export function getInsideRelationshipLabel(
  _candidate: { index?: number; reason?: string; threadType?: string; source?: string; relationshipRole?: string },
  _point: BusinessRecord | null,
  _focusPoint: BusinessRecord | null
): string {
  return 'semantic neighbor';
}

/**
 * Get the strand arrival note from the continuity manager.
 */
export function getStrandArrivalNote(): string {
  const manager = getStrandContinuityManager();
  const state = manager.state;
  if (state.phase === 'arrived') {
    return `Arrived at ${state.reason || 'the next stop'}.`;
  }
  return '';
}

// ── Walk / Traverse Facades ──────────────────────────────────────────────────

/**
 * Walk to a thread neighbor. Delegates to the legacyl walkThreadNeighbor
 * function or the store.
 */
export function walkThreadNeighbor(
  index: number,
  options: { fromIndex?: number; surface?: string; reason?: string } = {}
): { targetIndex: number; fromIndex: number | undefined; reason: string } | null {
  if (!Number.isFinite(index)) return null;
  // During migration, this would call dispatchNavTransition
  // and update focus stores. Stub returns the result descriptor.
  return {
    targetIndex: index,
    fromIndex: options.fromIndex,
    reason: options.reason || 'walk'
  };
}

/**
 * Traverse to the next/previous neighbor step.
 */
export function traverseNeighbor(
  _step: number,
  _options: { fromIndex?: number; surface?: string } = {}
): void {
  debugWarn('[journey] Stub function hit: traverseNeighbor');
}

/**
 * Walk inside mode to the next stop.
 */
export function walkInsideToNextStop(): void {
  debugWarn('[journey] Stub function hit: walkInsideToNextStop');
}

/**
 * Preview the next inside thread candidate.
 */
export function previewInsideNextThread(): { index: number; reason: string } | null {
  debugWarn('[journey] Stub function hit: previewInsideNextThread');
  return null;
}

// ── Re-export common types from thread-model ─────────────────────────────────

export type { ThreadCandidate } from './thread-model';
