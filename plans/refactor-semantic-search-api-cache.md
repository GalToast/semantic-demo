# Refactor Plan: semantic-search-api-cache.js

## Goal
Split `js/modules/semantic-search-api-cache.js` (627 lines) into focused modules while preserving the public export surface exactly.

## Current Public Exports (MUST be preserved in the facade)
- `initSearchCache` (async function, used by `app.js`)
- `fetchSemanticSearchResults` (async function, used by `search-state.js`)
- `getSemanticSearchCacheDiagnostics` (function, used by `search-state.js`)

## Current Imports
- `state` from `../state.js`
- `detectStaticDevPHP`, `allowsStaticDevFallback`, `shouldLogStaticDevFallback` from `./utils/ui-presentation.js`
- `debugWarn` from `./diagnostic-adapter.js`
- `* as idb` from `./idb-service.js`

## New Module Structure

### 1. `js/modules/semantic-search-mock-catalog.js`
Extract the mock catalog data and query-matching logic:
- `MOCK_CATALOG` object (lines 12-41)
- `MOCK_QUERY_TERMS` (line 43)
- `MOCK_QUERY_ALIASES` (line 45-52)
- `MOCK_QUERY_NAICS_PREFIX` (lines 65-70)
- `MOCK_QUERY_NAICS_DENY` (lines 84-89)
- `EXPLICIT_EMPTY_QUERY_PATTERN` (line 91)
- `normalizeMockSearchText` function (lines 93-100)
- `buildMockCatalogForQuery` function (lines 271-315)

Exports: `buildMockCatalogForQuery`

### 2. `js/modules/semantic-search-scoring.js`
Extract the field-weighted scoring and dataset-backed result building:
- `FIELD_WEIGHTS` (lines 115-129)
- `getMockPointSearchFields` function (lines 135-154)
- `getMockDatasetTerms` function (lines 156-162)
- `buildDatasetBackedMockResults` function (lines 164-269)

Exports: `buildDatasetBackedMockResults`

### 3. `js/modules/semantic-search-cache.js`
Extract the IDB cache layer:
- `SEMANTIC_SEARCH_CACHE_MAX_ENTRIES` (line 7)
- `SEMANTIC_SEARCH_CACHE_TTL_MS` (line 8)
- State initialization for `state.semanticSearchResultCache` and `state.semanticSearchCacheDiagnostics` (lines 317-328)
- `initSearchCache` function (lines 330-348) — EXPORTED
- `getSemanticSearchCacheKey` function (lines 392-394)
- `cloneSemanticSearchPayload` function (lines 396-402)
- `validatePayloadSchema` function (lines 404-412)
- `markSemanticSearchCache` function (lines 414-420)
- `getCachedSemanticSearchPayload` function (lines 422-458) — EXPORTED
- `storeSemanticSearchPayload` function (lines 460-507) — EXPORTED
- `getSemanticSearchCacheDiagnostics` function (lines 509-517) — EXPORTED

Exports: `initSearchCache`, `getCachedSemanticSearchPayload`, `storeSemanticSearchPayload`, `getSemanticSearchCacheDiagnostics`

### 4. Facade: `js/modules/semantic-search-api-cache.js` (thin re-export shell)
- Import all from the 3 new modules
- Re-export `initSearchCache`, `fetchSemanticSearchResults`, `getSemanticSearchCacheDiagnostics`
- Keep `fetchSemanticSearchResults` inline (it's the API+retry+mock orchestration function, lines 519-627) — it depends on the cache, mock-catalog, and retry logic
- Keep `isRetryableSemanticSearchError` (lines 350-362) and `waitForSemanticSearchRetry` (lines 364-390) and `SEMANTIC_SEARCH_RETRY_DELAYS_MS` (line 6) in the facade since they're only used by `fetchSemanticSearchResults`

## Import Updates Required
- `app.js` imports `initSearchCache` from `./modules/semantic-search-api-cache.js` — NO CHANGE needed (facade re-exports)
- `search-state.js` imports `fetchSemanticSearchResults` and `getSemanticSearchCacheDiagnostics` from `./modules/semantic-search-api-cache.js` — NO CHANGE needed
- Unit tests import named exports — verify they still resolve through the facade

## Rules
1. Do NOT change any function signatures or return types.
2. Do NOT add comments unless they were already present in the source.
3. Do NOT reformat or restyle code that is merely being moved.
4. Each new module must import its own dependencies (state, debugWarn, idb, etc.) as needed.
5. After creating the new modules and updating the facade, run `npm run lint` to verify.
6. Run `npm run test` and `npm run test:unit` to verify nothing is broken.
7. Return the list of files created/modified and any lint or test failures.
