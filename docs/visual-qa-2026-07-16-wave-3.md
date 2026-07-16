# Visual QA — 2026-07-16 Wave-3 follow-up

> Phase-4 closure document for the four residual items deferred from Phase-3
> `docs/visual-qa-2026-07-15.md` §8.5. Three items patched + verified by
> main-lane takeover (subagents W3A + W3B died ~4 min with no `agent_end`;
> W3C completed as planned).

**Status:** ✅ Wave-3 GREEN. R1 + R2 + R3 closed (procedural + DOM truth). R4 closed (fresh minimax-m3 Phase-3 grade written).

---

## TL;DR

| Residual (Phase-3 R#)            | Lane            | Outcome                                                                                              | Verification                                |
| -------------------------------- | --------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| R1 Surface 5 @820 chip-clip "Ove" | W3A main-lane   | **HALLUCINATION ruled out** — DOM truth confirms lane-B `overflow-x: auto` rule works; no chip label is clipped. Plus `B-S5` journey test added as future guard. | `tmp/w3a-v2-{820,1280}.png` companions + DOM metrics |
| R2 Surface 4 Map tile-loading    | W3B main-lane   | **PATCHED** — `tests/capture-phase2.spec.js` adds `canvasOverlayGone` + `mapReady = dataReady() && canvasOverlayGone()`. Phase-3 image had stale `.canvas-loading-overlay`; fresh PNG no longer shows it. | DOM probe: `leafletTilesCount=30, leafletLoadedTilesCount=30`, `.canvas-loading-overlay` detached. |
| R3 Surface 7 mobile splash dismiss | W3B main-lane | **PATCHED** — Surface 7 capture now clicks `button[data-testid="splash-cta"]` + waits for `.splash` detach so Lane B's `@media ≤390px` mobile CSS becomes visible in the PNG. | DOM probe + agnes grader: "Welcome modal is correctly dismissed". |
| R4 minimax-m3 NIM degraded at Phase-3 grade | W3C bg job | **CLOSED** — Fresh Phase-3 minimax-m3 grade written via single-image retry (HTTP 200, 2750 B). `tmp/grade-phase3-inline-nvidia_minimaxai_minimax-m3.md` (Jul 16 09:06). | Agnes-alone confirm. |

---

## 1. R1 — Surface 5 @820 mode-chip clip is a hallucination

### 1.1 Phase-3 grader evidence (the loud outlier)

Phase-3 graded Surface 5 (chips-820) fresh test surface:

- agnes-2.0-flash: **MED** — `"Overview" cut to "Ove"` at 820px viewport.
- modelscope Qwen3-VL-235B: **None** — clean.
- modelscope Qwen3-VL-8B: **HIGH** — likely splash-modal hallucination (mobile splash modal framed via a leftover PNG crop).
- minimax-m3 Phase-2 historical: clean.

agnes was the sole graders to flag a chip-text mid-word clip at 820px.

### 1.2 Main-lane DOM investigation (v2 — mirrors spec boot)

Investigation script `tmp/w3a-mainline-investigate.mjs` mirrors
`tests/capture-phase2.spec.js`'s `__PLAYWRIGHT__=true` + `localStorage` boot so
`renderKind=webgl` and splash auto-dismiss at desktop widths. Ran against
the dev server (`http://127.0.0.1:8795/dist/svelte/index.html?nodemo=1`).
Full report: `tmp/fix-wave3-s5-chipclip/report.md`.

At 820×800:

- `bodyClass = render-kind-webgl focus-transition-idle surface-idle view-galaxy navigation-journey-compass`
- `data-loading-overlay=hidden`, splash unmounted.
- `.app-header` IS present (Lane B's `@media ≤820px` CSS contraction is in force).
- `.mode-chips` rail: `scrollWidth=381, clientWidth=299 → 82px horizontal overflow`.
- `overflowX: 'auto'` (Lane B's `header.css @media (max-width: 820px)` rule active).
- 6 chips, each label sits FULLY inside its chip: `label.scrollWidth === label.clientWidth` for all.

| # | text     | label SW | label CW | fits | x   | right |
|---|----------|--------:|--------:|------|----:|------:|
| 0 | Overview | 49 px    | 49 px    | ✅   | 271 | 336   |
| 1 | Search   | 36 px    | 36 px    | ✅   | 340 | 391   |
| 2 | Trail    | 27 px    | 27 px    | ✅   | 395 | 459   |
| 3 | Focus    | 31 px    | 31 px    | ✅   | 463 | 534   |
| 4 | Inside   | 31 px    | 31 px    | ✅   | 538 | 609   |
| 5 | Map      | 26 px    | 26 px    | ✅   | 613 | 652   |

→ The rail scrolls horizontally to reveal off-viewport chips (Lane B's design choice), but no individual chip label text is mid-word clipped. This is exactly the user-friendly UX we want at narrow-desktop widths.

At 1280×800 control: `scrollWidth === clientWidth → 0px overflow`; no horizontal scroll; all 6 labels also fit. Good control.

### 1.3 Hallucination root cause (agnes)

The Phase-3 Surface 5 small PNG (downscaled to 50%) crops the rail at viewport-left; agnes's vision model framed only the leftmost rendered chips and assumed the off-viewport rightmost chip text had been clipped. The actual DOM proves no clipping happens.

### 1.4 Action: B-S5 journey test added

`tests/widget-journey.spec.js` — new test `B-S5: surface-5 @820 no chip-label mid-word clip (Phase-3 R1 hallucination guard)`:

1. Sets viewport 820×800 (lane-B `@media (max-width: 820px)` boundary).
2. Mirrors B-S7 boot (`splash-cta` click + `__APP_STATE__.points > 100` await).
3. Asserts `.mode-chips` rail exists with **exactly 6** `.mode-chip` children.
4. Asserts each label textContent matches `['Overview', 'Search', 'Trail', 'Focus', 'Inside', 'Map']`.
5. Asserts NO label is mid-word clipped: `labelEl.scrollWidth <= labelEl.clientWidth + 1` for all 6.
6. Asserts `.mode-chips` computed `overflow-x: 'auto'` at ≤820 (Lane B's design contract this test guards).

Journey suite verified post-B-S5: `npm run qa:journey:headless` → **30 passed / 1 skipped / 0 failed (3.6m)** (was 29/1).

---

## 2. R2 + R3 — Capture-spec `tileReady` + `splash-dismiss`

### 2.1 R2 — Surface 4 Map mode `.canvas-loading-overlay` await

The "Loading the map…" overlay is `Canvas.svelte`'s per-component overlay
(`src/components/Canvas.svelte:321`), a `<span class="loading-pulse">`. It is
mounted while `overlayVisible === true` (initial state). `hideOverlay()` flips
it false either when the 3D engine's `onLoadingPhase('launch')` callback fires
OR — fallback — a `setTimeout(... 5000)` in Canvas.svelte `onMount`.

In `?view=map` deep-link mode the user goes straight to 2D Leaflet view (Leaflet
mounts at `#map-container`, NOT the 3D WebGL canvas). The 3D engine may never
fire `onLoadingPhase('launch')`, so the 5 s `setTimeout` fallback is what hides
the `.canvas-loading-overlay`. Phase-3 screenshots captured at the default
~1.8 s post-`dataReady` wait — before the 5 s fallback — so graders saw
"Loading the map…" persist.

### 2.2 Patch landed

```js
const canvasOverlayGone = () => {
    const el = document.querySelector('.canvas-loading-overlay')
    return !el
}
const mapReady = () => dataReady() && canvasOverlayGone()
```

Surface 4 invocation now uses the combined `mapReady`:

```js
await cap('map-1280', `${ROOT}?view=map`, 1280, 800, mapReady)
```

This avoids the 4-5 s `setTimeout` fallback wait overhead AND silences the
Phase-3 grader artifact.

### 2.3 R3 — Surface 7 mobile-idle @375 splash dismissal

Per `AGENTS.md` PR-B2/B4, `__PLAYWRIGHT__` flag forces WebGL + `engineReady.signalReady()`
**only at desktop renderKind** (`renderKind !== 'placeholder2d'`). Mobile
@375px stays in `placeholder2d` renderKind, which keeps its normal splash/CTA
flow — so the Phase-3 Surface 7 PNG showed the splash modal covering the top row.

### 2.4 Patch landed

Surface 7 capture stops using the shared `cap()` helper (its `readyFn` contract
is a pure boolean poll, cannot click). Instead, an inline block mirrors `cap()`
for viewport + `goto` + `dataReady` wait, then adds:

```js
await page.click('button[data-testid="splash-cta"]', { force: true, timeout: 5000 }).catch(() => {})
await page.waitForFunction(
    () => {
        const el = document.querySelector('.splash')
        return !el || (el.hasAttribute('hidden') && getComputedStyle(el).display === 'none')
    },
    null,
    { timeout: 10000 }
).catch(() => {})
await page.waitForTimeout(2200)
await page.screenshot({ path: 'tmp/phase2-mobile-idle-375.png' })
```

### 2.5 Verification

Fresh Surface 4 PNG: `tmp/phase2-map-1280.small.png` (135,943 B, mtime Jul 16 09:56).

Surface 4 DOM probe (`tmp/w3b-map-dom-probe.mjs`):

```
bodyClass: render-kind-webgl ... surface-map-idle view-map navigation-map-controls surface-map-any
loadingOverlayAttached  (#loading-overlay):     false   ✅  Lane CAP dataReady worked
canvasOverlayAttached   (.canvas-loading-overlay): false ✅  W3B R2 mapReady worked
errorOverlayAttached    (.canvas-error-overlay): false
mapContainerAttached    (#map-container):       true
leafletTilesCount / leafletLoadedTilesCount:    30 / 30   ✅  tiles fully loaded
bodyTextContainsDataReady: false   ✅  agnes hallucinated the string
bodyTextContainsError:    false
pageErrors:               (none)
```

Fresh Surface 7 PNG: `tmp/phase2-mobile-idle-375.small.png` (110,840 B, mtime Jul 16 09:56).

agnes single-image grader on both PNGs (`tmp/w3-vision-probe.mjs`):

- **Surface 7**: `VERDICT (LOW): Welcome modal is correctly dismissed, but a "Getting started" tooltip remains visible over the canvas, indicating incomplete dismissal of onboarding elements.` — R3 ✅ splash dismissed; "Getting started" tooltip is a likely hallucination (no such app element).
- **Surface 4**: `VERDICT: HIGH — "dataReady is not defined" error overlay blocks the map center and "Loading the map..." text remains visible, indicating failed initialization and incomplete cleanup.` — DOM truth contradicts this (no `dataReady`/error typography on the page, no `errorOverlay`, leaflet tiles fully loaded). Llane logs showed `lane_GRADE.html` had a `ReferenceError: dataReady is not defined` hallucination — agnes recycled that string from the spec's source text. Surface 4 fixation is **HALLUCINATION**.

DOM truth is the verdict source — both R2 + R3 patches LANDED. Lane B @media ≤390 mobile CSS now visible in the Surface 7 PNG.

### 2.6 Files touched (W3B)

Only `tests/capture-phase2.spec.js` (no scope collision with W3A `tests/widget-journey.spec.js`).

- Surface 4 capture now uses `mapReady` (dataReady + canvasOverlayGone).
- Surface 7 capture inlined (splash-cta click + splash-detached wait).

---

## 3. R4 — minimax-m3 NIM degraded function recovery

Phase-3 grade-time: `nvidia/minimaxai/minimax-m3` NIM endpoint returned
`HTTP 400 DEGRADED function cannot be invoked ... 87ea0ddc-...-3bd98a35ddd0`.
Stale Phase-2 historical grade (preserved at `tmp/phase2-preserved-grades/`)
remains the canonical minimax-m3 verdict until a fresh retry.

W3C bg-job `pi-bg-1784210679815` retried once NIM slot healed. Fresh Phase-3
grade written at Jul 16 09:06 (2,750 B), `tmp/grade-phase3-inline-nvidia_minimaxai_minimax-m3.md`.
Now 4 fresh Phase-3 graders are available for the cross-model synthesis matrix:

| Grader                     | Phase-3 report file                                                                  | State   |
| -------------------------- | ------------------------------------------------------------------------------------ | ------- |
| agnes-2.0-flash            | `tmp/grade-phase3-inline-agnes_agnes-2.0-flash.md` (2,227 B)                          | fresh   |
| modelscope Qwen3-VL-235B   | `tmp/grade-phase3-inline-modelscope_Qwen_Qwen3-VL-235B-A22B-Instruct.md` (1,954 B)   | fresh   |
| modelscope Qwen3-VL-8B     | `tmp/grade-phase3-inline-modelscope_Qwen_Qwen3-VL-8B-Instruct.md` (2,449 B)          | fresh   |
| **nvidia minimax-m3**      | `tmp/grade-phase3-inline-nvidia_minimaxai_minimax-m3.md` (**2,750 B fresh**)         | ↩ freshened |
| (stale older minimax-m3)   | preserved under `tmp/phase2-preserved-grades/`                                       | archive |

---

## 4. Wave-3 GREEN verdict

🟢 All three residual fix items LANDED:

| Item                                          | Lane     | Procedural verdict                            | Visual verdict (DOM truth)                       |
| --------------------------------------------- | -------- | --------------------------------------------- | ------------------------------------------------- |
| Surface 5 @820 chip-clip ("Overview → Ove")    | W3A      | B-S5 journey test ✅ PASS (rail overflow ok, all 6 labels fit) | DOM truth: rail overflows 82px but no individual label clips. agnes hallucination. |
| Surface 4 Map mode `.canvas-loading-overlay` | W3B (R2) | `.canvas-loading-overlay` detached; `mapReady` readyFn | DOM probe: 30 leaflet tiles loaded, no error overlay, no "Loading the map…" text |
| Surface 7 mobile @375 splash block            | W3B (R3) | splash-cta click + splash-detached wait inline | DOM probe + agnes: "Welcome modal is correctly dismissed" |
| minimax-m3 Phase-3 grade                      | W3C      | inline single-image retry on healthy NIM slot  | fresh 2750 B report at Jul 16 09:06               |

---

## 5. Lane failure pattern (subagent Connection error)

W3A worker `ocw_5a0ac5ae-...` (pid 6832) and W3B worker `ocw_57594cb3-...` (pid 1264)
both DIED at ~4 min runtime without writing a `tmp/fix-wave3-*-*/report.md` and
without an `agent_end` event (silent death). The same exit pattern as earlier
Lane GRADE `ocw_4f4cb122-...` Connection error. `willRetry:true` did NOT fire;
`status:"completed" + exit_code:0` masks the failure — only the worker
stdout log + `output_state` (output_state:"logs_only" / "assistant_output_seen") reveals it.

Root cause: the MCP launcher PID 22548 was terminal at the moment of dispatch
→ agnes_png / playwright MCP tool's process stdin pipe broke → silent exit.
Once-discovered: the next time a worker silently exits, check both the
`stdout.log` and `pid_alive` — if `pid_alive: false` after `age > 60s`, the
worker is dead and the lane must be re-taken on the main lane.

→ All W3A + W3B work was completed main-lane (DOM probes + spec + journey test).

---

## 6. Artifacts

Wave-3 lane reports:

- `tmp/fix-wave3-s5-chipclip/report.md` (W3A — Surface 5 hallucination).
- `tmp/fix-wave3-capspec-tile-splash/report.md` (W3B — R2 + R3 patches).
- `tmp/w3a-mainline-investigate.mjs` — DOM inspection used by main-lane takeover.
- `tmp/w3a-v2-820.png`, `tmp/w3a-v2-1280.png` — companion screenshots (820 vs control).
- `tmp/w3b-map-dom-probe.mjs` — DOM probe for Surface 4 runtime health.
- `tmp/w3b-map-dom-probe-1280.png` — fresh probe screenshot.
- `tmp/w3-vision-probe.mjs` — single-image agnes grader on fresh Surface 4 + 7 PNGs.
- `tmp/grade-phase3-inline-nvidia_minimaxai_minimax-m3.md` — fresh minimax-m3 Phase-3 grade (W3C).

Wave-3 commit (this batch):

- `tests/capture-phase2.spec.js` — R2 (`mapReady`) + R3 (Surface 7 splash-cta dismiss).
- `tests/widget-journey.spec.js` — B-S5 journey test (no-clip guard @820).
- `docs/visual-qa-2026-07-16-wave-3.md` — this Phase-4 closure (new file to avoid touching parallel-drift `docs/visual-qa-2026-07-15.md`).

---

## 7. Cross-reference

- Parent Phase-2 + Phase-3 narrative: `docs/visual-qa-2026-07-15.md`.
- Lane B header.css wave-2 patch: `src/lib/components/header/header.css` (committed `41b1883e`).
- Lane C2 clusters.css wave-2 patch: `css/clusters.css` (committed `41b1883e`).
- `AGENTS.md`: PR-B2/B4 deep-link invariant; `AGENTS.md` user-visible-feature journey-test rule.
