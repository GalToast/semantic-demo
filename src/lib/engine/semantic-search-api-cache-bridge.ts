/**
 * @lib/engine/semantic-search-api-cache-bridge.ts — Legacy bridge to the
 * canonical semantic search API + cache entrypoint.
 *
 * Replaces the deprecated `js/modules/semantic-search-api-cache.ts` shim.
 * Re-exports the public API from `src/lib/search/api-cache.ts` so legacy
 * consumers (currently `js/modules/app.ts` only) can migrate import paths
 * without behaviour changes.
 */

export {
    initSearchCache,
    getSemanticSearchCacheDiagnostics,
    fetchSemanticSearchResults,
    getCachedSemanticSearchPayload,
    storeSemanticSearchPayload
} from '../search/api-cache';
export type { SemanticSearchRetryInfo, SemanticSearchOptions, SemanticSearchPayload } from '../search/api-cache';
