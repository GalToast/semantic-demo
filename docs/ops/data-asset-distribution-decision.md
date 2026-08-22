# P4 — Data-Asset Distribution: Decision Brief (2026-08-22)

Status question from prod-readiness-findings P4: "169MB static data assets — CDN vs precompressed twins?" This brief closes the decision with measured evidence.

## What changed today (shipped to prod, verified)

| Asset                        | Before (prod)                                           | After (prod)                                    | Reduction                |
| ---------------------------- | ------------------------------------------------------- | ----------------------------------------------- | ------------------------ |
| `semantic_threads.dat`       | 82.5MB plain at wrong path (**404** at app's fetch URL) | **2.7MB br** / 3.9MB gz at correct `data/` path | ~30× + feature un-broken |
| `semantic_threads_ui.dat`    | 41.4MB plain, wrong path                                | **1.9MB gz** / 1.3MB br in `data/`              | ~20×                     |
| `leadEnrichment.public.json` | 18MB plain                                              | **1.7MB br** / 2.3MB gz                         | ~10×                     |

Root cause discovered: the app fetches `data/semantic_threads*.dat` (`buildAssetUrl('data/…')`, semantic-threads.ts:664-666) but deploy.sh shipped the files to the REMOTE ROOT — so every threads request on prod **404ed** and features silently fell back ("0 related businesses" symptoms). Twins now sit beside the plains-in-waiting at `data/`; `.htaccess` rewrite serves them when `Accept-Encoding: br/gzip` (universal in browsers).

Deploy scripts updated to match (`72f1f1e`+this commit): threads artifacts → `data/`, twins included; guards tolerate absent files.

## Decision: static precompressed twins ARE the distribution strategy

**Recommendation: adopt twins-as-shipped; do NOT add a CDN now.**

Rationale:

- Largest asset over the wire is now 2.7MB br (threads), 1.8MB data.dat (gz 455KB). Total session weight ≈ **<10MB compressed**, down from ~145MB.
- Hostinger/LiteSpeed serves twins via the existing .htaccess rules — no origin changes, no new vendor.
- A CDN adds a second cache-invalidation surface (hashed assets already bust caches; the .dat files are content-stable between deploys).
- Revisit CDN only if: real-user CWV shows network-bound LCP from far regions, or traffic makes origin bandwidth expensive.

## Follow-ups (not blockers)

1. **Prod dead weight**: `semantic_threads.dat.embed_checkpoint.{json,npy}` (15.2MB, Apr 5) at remote root are stale pipeline artifacts — safe to delete (re-derivable); also the old root-level `semantic_threads*.dat` plains (124MB) are superseded by `data/` copies + backups exist (`.bak-20260822`). Delete after one verification pass of live threads features.
2. **No-compress clients** see 404 on the dats (build ships no plains by design — compression gate deletes them). Every real browser sends br/gzip Accept-Encoding; only header-less bots hit this. Accepted.
3. **Re-measure mobile CWV against PROD** once WAF allows headless Chrome (or run LH from the origin box). Local-runner numbers don't capture this win because they measure localhost.
4. TBT regression (separate, F13): store-graph eval post-FCP — nav/store lane owns; evidence in tmp/tbt-profile.log.

## Verification commands

```bash
node scripts/lighthouse-gate.mjs --baseline=docs/lighthouse-baseline-mobile-1786741775195.json < tmp/lighthouse-mobile-*.json
curl -H 'Accept-Encoding: br' -skI https://mccullough.cloud/semantic-demo/data/semantic_threads.dat   # expect CE: br, ~2.7M
```
