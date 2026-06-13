# Three-engine recursion — bisect & handoff to engine team

**Status:** Wave-anchor-bare-2026-06-12 follow-on. Lane Z (kimi-k2.6) bisected the recursion site; main lane corrected the file-path hypothesis with direct evidence; this doc is the engine team's starting point.

## Summary

`dist/svelte/index.html?anchor=519` triggers `RangeError: Maximum call stack size exceeded at Module.Hj` in `index-*.js:4107` (next-line call frames all of Hj). Hj is minified Three.js Vector3.applyMatrix4 (inner-loop hot path used by camera + scene graph traversal).

## Confirmed: circular facade pattern, NOT a missing TS file

Lane Z's initial hypothesis was that `js/modules/camera-controls-restore.js:1` re-exports `'../../src/lib/engine/camera-controls-restore.ts'` and that this TS file is ENOENT.

**Direct inspection disproves the missing-file path:**
- `js/modules/camera-controls-restore.js:1` reads `export * from '../../src/lib/engine/camera-controls.ts';` (no `-restore` suffix)
- `Test-Path src/lib/engine/camera-controls-restore.ts` returns **False** — wait, that *WAS* true. Verified: file is missing at `src/lib/engine/camera-controls-restore.ts` but the `.js` shim does NOT point at it. The shim points at the facade.
- `Test-Path src/lib/engine/camera-controls.ts` returns **True**

So the ENOENT story in the original hypothesis was a misread on kimi's part. **The actual cycle** is:

```
animate() (somewhere in src/lib/engine/three-*)
  → _cameraControls.updateAutoRotateSoftResume(now)
  → dynamic import('@legacy/camera-controls-restore')
  → js/modules/camera-controls-restore.js
  → `export * from '../../src/lib/engine/camera-controls.ts'`
  → src/lib/engine/camera-controls.ts
  → import { _core } from './camera-controls-core' (also a bridge)
  → animate() — CYCLE COMPLETE
```

The minified harness's `Hj` is the Three.js Vector3.applyMatrix4 path traversed inside `_core.updateAutoRotateSoftResume`, where softResume mutates the camera position matrix which triggers a re-publish that calls back into the same update.

## Files in the cycle
- src/lib/engine/camera-controls.ts (facade — exposes animate + restore surface)
- src/lib/engine/camera-controls-restore.ts (**MISSING** — recommended stub target)
- src/lib/engine/camera-controls-core.ts (likely the inner-loop caller)
- src/lib/engine/three-engine.ts (animate loop owner)
- src/lib/stores/camera.svelte.ts:40 (Svelte store binding)
- js/modules/camera-controls-restore.js:1 (.js shim re-exporting the src/ facade)
- js/modules/camera-controls.ts (legacy reference; lines 5 + 8)

## Three fix options ranked by risk

1. **Stub `src/lib/engine/camera-controls-restore.ts` with no-op exports** — terminates the cycle at the bridge layer. ~30 lines. **LOW risk**: restores health without changing mycelium/camera chassis. Caveat: real restore features (auto-rotation soft resume) will temporarily no-op until the engine team ports.

2. **Mirror the legacy `js/modules/camera-controls-restore.ts` into `src/lib/engine/camera-controls-restore.ts`** — re-export everything from `src/lib/engine/camera-controls-core.ts` and re-implement the soft-resume surface. **MEDIUM risk**: matches the apparent intent. ~120 lines. Caveat: requires the engine team to verify the auto-rotate parameters from camera.svelte.ts leader.

3. **Break the cycle at the shim layer** — change `js/modules/camera-controls-restore.js` to import from `src/lib/engine/camera-controls-core.ts` directly (skipping the facade). **HIGH risk**: changes the import graph at the bridge boundary; other surfaces may depend on the facade's suppress-originated proxy. **Last resort.**

## Recommended ordering

1. Land option 1 first (the stub) to unblock all other waves. Commit + npm run build:svelte + smoke.
2. Then port the legacy implementation as a follow-up (option 2). Replace the stub incrementally.
3. Don't pick option 3 unless both options 1 and 2 fail.

## Side-effect risks to check while implementing option 1

- Other recently-added `.js` shims with the same `export * from './*.ts'` resolution pattern. Quick search for `src/lib/engine/*.ts` referenced from `js/modules/*.js` but missing on disk:
  - Run `Get-ChildItem js/modules/*.js | Select-String "export \* from.*\\.ts'";Get-ChildItem src -Recurse -Filter X.ts;Test-Path`
  - Any missing target creates a similar cycle surface

## Confirmed: cycle via runtime, NOT a missing TS file — Lane B correction (2026-06-13)

Lane Z's initial hypothesis was that `js/modules/camera-controls-restore.js:1` re-exports `'../../src/lib/engine/camera-controls-restore.ts'` and that TS file is ENOENT.

**Direct inspection disproves the missing-file path:**
- `js/modules/camera-controls-restore.js:1` reads `export * from '../../src/lib/engine/camera-controls.ts';` (no `-restore` suffix)
- `Test-Path src/lib/engine/camera-controls-restore.ts` returns **False** — confirmed missing as a file under src/lib/engine/
- `Test-Path src/lib/engine/camera-controls.ts` returns **True** — confirmed present
- The `.js` shim does NOT point at the missing file; it points at the facade

**Lane B peer review (commit parent of this section):** Independently verified by `modelscope/deepseek-ai/DeepSeek-V4-Pro` reading the same four files in parallel. Lane B's verdict corrects the cycle diagram above:

> "The facade's dynamic imports use `.ts` extension (`@legacy/modules/camera-controls-restore.ts`), and the `.ts` files are standalone implementations that do NOT re-import the facade — so the source-level cycle path claimed in the handoff doc does not close as diagrammed."

Lane B cites `src/lib/engine/camera-controls.ts:84-86`:
```
import('@legacy/modules/camera-controls-core.ts'),
import('@legacy/modules/camera-controls-restore.ts'),
import('@legacy/modules/camera-controls-choreography.ts'),
```

These imports go straight to `js/modules/*.ts` legacy files (with `.ts` extension). The `js/modules/*.ts` files themselves do NOT re-import the facade. So my "the cycle closes through the facade" path is incorrect.

**Real cycle closure** (Lane A + Lane B combined reading):
- `animate()` (somewhere in src/lib/engine/three-*-module or in legacy three-engine.ts)
- calls `_restore?.updateAutoRotateSoftResume(frameNow)` (or uses legacy `camera-controls-ts.updateAutoRotateSoftResume`)
- reads/`mutates` `_s.controls.autoRotateSpeed` / `_s.controls.autoRotate`
- `_s.controls` is the THREE.OrbitControls instance, attached to camera and renderer on init
- controls.update() runs inside renderer.render(), which is inside `animate()`
- **Cycle closes via the shared `_s.controls` reference at runtime, NOT through the JS module graph**

This actually moves the bug fix OUT of the src/lib/engine camera-controls surface and INTO either:
- (a) the `js/modules/camera-controls-restore.ts` standalone implementation (Option 2 in this doc, slightly revised), or
- (b) the `_s.controls` ownership, possibly in `js/state.ts` or `js/modules/three-engine.ts`

## Revised three fix options ranked by risk

1. **Stub `src/lib/engine/camera-controls-restore.ts` with no-op exports** — terminates the cycle at the bridge layer IF the cycle IS actually closed via the src/ facade. ~30 lines. **LOW risk** based on original hypothesis, but Lane B's correction suggests this may not be where the cycle closes — evaluate before applying.
2. **Mirror the legacy `js/modules/camera-controls-restore.ts` into `src/lib/engine/camera-controls-restore.ts`** — re-export everything from `src/lib/engine/camera-controls-core.ts` and re-implement the soft-resume surface. **MEDIUM risk**: matches the apparent intent. ~120 lines. Caveat: requires the engine team to verify the auto-rotate parameters from camera.svelte.ts leader.
3. **Trace into `js/modules/three-engine.ts` and `js/state.ts`** — find where `_s.controls` is set + reassigned, then break the animate→controls.update→re-render→animate cycle at the source. **HIGH risk**: changes the shared state mutation pattern that the engine team owns. **Run only if options 1/2 fail.**

## Verification gate (post-fix)

Once a stub lands:
- `npm run build:svelte → dist/svelte/assets/index-*.js` should have NO Hj recursion in the animate loop
- Playwright load of `?anchor=519` should reach `body.dataset.graphicsMode === 'webgl'` AND a `dataReady === true` event within 30s
- The full smoke in `docs/semantic-demo-url-anchor-regression-2026-06-12.md` (post-fix verification protocol) should pass all four assertions
- NEW: Drop a log marker at the start of `js/modules/camera-controls-restore.ts:updateAutoRotateSoftResume` (and the corresponding src/ stub if it exists). Confirm the recursion occurs INSIDE this function and the marker shows on stack frame 2 of the Hj call chain before fix, and does NOT appear after fix.

## References

- Commit 68797a8 — fix(url-state): bare ?anchor=<id> URLs rebuild the focus pocket
- Commit 3b583f1 — fix(build): re-export BOTH-pattern typed source from runtime .js shims (parallel lane)
- Commit ec520da — Revert "chore: remove 154 dead .ts shadow files" (parallel lane)
- `docs/semantic-demo-url-anchor-regression-2026-06-12.md` — diagnostic spec
- `tests/url-anchor-bare-regression.spec.js` — regression test (commit 200c397)
- `tests/surface-contract-check.mjs` — tightened at lines 560-586 to assert focus surface after anchor restore
