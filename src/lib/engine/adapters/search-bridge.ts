/**
 * @lib/engine/adapters/search-bridge.ts — Search results, glow, and corridor focus
 *
 * Handles search-related bridge operations: mapping raw API rows to typed
 * results, managing the legacy search glow state (via `state.searchGlowIndices`),
 * and orchestrating the camera corridor animation for search results.
 *
 * DESIGN PRINCIPLES
 * ─────────────────
 * 1. PURE MAPPING.  `mapBridgeSearchResult` is a pure function with no side
 *    effects — it transforms a raw API row into a typed `BridgeSearchResult`.
 * 2. SHARED INTERNALS.  `setSearchResults` and `focusSearchCorridor` share
 *    a private `_applyGlow` helper that writes to the legacy state and the
 *    Svelte search-glow store so both paths stay consistent.
 * 3. CAMERA-AWARE.  `focusSearchCorridor` delegates to `ctx._cameraControls`
 *    for the corridor fly-to animation, but all search glow management lives
 *    in this module.
 */

import type { BridgeContext, EngineBridge, RawSearchRow, BridgeSearchResult, SearchCorridorOptions } from './types'

import { setSearchGlow, clearSearchGlow } from '@lib/stores/search.svelte'

// ── TS Port Imports (canonical implementations) ─────────────────────────────

import { animateCameraToSearchCorridor as _animateCameraToSearchCorridor } from '@lib/engine/camera-choreography'

// ── Pure Helpers ─────────────────────────────────────────────────────────────

/**
 * Map a raw API row to a typed `BridgeSearchResult`.
 *
 * Pure function — no state dependency.  Returns `null` when the row is
 * empty or has no identifiable `name` or `lead_id`.
 */
export function mapBridgeSearchResult(row: RawSearchRow, order: number): BridgeSearchResult | null {
    if (!row || (!row.name && !row.lead_id)) return null

    return {
        id: String(row.lead_id ?? row.name ?? `result-${order}`),
        name: String(row.name || row.lead_id || 'Unknown'),
        index: Number.isFinite(row.index) ? Number(row.index) : order,
        score: Number(row.score ?? row.semantic_score ?? 0),
        category: String(row.category ?? ''),
        snippet: String(row.public_note ?? row.public_detail ?? row.address ?? '')
    }
}

// ── State Helpers (shared between search methods) ──────────────────────────

/**
 * Apply the glow set to the legacy state and the Svelte store.
 *
 * Clears any previous glow set, then populates with the given indices.
 * This is the single source of truth for search glow so that both
 * `setSearchResults` and `focusSearchCorridor` stay consistent.
 */
function _applyGlow(ctx: BridgeContext, indices: number[]): void {
    if (!ctx._state) return

    ctx._state.searchGlowIndices.clear()
    for (const i of indices) {
        ctx._state.searchGlowIndices.add(i)
    }
    ctx._state.searchGlowTopIndex = indices[0] ?? null
    ctx._state.searchGlowActive = indices.length > 0

    // Sync the Svelte search-glow store so UI components see the glow state
    setSearchGlow(indices, indices[0] ?? null)
}

// ── Public Factory ───────────────────────────────────────────────────────────

/**
 * Create the search slice of the EngineBridge.
 *
 * The returned object is spread into the final bridge by the core factory.
 */
export function createSearchMethods(
    ctx: BridgeContext
): Pick<EngineBridge, 'setSearchResults' | 'clearSearchResults' | 'focusSearchCorridor'> {
    function _assertReady(method: string): void {
        if (ctx.status !== 'ready') {
            throw new Error(`EngineBridge.${method}: engine status is "${ctx.status}", expected "ready"`)
        }
    }

    return {
        // ── Search Glow ───────────────────────────────────────────────────────

        setSearchResults(indices: number[]): void {
            _assertReady('setSearchResults')
            _applyGlow(ctx, indices)
        },

        // ── Search Corridor ───────────────────────────────────────────────────

        focusSearchCorridor(anchorIndex: number, resultIndices: number[], options: SearchCorridorOptions = {}): void {
            _assertReady('focusSearchCorridor')

            // Apply glow for the full set (anchor + results) so the corridor
            // is visible during the camera fly-to animation.
            _applyGlow(ctx, [anchorIndex, ...resultIndices])

            _animateCameraToSearchCorridor(anchorIndex, resultIndices, {
                duration: options.durationMs,
                reason: options.reason ?? 'svelte-search'
            })
        },

        // ── Clear Search ──────────────────────────────────────────────────────

        clearSearchResults(): void {
            _assertReady('clearSearchResults')

            if (!ctx._state) return

            ctx._state.searchGlowIndices.clear()
            ctx._state.searchGlowTopIndex = null
            ctx._state.searchGlowActive = false

            // Sync the Svelte store so UI components see the clear
            clearSearchGlow()
        }
    }
}
