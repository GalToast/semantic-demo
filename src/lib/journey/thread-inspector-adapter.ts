/**
 * thread-inspector-adapter.ts
 *
 * Typechecked sibling of thread-inspector-adapter.js.
 *
 * Injected adapter boundary: decouples thread-inspector.js from raw global window
 * calls to break circular dependencies with journey.js and focus-pocket.js.
 */

import type { NeighborCandidate, Point3D } from '@lib/orchestration/adapters'

// ── Types ──────────────────────────────────────────────────────────────────

interface ThreadInspectorAdapterDeps {
    summarizeNeighborReason?: ((candidate: NeighborCandidate) => string) | null;
    getInsideRelationshipLabel?: ((candidate: NeighborCandidate) => string) | null;
    getCurrentTrailFocusIndex?: (() => number | null) | null;
}

// ── Module-level state ─────────────────────────────────────────────────────

let _summarizeNeighborReason: ((candidate: NeighborCandidate) => string) | null = null;
let _getInsideRelationshipLabel: ((candidate: NeighborCandidate) => string) | null = null;
let _getCurrentTrailFocusIndex: (() => number | null) | null = null;

// ── Exports ────────────────────────────────────────────────────────────────

export function initThreadInspectorAdapter(deps: ThreadInspectorAdapterDeps = {}): void {
    _summarizeNeighborReason = typeof deps.summarizeNeighborReason === 'function' ? deps.summarizeNeighborReason : null;
    _getInsideRelationshipLabel = typeof deps.getInsideRelationshipLabel === 'function' ? deps.getInsideRelationshipLabel : null;
    _getCurrentTrailFocusIndex = typeof deps.getCurrentTrailFocusIndex === 'function' ? deps.getCurrentTrailFocusIndex : null;
}

export function adapter_summarizeNeighborReason(candidate: NeighborCandidate): string {
    if (_summarizeNeighborReason) return _summarizeNeighborReason(candidate);
    return candidate?.reason || 'Semantic relationship';
}

export function adapter_getInsideRelationshipLabel(candidate: NeighborCandidate): string {
    if (_getInsideRelationshipLabel) return _getInsideRelationshipLabel(candidate);
    return 'Related connection';
}

export function adapter_getCurrentTrailFocusIndex(): number | null {
    if (_getCurrentTrailFocusIndex) return _getCurrentTrailFocusIndex();
    return null;
}

// Point3D re-export kept for backward compat with any external bridge consumer.
export type { Point3D }
