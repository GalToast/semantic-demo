/**
 * @lib/engine/mycelium-engine.ts — FOSSIL (ocw_leak_deadcode_2026-07-07, HIGH-3)
 *
 * This module is fully superseded by thread-manager.ts, which implements the
 * same mycelium line-building logic with dirty-node amortization and is the
 * live path used by three-engine-frame-updates.ts.
 *
 * All exports are gated as documented no-ops so that any lingering dynamic
 * imports or latent callers cannot accidentally resurrect the stale O(N²)
 * rebuild path.  The file is intentionally retained (not deleted) per the
 * AGENTS.md fossil-cleanup precedent so that any transitive references in
 * build caches or uncommitted branches do not break.
 *
 * If reviving mycelium logic is ever needed, route through thread-manager.ts
 * instead of restoring this module.
 */

import { Vector3 } from 'three'

// Re-export the minimal types the no-op stubs reference so imports don't break.
interface EdgePair {
    a: number
    b: number
}

// ── FOSSIL no-op stubs ─────────────────────────────────────────────────────

/** @deprecated Superseded by thread-manager.ts. Rebuild path is dead. */
export function buildGeometricMyceliumEdges(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _clusterMembers: Map<number, number[]>,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _clusterCentroids: Map<number, { x: number; y: number; z: number }>
): { corePairs: EdgePair[]; wispyPairs: EdgePair[]; bridgePairs: EdgePair[] } | undefined {
    // fossil: dead code — thread-manager.ts owns geometric edge building
    return undefined
}

/** @deprecated Superseded by thread-manager.ts. Rebuild path is dead. */
export function buildSemanticMyceliumEdges(): {
    corePairs: EdgePair[]
    wispyPairs: EdgePair[]
    bridgePairs: EdgePair[]
} | null {
    // fossil: dead code — thread-manager.ts owns semantic edge building
    return null
}

/** @deprecated Superseded by thread-manager.ts. Rebuild path is dead. */
export function getBezierControlPoint(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _a: { x: number; y: number; z: number },
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _b: { x: number; y: number; z: number },
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _edgeSide = 0,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _edgeRise = 0
): Vector3 {
    // fossil: dead code — thread-manager.ts owns Bezier control-point logic
    return new Vector3(0, 0, 0)
}

/** @deprecated Superseded by thread-manager.ts. Rebuild path is dead. */
export function pushBezierLinePair(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _target: number[],
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _colorTarget: number[],
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _pair: EdgePair,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _fade = 1,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _segments = 5
): void {
    // fossil: dead code — thread-manager.ts owns line-pair pushing
}

/** @deprecated Superseded by thread-manager.ts. Rebuild path is dead. */
export function updateMyceliumThreads(): void {
    // fossil: dead code — thread-manager.ts owns per-frame thread updates
}
