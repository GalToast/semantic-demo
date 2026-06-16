/**
 * @lib/engine/semantic-search-cache-bridge.ts — Legacy bridge to the
 * canonical semantic search cache.
 *
 * Replaces the deprecated `js/modules/semantic-search-cache.ts` shim.
 * Re-exports the public API from `src/lib/search/cache.ts` so legacy
 * consumers can migrate import paths without behaviour changes.
 */

export {
    SEMANTIC_SEARCH_CACHE_MAX_ENTRIES,
    SEMANTIC_SEARCH_CACHE_TTL_MS,
    initSearchCache,
    getCachedSemanticSearchPayload,
    storeSemanticSearchPayload,
    getSemanticSearchCacheDiagnostics
} from '../search/cache';
export type { CacheEntry, SearchPayload, CacheDiagnosticsSnapshot } from '../search/cache';
