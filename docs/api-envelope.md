# API Envelope — search contract (api/search.php)

Dissected 2026-08-17 (s4-envelope main-lane pass 2). Same discipline as the modem RF-INTF map: strings → handlers → protocol table.

## Response envelope (verified)

```
{
  "ok":              bool,
  "query":           string,
  "mode":            "local_record_search_v1",
  "source":          "local-records",
  "retrieval_source": "lexical_fallback" | (semantic variant),
  "retrieval_label": "Lexical fallback" | ...,
  "degraded":        bool (true ⇒ fallback path engaged),
  "reason":          string (why degraded; e.g. no semantic index),
  "count":           int,
  "results":  [ { lead_id, name, city, status, public_note, public_detail,
                  address, cluster, naics, score, semantic_score,
                  lexical_bonus, retrieval_source } ]
}
```

## Result-row field table

| Field | Notes |
|-------|-------|
| `lead_id` | record key (matches tuple col 7 / `?record=N`) |
| `cluster` | semantic cluster int — corresponds to data-envelope col 3 (0..20) |
| `naics` | real NAICS when present, else `clusterLabel` fallback; JS matches NAICS prefix (e.g. `624410`) |
| `score` | 6-dp; used for sort desc, then `lead_id` asc tiebreak |
| `semantic_score` | null on the fallback path — real semantic engine fills it |
| `retrieval_source` | per-record: `lexical_fallback` on the degraded path |

## Fallback/gate semantics (verified only what's on the read surface)

- Filter: only records with `status === 'active'` are scored.
- `retrieval_source: lexical_fallback` + `degraded: true` = the *banner** the frontend keys on ("demo data" amber vs live).
- Token matching: name/what/note tokens counted with `countSemanticTokenMatches`; blob matched vs raw query tokens (line 100).
- `staticDev=0` (frontend flag) forces live + surfaces errors — see docs/search-fallback.md for the full gate tree.

## Un-read remainder (honest scope)

Reads above cover the fallback branch envelope ~lines 235–285 + sorts; the SEMANTIC success branch (non-fallback) + `search_*`storage/cache layers (loadSemanticSearchCache TTL) not yet walked — matching the user-facing "when live" half.

## Why it matters

This closes the "which path actually ran" ambiguity the UI admits (`?staticDev=0` surfaces errors; the yellow banner conflates api-down with demo-data). With the envelope named, a smoke contract can assert `degraded` flag **and** the `retrieval_label` pairing — turning a UX guess into a checked field.
