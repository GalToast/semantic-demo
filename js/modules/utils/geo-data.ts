/**
 * geo-data.ts — thin re-export shim
 *
 * Canonical source moved to @lib/utils/geo-data.ts (Wave 11 T1a).
 * This shim preserves backward compatibility for js/ importers.
 *
 * The src/ version decoupled from state.ts by taking rawPositionsBuffer as a
 * parameter. This shim wraps computeOverviewScatterOffsets to read
 * state.rawPositionsBuffer internally, preserving the old call signature
 * for js/modules/ callers.
 */

export {
    pointHasGeocode,
    normalizeCityForFilter,
    isPointVisible,
    calculateSignalScore,
    highlightMatch,
    tokenizeSearchText,
    countTokenMatches,
} from '@lib/utils/geo-data';
export type { ScatterOffset, GeoPoint, TokenMatchResult } from '@lib/utils/geo-data';
// Re-export ActiveFilters with both the src/ name and the js/ convention
export type { ActiveFilters } from '@lib/utils/geo-data';

// ── Backward-compatible computeOverviewScatterOffsets ──────────────────────────
// js/ callers pass (points) or (points, threshold); src/ version expects
// (points, rawPositionsBuffer, threshold). This wrapper bridges the gap.
import { state } from '../../state.ts';
import { computeOverviewScatterOffsets as _computeScatter } from '@lib/utils/geo-data';

export function computeOverviewScatterOffsets(sourcePoints: any[], threshold: number = 0.055) {
    return _computeScatter(
        sourcePoints,
        (state.rawPositionsBuffer as Float32Array | null) ?? null,
        threshold,
    );
}
