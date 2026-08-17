# Data Envelope — semantic-explorer point/tuple contract

Dissected 2026-08-17 (s4-envelope, main-lane). The "opaque" data is a **tuple array**, not binary.

## Record layout (src/data.dat + public/data/semantic_threads.dat rows)

Sample row (evidence, verbatim from src/data.dat):

```
[0.5562, 0.165, 0.772, 1, "1845 SOLUTIONS", "Management consulting", "Conroe", 1, 30.368956569529, -95.307932726695, "https://1845solutions.com/", "info@1845solutions.com", "(346) 648-1845", "IT security and network design...", "active", "541611"]
```

| id | Type | Meaning | Constraint |
|----|------|---------|------------|
| 0 | number | semX coordinate (mycelium space) | [0,1] |
| 1 | number | semY coordinate | [0,1] |
| 2 | number | semZ coordinate | [0,1] |
| 3 | number | cluster index (0..20) | small-cardinality |
| 4 | string | business name | non-empty |
| 5 | string | category | — |
| 6 | string | city | — |
| 7 | number | record index (lead_id basis; ?record=N) | unique 1..N |
| 8 | number | latitude | ~29.9–30.4 |
| 9 | number | longitude | ~−95.7..−95.0 |
| 10 | string | website URL (nullable) | — |
| 11 | string | email (nullable) | — |
| 12 | string | phone | — |
| 13 | string | blurb | — |
| 14 | string | status | e.g. `active` |
| 15 | string | NAICS code | e.g. `541611` |

File: `src/data.dat` = a JSON **array-of-rows** (8,406 rows expected); `public/data/semantic_threads.dat` = JSON object shell (`{"generated_at":…,"model":{…}, …}`) wrapping the same row shape. Both load → `state.rawPositionsBuffer` (Float32) from cols 0-2.

## Loader path

- `src/lib/workers/data-worker.ts` → `positionsBuffer: Float32Array` (col 0-2) + `clustersBuffer: Uint16Array` (col 7).
- Deep-link `?record=N` matches `lead_id === N` at the row level (col 3).

## Charges (product notes)

- 82MB of JSON: mobile path still ships it; a binary (protocol-buffered rows) would cut load ~4×; the compressor never touches it (allowlisted `data.dat` in vite W44 → .br twin exists, not measurable in JS meter).
- Contract tests to add when lane allows: row-length == 16, type class per col, coords ∈[0,1]³, ids unique.

_See also: tests/unit-active/envelope-contract.test.ts (this folder) for the parse-time verifier._
