/**
 * thread-inspector-adapter.ts
 *
 * Typechecked sibling of thread-inspector-adapter.js.
 *
 * Injected adapter boundary: decouples thread-inspector.js from raw global window
 * calls to break circular dependencies with journey.js and focus-pocket.js.
 */

// ── Types ──────────────────────────────────────────────────────────────────

interface NeighborCandidate {
    reason?: string;
    [key: string]: unknown;
}

interface Point3D {
    x?: number;
    y?: number;
    z?: number;
    [key: string]: unknown;
}

interface ThreadInspectorAdapterDeps {
    summarizeNeighborReason?: ((candidate: NeighborCandidate, point: Point3D, focusPoint: Point3D) => string) | null;
    getInsideRelationshipLabel?: ((candidate: NeighborCandidate, point: Point3D, focusPoint: Point3D) => string) | null;
    getCurrentTrailFocusIndex?: (() => number | null) | null;
    getFocusThreadCurvePoint?: ((edge: unknown, t: number) => Point3D | null) | null;
}

// ── Module-level state ─────────────────────────────────────────────────────

let _summarizeNeighborReason: ((candidate: NeighborCandidate, point: Point3D, focusPoint: Point3D) => string) | null = null;
let _getInsideRelationshipLabel: ((candidate: NeighborCandidate, point: Point3D, focusPoint: Point3D) => string) | null = null;
let _getCurrentTrailFocusIndex: (() => number | null) | null = null;
let _getFocusThreadCurvePoint: ((edge: unknown, t: number) => Point3D | null) | null = null;

// ── Exports ────────────────────────────────────────────────────────────────

export function initThreadInspectorAdapter(deps: ThreadInspectorAdapterDeps = {}): void {
    _summarizeNeighborReason = typeof deps.summarizeNeighborReason === 'function' ? deps.summarizeNeighborReason : null;
    _getInsideRelationshipLabel = typeof deps.getInsideRelationshipLabel === 'function' ? deps.getInsideRelationshipLabel : null;
    _getCurrentTrailFocusIndex = typeof deps.getCurrentTrailFocusIndex === 'function' ? deps.getCurrentTrailFocusIndex : null;
    _getFocusThreadCurvePoint = typeof deps.getFocusThreadCurvePoint === 'function' ? deps.getFocusThreadCurvePoint : null;
}

export function adapter_summarizeNeighborReason(candidate: NeighborCandidate, point: Point3D, focusPoint: Point3D): string {
    if (_summarizeNeighborReason) return _summarizeNeighborReason(candidate, point, focusPoint);
    return candidate?.reason || 'Semantic relationship';
}

export function adapter_getInsideRelationshipLabel(candidate: NeighborCandidate, point: Point3D, focusPoint: Point3D): string {
    if (_getInsideRelationshipLabel) return _getInsideRelationshipLabel(candidate, point, focusPoint);
    return 'Related connection';
}

export function adapter_getCurrentTrailFocusIndex(): number | null {
    if (_getCurrentTrailFocusIndex) return _getCurrentTrailFocusIndex();
    return null;
}

export function adapter_getFocusThreadCurvePoint(edge: unknown, t: number): Point3D | null {
    if (_getFocusThreadCurvePoint) return _getFocusThreadCurvePoint(edge, t);
    return null;
}
