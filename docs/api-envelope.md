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

| Field              | Notes                                                                                          |
| ------------------ | ---------------------------------------------------------------------------------------------- |
| `lead_id`          | record key (matches tuple col 7 / `?record=N`)                                                 |
| `cluster`          | semantic cluster int — corresponds to data-envelope col 3 (0..20)                              |
| `naics`            | real NAICS when present, else `clusterLabel` fallback; JS matches NAICS prefix (e.g. `624410`) |
| `score`            | 6-dp; used for sort desc, then `lead_id` asc tiebreak                                          |
| `semantic_score`   | null on the fallback path — real semantic engine fills it                                      |
| `retrieval_source` | per-record: `lexical_fallback` on the degraded path                                            |

## Fallback/gate semantics (verified only what's on the read surface)

- Filter: only records with `status === 'active'` are scored.
- `retrieval_source: lexical_fallback` + `degraded: true` = the _banner_* the frontend keys on ("demo data" amber vs live).
- Token matching: name/what/note tokens counted with `countSemanticTokenMatches`; blob matched vs raw query tokens (line 100).
- `staticDev=0` (frontend flag) forces live + surfaces errors — see docs/search-fallback.md for the full gate tree.

## Un-read remainder (honest scope)

Reads above cover the fallback branch envelope ~lines 235–285 + sorts; the SEMANTIC success branch (non-fallback) + `search_*`storage/cache layers (loadSemanticSearchCache TTL) not yet walked — matching the user-facing "when live" half.

## Why it matters

This closes the "which path actually ran" ambiguity the UI admits (`?staticDev=0` surfaces errors; the yellow banner conflates api-down with demo-data). With the envelope named, a smoke contract can assert `degraded` flag **and** the `retrieval_label` pairing — turning a UX guess into a checked field.

## Second half (verified 2026-08-17, pass 3)

### Router — `api.php` (`?action=`)

- `stats` (default), `semantic_guide_worker` (CLI-only; 403 for web), `semantic_lane_health` (requires same-host referrer), + dataset boot.
- Dataset load (api.php): `data.dat` candidates → JSON array-of-rows (≥7 cols / row8 with `count($row) < 7` skipped) → **canonical mapper** (PRODUCER-VERIFIED tuple contract):

| tuple col | point field |     | note                                                       |
| --------- | ----------- | --- | ---------------------------------------------------------- |
| 0–2       | x/y/z       |     | [0,1]³                                                     |
| 3         | cluster     |     | 0..20                                                      |
| 4         | name        |     | cleanText                                                  |
| 5         | what        |     | default "Montgomery County business"                       |
| 6         | city        |     |                                                            |
| 7         | lead_id     |     | the ?record=N basis                                        |
| 10        | website     |     | validWebsite-filtered                                      |
| 13        | public_note |     |                                                            |
| 14        | status      |     | lowercased; default 'active'                               |
| 15        | naics       |     | added by scripts/augment_data.py; fallthrough → text match |

### Cache layer (api/search.php)

- `loadSemanticSearchCache(file, ttlSeconds)`: age check → decoded array gains `cached:true, cache_age_seconds, cache_source:'file'`.
- `waitForSemanticSearchCache(cacheFile, ttl, waitMs)`: poll loop for a fresh cache (semantic warm path).
- `persistSemanticSearchCache`: strips transient flags before `file_put_contents(LOCK_EX)`.

### Supervisor (api/supervisor.php)

- `serviceHealthy(url, t)` / `fetchServiceHealthSnapshot` / `readServiceRuntimeState(stateFile)` / `summarizeServiceSnapshot` (`worker_answered_health`…) — the **semantic-lane health + warm-restart machinery** (`logSemanticLaneEvent`, `saveSemanticLaneState`).
- This is the seam the frontend's `semantic_lane_health` gate reads → the "boosted lane alive?" truth the UI banner should eventually name.

### Honest remainder

- The **semantic engine process** itself (the service the supervisor probes; its true retrieval_source=real scores path) lives outside this PHP tree (the service in python/rust lane per health URLs). Not dissected yet — that's the only seam left before the envelope is whole.
