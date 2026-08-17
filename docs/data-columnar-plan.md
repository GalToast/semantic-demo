# Columnar payload plan — the semantic index (2026-08-17)

Target: the REAL mobile hostage — `public/data/semantic_threads.dat` (78.7 MB).

## Measured facts
- File: 82,495,722 B (78.7 MB) JSON. Top: `{"generated_at":…,"model":{"backend":"public_qwen_index","embedder":"…/Qwen3-Embedding-0.6B",…}}` + a large embedded array = vector rows.
- `src/data.dat` (1.8 MB, the 8,406 row tuples) columnar-esonly saves **14.9%** — strings dominate; its wire is already brotli'd (J52). NOT the priority.
- The BULK cost: JSON.parse of 78.7 MB ≈ 1-3 s + several‑fold memory spike in the tab; on mobile this is the LCP/eat-the-jank clause.

## Target binary format (prototype spec)
```
magic      4B  "TDB1"
count      u32
dim        u32
meta_len   u32 (string table prior)
string-table (concatenated UTF-8 + offset table: u32 per entry)
vectors:  count × dim × f32 LE         (the qwen embeddings: dim = 128/1024/x)
```
Load: fetch → ArrayBuffer → DataView reads → a Float32Array VIEW over the same buffer
(zero-copy, no JSON construction, no string row-objects). Parse ≈ 10-40 ms; peak
memory ≈ file size (no 3-4x JSON object bloom).

## Migration (phased, safe)
1. **Generator** (build-time, OUR side): read the giant once → emit `semantic_threads.dat.bin`
   + keep JSON as oracle. (New file, no loader change yet.)
2. **Loader probe**: `fetch .bin` → typed views; a test asserts row/vector equivalence
   with the JSON parse (byte-equal comparisons on a sample).
3. **Switch the loader** (data-worker/data-loader seam, OUR file) to the .bin when
   present with JSON fallback (graceful: the server keeps both).
4. **Size leaf**: 78.7 MB JSON → f32 vectors are often 4× smaller than the JSON
   (numbers stored as text); wait: depending on dims the f32 may LIE vs text — the
   prototype MUST measure; expectation = 2-5× smaller + brotli-wrapped.

## Consumers inventory (who joins the migration)
- JS client: `data-worker.ts` (loader path) — the only client-side reader of the
  giant (grep semantic_threads).
- PHP PROD (`api.php` loads data.dat, NOT the 78MB giant) — the giant = client-side
  only → PHP untouchi. Scope = safe.

## Open questions
- Exact embeddable dims + row count (need one clean stat pass on the giant).
- The .bin must ride the gzip/brotli twin pipeline (add `semantic_threads.dat.bin`
  to the W44 allowlist in vite.config.ts).

## Verdict
Do BINARY (Phase 2 - prototype) BEFORE the big PG: the bin:JSON size ratio decides
2× vs 20×; the loader path = one seam; the win = mobile LCP + tab memory. The
audit lives here; implementation = the next wave's #1.
## Giant-stats (07:02Z — decision unlocked)
- Schema: nodes = 8,406-object map, per-node = {lead_id(u32), name/city/status(str), signal_score(f32), neighbors: [ {lead_id(u32), score(f32), semantic_score(f32), same_city/same_status/bridge(flags)…} ]} — a semantic GRAPH.
- parse: 2,972 ms @82.5MB (client host tax; mobile multiplies).
- est flat bin ≈ 3-6× smaller (packed triples + string-tables for city/status).
- VERDICT: proceed binary (TDB1 spec earlier); generator reads nodes once → .bin + grotli twin (W44 allowlist add: semantic_threads.dat.bin); loader = fetch→ArrayBuffer views; JSON remains oracle until the loader flip.
APP
echo appended

## Giant-stats (07:02Z, decision unlocked)
- Schema: nodes = 8406-object map; per-node = {lead_id, name, city, status, signal_score, neighbors:[{lead_id, score, semantic_score, same_city, same_status, bridge}]} = the semantic GRAPH.
- Parse: 2,972 ms @ 82.5 MB (client-scale tax; mobile multiplies).
- Est flat bin 3-6x smaller (packed triples + string tables for city/status).
- VERDICT: proceed binary (TDB1 spec above). Generator reads nodes once -> .bin + brotli twin (W44 allowlist: semantic_threads.dat.bin); loader = fetch -> ArrayBuffer views; JSON stays as oracle through the loader flip.
