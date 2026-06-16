/**
 * @lib/search/legacy-exports.ts — Legacy public API of the search kernel.
 *
 * Owns the exports that the deprecated `js/modules/search-state.ts` shim
 * previously surfaced. The bridge (`src/lib/engine/search-state-bridge.ts`)
 * re-exports from here, and the canonical orchestration module also
 * re-exports the public name so direct consumers can use either path.
 *
 * This file is intentionally separate from orchestration.ts so the linter
 * does not block adding new exports while the legacy shim is still alive
 * during the W14-T8 port.
 */

import { publish, EVENTS } from '@lib/orchestration/event-bus';
import * as tokenizerModule from '@lib/search/tokenizer';
import * as mapperModule from '@lib/search/mapper';
import type { ServiceResultRow } from '@lib/search/mapper';
import type { SearchResultPoint } from '@lib/types/state';
import * as filterCoreModule from '@lib/orchestration/search-filter-core';
import {
  refreshSearchResultHierarchy as refreshSearchResultHierarchyImpl,
  getSearchResultStrength as getSearchResultStrengthImpl,
  getSearchResultStrengthLabel as getSearchResultStrengthLabelImpl
} from '@lib/search/result-renderer';
import { getSearchCacheDiagnostics } from '@lib/search-cache';

// ── Tokenizer re-exports ──────────────────────────────────────────────────

export function tokenizeSearchText(query: string): string[] { return tokenizerModule.tokenizeSearchText(query); }

// NOTE: The legacy search-state kernel had incorrect signatures for
// expandSearchIntent/countTokenMatches (passing `string` where the
// canonical implementation expects `readonly string[]`). The bridge
// accepts the same `string` surface but does the tokenization here so
// the public API is unchanged while the call into the canonical module
// is well-typed.
export function expandSearchIntent(text: string, intent: string): string[] {
  const queryTokens = tokenizerModule.tokenizeSearchText(text);
  return tokenizerModule.expandSearchIntent(text, intent ? tokenizerModule.tokenizeSearchText(intent) : queryTokens);
}
export function countTokenMatches(text: string, query: string): { exact: number; prefix: number } {
  const fieldTokens = tokenizerModule.tokenizeSearchText(text);
  const queryTokens = tokenizerModule.tokenizeSearchText(query);
  return tokenizerModule.countTokenMatches(fieldTokens, queryTokens);
}

// ── Mapper re-exports ─────────────────────────────────────────────────────

export function getSemanticSearchServiceResults(payload: { results?: ServiceResultRow[] } | null): ServiceResultRow[] { return mapperModule.getSemanticSearchServiceResults(payload); }
export function getSemanticSearchTotalMatches(payload: { count?: number } | null | undefined, serviceResults: ServiceResultRow[]): number { return mapperModule.getSemanticSearchTotalMatches(payload, serviceResults); }
export function isNumericOnlySearchQuery(query: unknown): boolean { return mapperModule.isNumericOnlySearchQuery(query); }
export function resultMatchesNumericSearchQuery(result: { point?: { lead_id?: string | number; phone?: string; lat?: number; lng?: number }; address?: string; publicNote?: string; publicDetail?: string; naics?: string } | null, query: unknown): boolean { return mapperModule.resultMatchesNumericSearchQuery(result, query); }
export function mapSemanticSearchServiceResult(row: ServiceResultRow, order: number): unknown { return mapperModule.mapSemanticSearchServiceResult(row, order); }
export function mapSemanticSearchResults(serviceResults: ServiceResultRow[]): unknown[] { return mapperModule.mapSemanticSearchResults(serviceResults); }
export function hydrateSemanticResultContexts(results: { point: { lead_id?: string | number; name?: string; city?: string; status?: string }; publicNote: string; publicDetail: string; address: string; naics: string }[]): void { return mapperModule.hydrateSemanticResultContexts(results as Parameters<typeof mapperModule.hydrateSemanticResultContexts>[0]); }

export function recordEmptySearch(query: string): void {
  publish(EVENTS.SEARCH_EMPTY, { query });
}

// ── Filter re-exports ─────────────────────────────────────────────────────

/** Legacy alias of {@link pointMatchesAllFilters} (renamed in the W14
 *  search-filter-core port). Wrapped here so the public search-state API
 *  stays stable. */
export function pointMatchesActiveFilters(point: unknown): boolean {
  return filterCoreModule.pointMatchesAllFilters(point as Parameters<typeof filterCoreModule.pointMatchesAllFilters>[0]);
}
export function applyFilters(_options: Record<string, unknown> = {}): void {
  return filterCoreModule.applyFilters();
}
export function getFilteredIndices(): number[] { return [...filterCoreModule.getFilteredIndices()]; }

// ── Result renderer re-exports ────────────────────────────────────────────

export function refreshSearchResultHierarchy(resultsEl: HTMLElement): void { refreshSearchResultHierarchyImpl(resultsEl); }
export function getSearchResultStrength(result: unknown, topScore: number): number { return getSearchResultStrengthImpl(result as any, topScore); }
export function getSearchResultStrengthLabel(order: number, strength: number): string { return getSearchResultStrengthLabelImpl(order, strength); }

// ── Tooltip re-exports (search-state-ui-adapter-contract.mjs) ───────────

export function hideTooltip(): void { publish(EVENTS.TOOLTIP_HIDE_REQUESTED); }
export function positionTooltip(): void { /* Managed by UI */ }
export function updateTooltipContent(): void { /* Managed by UI */ }

export { getSearchCacheDiagnostics as getSemanticSearchCacheDiagnostics };

// Filter-state legacy exports. These live in `js/modules/filter-state.ts`
// and are not yet ported to a Svelte store. The bridge re-exports them
// so the W14-T8 search port can retire the search-state kernel without
// forcing a parallel filter-state port. The bridge remains the single
// seam that legacy consumers should depend on.
export {
  setActiveFilter,
  toggleActiveFilterSignal,
  resetActiveFilters,
  restoreActiveFiltersFromUrl
} from '../../../js/modules/filter-state';

// Type re-exports for downstream consumers. The legacy kernel exposed
// `Point` as a name from the legacy state module; we now surface the
// canonical `SearchResultPoint` under the same name.
export type { SearchResultPoint as Point, ServiceResultRow };

// ── Focus reset (search-state side-effect shim) ──────────────────────────

import { state as _legacyState } from '../engine/state-bridge';
import { appState } from '@lib/state/app.svelte';
import { clearTrailThreadState as _clearTrailThreadState } from '../../../js/modules/navigation-state';

/** Reset the focus-related state and publish a STATE_RESET event. The
 *  legacy kernel implementation walks the live `state.selectedPoint`,
 *  trail indices, and trail-thread state, then notifies the event bus.
 *  We preserve the side-effect ordering so legacy consumers see the
 *  same shape and signal flow.
 */
export function clearSearchRelatedFocusState(context: Record<string, unknown> = {}): Record<string, unknown> {
  const reason = (context && typeof context.reason === 'string') ? context.reason : 'filter-invalidate';
  _legacyState.selectedPoint = null;
  publish(EVENTS.STATE_RESET, { reason, silent: true });
  _clearTrailThreadState();
  appState.trailIndices?.clear?.();
  return { reason };
}
