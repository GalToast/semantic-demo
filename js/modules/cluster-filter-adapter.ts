/**
 * cluster-filter-adapter.ts
 *
 * Typechecked sibling of cluster-filter-adapter.js.
 *
 * Injected adapter boundary: decouples cluster-filter.js from raw global
 * window calls. The adapter delegates to real implementations injected by
 * app.js.
 *
 * Ownership contract:
 *   - cluster-filter.js must call adapter functions instead of window.applyFilters,
 *     window.clearSearchGlow, window.updateUrlState directly.
 *   - The adapter delegates to the real implementations injected by app.js.
 *   - This module does NOT import from cluster-filter.js, url-state.js, or search-state.js
 *     (leaf module that breaks the cluster-filter/window/url-state cycle).
 *
 * Usage:
 *   import { initClusterFilterAdapter } from './cluster-filter-adapter.js';
 *   // Called once from app.js init, after window bridges are established.
 *
 * **Boundary cast note:**
 * `updateUrlState` and `clearShortSemanticSearchState` are injected via
 * `initClusterFilterAdapter`. Their exact signatures at the injection site
 * are loosely typed here (`Record<string, unknown>`) to match the untyped
 * JS callers; stricter types would require cross-module signature alignment
 * outside this slice.
 */

// ── Types ──────────────────────────────────────────────────────────────────

/** Dependencies injected once from app.js. */
interface ClusterFilterAdapterDeps {
    applyFilters?: () => void;
    clearSearchGlow?: () => void;
    updateUrlState?: (extra: Record<string, unknown>, options: Record<string, unknown>) => void;
    clearShortSemanticSearchState?: (resultsEl: Element | null, statusEl: Element | null) => void;
}

// ── Internal state ─────────────────────────────────────────────────────────

let _applyFilters: (() => void) | null = null;
let _clearSearchGlow: (() => void) | null = null;
let _updateUrlState: ((extra: Record<string, unknown>, options: Record<string, unknown>) => void) | null = null;
let _clearShortSemanticSearchState: ((resultsEl: Element | null, statusEl: Element | null) => void) | null = null;

// ── Exports ────────────────────────────────────────────────────────────────

/**
 * Inject the function references. Called once from app.js init.
 */
export function initClusterFilterAdapter({
    applyFilters,
    clearSearchGlow,
    updateUrlState,
    clearShortSemanticSearchState,
}: ClusterFilterAdapterDeps = {}): void {
    _applyFilters = typeof applyFilters === 'function' ? applyFilters : null;
    _clearSearchGlow = typeof clearSearchGlow === 'function' ? clearSearchGlow : null;
    _updateUrlState = typeof updateUrlState === 'function' ? updateUrlState : null;
    _clearShortSemanticSearchState = typeof clearShortSemanticSearchState === 'function' ? clearShortSemanticSearchState : null;
}

/**
 * Returns true when all four dependencies are resolved.
 */
export function isClusterFilterAdapterReady(): boolean {
    return (
        _applyFilters !== null
        && _clearSearchGlow !== null
        && _updateUrlState !== null
        && _clearShortSemanticSearchState !== null
    );
}

/**
 * Delegate to the injected search filter implementation.
 * Safe to call when unready; no-op.
 */
export function applyFilters(): void {
    if (_applyFilters) _applyFilters();
}

/**
 * Delegate to the injected search glow cleanup.
 * Safe to call when unready; no-op.
 */
export function clearSearchGlow(): void {
    if (_clearSearchGlow) _clearSearchGlow();
}

/**
 * Delegate to the injected URL-state writer.
 * Safe to call when unready; no-op.
 */
export function updateUrlState(extra: Record<string, unknown>, options: Record<string, unknown>): void {
    if (_updateUrlState) _updateUrlState(extra, options);
}

/**
 * Delegate to the injected short semantic search state clearer.
 * Safe to call when unready; no-op.
 */
export function clearShortSemanticSearchState(resultsEl: Element | null, statusEl: Element | null): void {
    if (_clearShortSemanticSearchState) _clearShortSemanticSearchState(resultsEl, statusEl);
}
