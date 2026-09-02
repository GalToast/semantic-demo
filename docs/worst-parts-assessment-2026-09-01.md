# Semantic Explorer worst-parts assessment — 2026-09-01

This is a fresh, evidence-backed ranking after the compact semantic transport
build and state-ownership work. The ranking separates shipped fixes from debt
that still makes the project fragile or expensive to change.

## What is no longer the worst part

- Compact UI semantic transport is working: the focused browser smoke reached
  `semanticThreadsStatus=ready`, `semanticSpaceLayoutStatus=ready`,
  `semantic_threads_ui.dat.bin`, and a neighbor map of 8,406 records.
- The fresh production build passed TDB1/TDBU/TDBR integrity and the
  uncompressed-data gate.
- `appState` is the canonical runtime object. The old state alias was removed
  from the active state module; the remaining legacy window/test proxy is an
  explicit compatibility boundary, not a second production store.

## Ranked problems

### 1. Semantic-index provenance is silently optional — P1

`npm run check:semantic-space` passes the data-level assertions, but reports
`index_dir` absent and `indexOrderMismatches=8406`. The index provenance branch
is conditional in `tests/semantic-space-audit.mjs:307-329`, so a missing
embedding index skips the checks that prove row order and embedding identity.

Impact: the app can have internally consistent row/thread/layout counts while
the source embedding index is missing, stale, or reordered. That is the most
serious correctness gap because the visualization can look healthy while its
semantic relationships are not reproducibly tied to the source corpus.

Fix: publish a reproducible index manifest plus metadata/embedding fixture for
the release corpus, then make the release gate fail when the manifest claims an
index but the files or hashes are absent. Keep the data-only checks for fresh
clones, but label that mode explicitly as provenance-incomplete.

### 2. Cold/mobile performance has very little bundle headroom — P1

The 2026-09-01 build is 1,869.90 KiB raw JS and 555.34 KiB gzip JS against
1,902/566 KiB ceilings. The largest chunks are `three.module-*.js` at
716.75 KiB, `search.svelte-*.js` at 129.23 KiB, and
`mycelium-build-worker-*.js` at 123.79 KiB. The recorded paint evidence still
puts warm LCP near 2.4s and cold LCP near 6.8s; those measurements need a
quiet-window rerun, but they already identify cold startup as recorded debt.

Impact: only about 32 KiB of raw-JS ceiling slack remains, so routine feature
work can turn a green build into a release-blocking regression. The product has
an intentional placeholder mobile path, but the desktop/3D path remains
expensive and both cold paths need explicit measurement.

Fix: run a quiet N≥3 cold/warm measurement, then attack the largest boundary:
split or reduce the Three.js graph, keep search and postprocessing out of the
bare/mobile path, and move any remaining worker bootstrap off the first
interaction. Do not lower the live ceiling until a measured reduction lands.

### 3. Compatibility state still creates a hidden migration tax — P2

The production state source is now `appState`, but `src/main.ts:323-535` still
maintains `__LEGACY_APP_STATE__`, a merged compatibility proxy, and test-state
fallbacks. `three-store-sync.ts` also retains fields named `legacyState` for
transient renderer-handle sinks.

Impact: a test can observe a value through the compatibility proxy that is not
owned by the same path as the production read. This is no longer a duplicate
store bug, but it remains a high-risk seam for future features and makes state
ownership harder to audit.

Fix: inventory every remaining proxy consumer, document each compatibility
field's owner, add a removal condition, and delete the window proxy once the
last legacy/test consumer is migrated. Keep renderer-handle mirroring separate
from application-state naming.

### 4. Reproducibility still depends on private assets and optional live API — P2

The new preflight correctly fails on absent or suspiciously small runtime data,
which prevents the old misleading `points:0` journey failure. It now reports an
absent optional `:8795` live API as `INCOMPLETE` rather than `ALL GREEN`, while
`VERIFY_REQUIRE_LIVE_API=1` fails closed for release checks. `src/data.dat` and
the semantic artifacts remain private and require the bootstrap path (`gh auth`
locally or `DATA_DEPLOY_KEY` in CI).

Impact: a fresh clone can still exercise only the static/demo path, but the
verification summary now exposes that coverage gap instead of calling it fully
green. Release CI must opt into the required live-API mode.

Fix: make CI publish an explicit `private-corpus=present|absent` and
`live-api=live|skipped` result in the summary, and add one required release job
with the private corpus and live API enabled.

### 5. The QA surface is broad but its truths are easy to confuse — P2

The hard bundle check and stamped trend check now share one policy module, and
the data-twin restore was moved after the build so compression can actually
pass. The remaining risk is process-level: the 2026-09-01 trend baseline is a
rapid restamp from a dirty worktree and records a +159.0 KiB delta from the
2026-08-24 stamp.

Impact: the gate is green for the current era, but future changes can hide in a
baseline that was blessed alongside unrelated dirty paths. Focused transport,
semantic-space, type, and build checks are green; this is not evidence that the
full journey/release matrix is green.

Fix: keep the new baseline, require a clean-tree restamp before the next
quarterly decision, and have CI publish the focused gate matrix alongside the
full-suite result instead of one undifferentiated green/red status.

## Recommended execution order

1. Restore semantic-index provenance and fail closed for release builds.
2. Run the quiet cold/mobile performance campaign and reduce the largest
   first-load chunks.
3. Finish the compatibility-boundary inventory and retire the proxy by proof.
4. Add private-corpus/live-API status to CI and keep the trend baseline under
   review rather than raising any hard ceiling.
