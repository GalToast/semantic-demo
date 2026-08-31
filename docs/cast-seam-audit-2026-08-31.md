# Cast Seam-vs-Lie Audit — 2026-08-31

Follow-up to the cast-ratchet closure (commits `ac4ebe84b`/`1642b3498`/`d8e60e81e`).
The ratchet verdict said: "remaining casts are named boundary seams — classify
seam-vs-lie in future audits, don't count." This is that classification.

## Method

Every `as unknown as` site in `src/` (both `.ts` and `.svelte`, comments
stripped — same counting rules as `tests/unit-active/as-unknown-as-budget.test.ts`)
extracted with ±2 lines of context, then classified against the W48 taxonomy:

- **window-bridge** — `window as unknown as { __flag__ }` globals
  (sanctioned per `docs/window-global-allowlist.md`)
- **lazy-import / shim sentinel** — `null as unknown as Module` lazy shims
- **worker-scope** — `self as unknown as WorkerScope` worker boundaries
- **three-engine / vendor-adapter** — Three.js, Leaflet, Bloom postprocessing
- **store-mirror bridge** — `mirror as unknown as StoreApi` (documented
  mirror→store pattern)
- **structural read-view** — record/shape widening at analyzer/adapter params
  (`as Record<string, unknown>`), documented in comments at each site

## Verdict

**80 sites total — 80 seams, 0 lies.** Every site either (a) sits on an
external boundary (window, worker, vendor, import), (b) bridges a documented
internal adapter contract, or (c) carries an explanatory comment naming the
structural reason. No cast was found hiding a type hole where the source type
could simply be tightened; the June tightening wave (141→91) and the
readonly-cascade wave already removed that class.

Budget note: `BASELINE = 91` in the budget test vs 80 actual. This audit
removed no casts, so the budget stays; **recommendation:** lower `BASELINE`
to 82 in the next commit that lands a real cast removal (keeps a small
working margin while re-ratcheting).

## Breakdown

| Category | Sites | Representative locations |
|---|---|---|
| window-bridge | 15 | DevToolsMount:51, SpectorInspector:26/54, telemetry/test-compat globals |
| three-engine / vendor | 12 | thread-manager:908, three-engine-render-loop:252-253 (toArray→tuple), three-postprocessing:89, three-listener-registration:166, camera-controls restore |
| structural read-view | 14 | canvas-hit-test:248, canvas-interaction:143, canvas-hover-preview:133, focus-ui:173, canvas-keyboard-nav:106 (analyzer `Record<string,unknown>` params), orchestration/lifecycle:268, triggers:291 |
| store-mirror bridge | 8 | demo.svelte:127, viewport.svelte:112, journey.svelte:321, search-core:219, results-ui:24, focus.svelte:179, focus-pocket:144 |
| lazy shims & sentinels | 7 | journey-webgl-lazy:46/198/239, overlay-debug:37-38, silent-null helper (documents the removed pattern), three-engine-timers:36 |
| svelte/leaflet adapters | 5 | App.svelte:416 (Snippet), MapView:193/204, map-leaflet-runtime:40, adapters:198 |
| worker-scope | 3 | data-worker:243, mycelium-build-worker:561 (WorkerScope facade), mycelium-worker-client:94 |
| legacy-state probes | 4 | main.ts:432/437/545 (test-compat proxy), three-engine-teardown:170 |
| registry/narrowing residue | 12 | focus-pocket-profiles:71/90 (motif spreads), thread-inspector-webgl:52/144/145 (ThreadEdge index-signature tolerance, commented), thread-inspector-render:49 (documented `as any` replacement), thread-model:30, thread-settler:360, mycelium-bezier:138-139 (guards prove presence, commented), semantic-guide:329, journey.ts:220, adapter-deps:33 (documented Svelte 5 proxy assignment), responsive-renderer:71, focus.ts:129 |

(Groups sum to 80; multi-site files appear in their dominant group.)

## Maintenance rule

New `as unknown as` sites must land with a comment naming the boundary or the
structural blocker, same as the existing population. The budget test enforces
the count; this document is the qualitative contract. Re-run this
classification if the count grows by more than ~5 between audits.
