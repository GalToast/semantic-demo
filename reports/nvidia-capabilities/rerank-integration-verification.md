# Rerank Integration Verification

**Date:** 2026-06-13
**Ticket:** BOTH-pattern Ticket 6 — Search-rerank feature (NIM rerank integration)
**Worker:** External subagent

## Live NIM Call

**Endpoint:** `https://ai.api.nvidia.com/v1/retrieval/nvidia/reranking`
**Model:** `nvidia/rerank-qa-mistral-4b`
**Auth:** Bearer token (via nvidia-capabilities MCP key rotation)
**HTTP Status:** 200 OK

### Request

```json
{
  "model": "nvidia/rerank-qa-mistral-4b",
  "query": {
    "text": "Montgomery County Texas business network, semantic mycelium visualization"
  },
  "passages": [
    { "text": "The Woodlands is a master-planned community in Montgomery County, Texas, home to many energy and tech firms." },
    { "text": "Banana Republic operates a retail store at Market Street in The Woodlands." },
    { "text": "The semantic explorer visualizes business relationships as a 3D mycelium network." },
    { "text": "Houston is a major city adjacent to Montgomery County." },
    { "text": "The Woodlands Township hosts a quarterly business expo with over 200 vendors." }
  ],
  "top_n": 5
}
```

### Response

```json
{
  "rankings": [
    { "index": 2, "logit": 3.998046875 },
    { "index": 0, "logit": -7.73046875 },
    { "index": 3, "logit": -9.03125 },
    { "index": 4, "logit": -10.546875 },
    { "index": 1, "logit": -14.9140625 }
  ]
}
```

### Analysis

| Rank | Passage Index | Logit | Gap from #1 | Interpretation |
|------|---------------|-------|-------------|----------------|
| 1 | **2** (semantic explorer) | **+3.998** | — | Direct lexical match to "semantic mycelium visualization" |
| 2 | 0 (Woodlands community) | -7.730 | -11.7 | Matches Montgomery County geography |
| 3 | 3 (Houston) | -9.031 | -13.0 | Adjacent geography, no mycelium link |
| 4 | 4 (Township expo) | -10.547 | -14.5 | Tangential to "business network" |
| 5 | 1 (Banana Republic) | -14.914 | -18.9 | Generic store, weakest match |

**Verdict:** Semantic explorer passage dominates geographic matches by 11.7 logit units — exactly as the proof doc predicted. The NIM endpoint is live and returns the expected response shape.

## Schema Confirmation

- **Query shape:** `{"text": "..."}` ✓ (dict, not plain string)
- **Passages shape:** `[{"text": "..."}]` ✓ (array of dicts, not array of strings)
- **Response field:** `rankings` ✓ (not `rerank_results` as the design doc sketch suggested)
- **Logit range:** -14.9 to +4.0 ✓ (matches proof doc's expected range)

## Integration Verification

### Build
- `npm run check`: ✅ Build succeeds (Vite/Svelte production build)
- `svelte-check`: ✅ 0 errors, 0 warnings in `src/` code

### Tests
- `npm run test:unit`: ✅ 83/83 pass (13 new rerank tests + 70 existing)
- `npm run qa:contract:all`: ✅ All contract tests pass

### Files Changed
- `src/lib/utils/rerank.ts` — New rerank module (NIM integration)
- `src/lib/search-engine.ts` — Wired rerank into `_executeSearch()`
- `src/lib/stores/search.svelte.ts` — Added `searchUseRerank` flag
- `src/lib/stores/index.svelte.ts` — Exported `searchUseRerank`
- `tests/unit-active/search-rerank.test.ts` — 13 unit tests

### Feature Flag Behavior
- **Default:** Off (zero latency cost)
- **`?rerank=1` URL param:** Force-on for QA
- **`localStorage.semantic_explorer_rerank_v1 = '1'`:** Power-user opt-in
- **`searchUseRerank` store:** A/B test toggle (default `false`)

### Fallback Behavior
- Network error → original results returned unchanged
- Non-OK HTTP response → original results returned unchanged
- Timeout (AbortError) → original results returned unchanged
- NIM returns empty rankings → original results returned unchanged
- CORS error (local dev) → original results returned unchanged
- All fallbacks logged via `debugWarn` (no thrown errors)

### Live Browser Verification
- **URL:** `http://localhost:5173/?rerank=1&nodemo=1`
- **Search query:** "coffee"
- **Result:** `data-search-status="results"` — search completed successfully
- **CORS:** NIM endpoint blocks cross-origin from localhost (expected). Rerank gracefully fell back to original results. In production, this requires a proxy or server-side API key.
- **Console errors:** 2 CORS errors (expected, no other errors)
- **Search pagination:** Still functional after rerank failure

### CORS Note
The NIM endpoint (`ai.api.nvidia.com`) does not send `Access-Control-Allow-Origin` headers, so direct browser fetches from `localhost:5173` are blocked. The rerank module handles this gracefully via the catch block. For production use, the rerank call should go through a same-origin proxy (e.g., `/api/rerank`) or use a server-side API key.
