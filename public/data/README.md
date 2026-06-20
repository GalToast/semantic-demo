# Bulk Data — `public/data/`

This directory contains large data files that are served as **static assets** at
runtime. They are NOT bundled into JS chunks by Vite — instead, they are
lazy-fetched via `fetch()` with cache-buster query parameters.

**Do NOT move these files back into `scripts/` or `src/`.** They live here so
that `git clone` stays lightweight (~286 MB lighter) and Vite can serve them
directly.

## Files

| File | Size | Source |
|------|------|--------|
| `leadEnrichment.public.json` | ~18 MB | `scripts/extract-lead-enrichment.mjs` |
| `leadEnrichment.internal.json` | ~34 MB | `scripts/extract-lead-enrichment.mjs` |
| `leadopsLeads.json` | ~12 MB | `scripts/extract-crm-sqlite.py` |
| `leadopsProfiles.public.json` | ~20 MB | `scripts/extract-crm-sqlite.py` |
| `leadopsProfiles.internal.json` | ~34 MB | `scripts/extract-crm-sqlite.py` |
| `leadopsContacts.json` | ~1.4 MB | `scripts/extract-crm-sqlite.py` |
| `leadopsBusinessFacts.json` | ~15 MB | `scripts/extract-crm-sqlite.py` |
| `qwen3_embeddings.npy` | ~33 MB | `scripts/build-embeddings.py` |
| `qwen3_embeddings_meta.json` | tiny | `scripts/build-embeddings.py` |
| `semantic_threads.dat` | ~79 MB | `scripts/build-semantic-threads.py` |
| `semantic_threads_ui.dat` | ~40 MB | `scripts/build-semantic-threads.py` |
| `semantic_space_layout_manifest.json` | tiny | `scripts/build-semantic-space.py` |

## Regeneration Commands

### CRM + Lead Enrichment (requires `../crm.sqlite`)

```bash
# 1. Extract leadops tables from CRM SQLite → public/data/leadops*.json
python3 scripts/extract-crm-sqlite.py

# 2. Build enrichment JSON from leadops + parent pipeline sources
node --experimental-vm-modules scripts/extract-lead-enrichment.mjs
```

### Semantic Threads + Layout (requires embeddings + data.dat)

```bash
# 3. Build semantic thread bundles (semantic_threads*.dat)
python3 scripts/build-semantic-threads.py

# 4. Build layout manifest (semantic_space_layout_manifest.json)
python3 scripts/build-semantic-space.py

# 5. Build Qwen3 embeddings (qwen3_embeddings.npy)
python3 scripts/build-embeddings.py
```

> **Note:** Run these from the repo root. The extract scripts now write
> directly to `public/data/` instead of `scripts/`.

## Runtime Fetch Pattern

These files are fetched lazily at runtime via `buildAssetUrl("data/<filename>?v=...")`
in `src/lib/data-loader.ts` and `src/lib/semantic-threads.ts`. The cache-buster
query parameter (`v=`) is an hourly epoch to invalidate browser caches on deploy.

Workers (`src/lib/workers/data-worker.ts`) handle the heavy parsing off the main thread.
