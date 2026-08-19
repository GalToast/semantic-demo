# S5 — Mobile Posture Decision (feature-depth audit, 2026-08-19)

**Status:** DRAFT for owner decision · **Owner:** product (user) · **Author:** pi-main-lane

## Current state (measured)

- Mobile/narrow renders `placeholder2d`: a static SVG "Preview" + CTA "Open full 3D
  experience" (`src/components/Placeholder2D.svelte`); WebGL lazy-loads only after the CTA.
- `Placeholder2D` is first-paint critical on the mobile boot screen (W51/W54/W55 history —
  it was reverted from lazy precisely because lazy-gating race broke splash).
- Why: keeps the 587 KB three.js chunk off the mobile cold path; LCP = cheap SVG.
- WebGL2-capable phones are now universal; the blocker is battery/thermal + a shot reality.

## Options

### A — Keep desktop-first (cost ~0)

Mobile stays the honest "Preview → desktop" doorway. Ship S1/S2/S3 polish; call it done.
Risk: a mobile-first audience never sees the product's core wow; recruiters on phones
could bounce on the doorway.

### B — Enable WebGL2 on modern mobile + keep placeholder fallback (medium)

Gate: `navigator.platform` irrelevant; use `isMobile() && 'WebGL2RenderingContext' in window`
plus a `touch-action`/DPI check; on success set `renderKind='webgl'` with the SAME
`Placeholder2D` behind `s3dSceneReady` un-ready state (the CTA becomes a "tap to enter"
scroll-trigger). Requires: mobile pointer-events audit (pinch/rotate already mapped),
tap-target audit (site 44px thumbs now standard), and a mobile surface-contract suite
(`qa:surface` on 390×844).
Risk: perf/thermal on low-end phones → keep `pixelRatio` cap + reduced-motion gates.

### C — Hybrid: mobile keeps 2D but gets a "Dive in 2D" micro-surface (medium-high)

Keep placeholder but add a compressed list/map − first 2D insight before CTA.
Largest work; strongest escape from doorway. Needs product want.

## Recommendation

**Option B with A as fallback** is the measured best: phones that can run WebGL2 get the
real product (the wow is the whole pitch), everyone else gets today's placeholder + honest
copy. Option C only if user research shows mobile users actually want in-line answers.
Gate: `SEMANTIC_USE_D3D11`-disabled phones under SwiftShader still fall to placeholder
(already true — that's the fallback path).

## D3 Acceptance runbook (flip the flag only after this passes · 2026-08-19)

Build the smoke: `VITE_S5_AUTO_ENTER_3D=1 npm run build:svelte` and serve dist to the
mid-tier handset (phone-farm, chrome-devtools protocol — patterns in
`docs/phone-farm-runbook.md` / `tmp/probe-cdp.log`):

1. `Runtime.evaluate`: `'WebGL2RenderingContext' in window` → true.
2. Hardware probe: `document.createElement('canvas').getContext('webgl2', {failIfMajorPerformanceCaveat:true})` → non-null (hardware path, NOT SwiftShader).
3. Load `${BASE}/dist/svelte/index.html` mobile-UA with the flag build; record LCP
   (`performance.getEntriesByType('paint')`), `navigator.deviceMemory`, `hardwareConcurrency`.
4. With flag ON: render-kind lands `webgl` WITHOUT a tap; the placeholder overlay
   disappears; first paint remains the SVG preview.

Acceptance bar: LCP ≤ 2.5s on mid-tier; 60s of parked-and-panning shows zero black/blank
frames (CDP video capture); thermal stays in normal range; a 2GB / reduced-motion device
stays on placeholder (probe false). Flip = rebuild prod with env var; re-run
`tests/mobile-placeholder-journey.spec.js` + the W51/W54/W55 journey specs on the
flipped build before release. (D2 copy already shipped in the flag-OFF default: the
placeholder copy is honest today regardless.)

## Owners

- Implement: pi-main-lane (D2+D1 landed 2026-08-19 — probe + copy in
  `responsive-renderer.ts` / `Placeholder2D.svelte`, flag OFF; flipping is the
  only remaining step per this runbook)
- Verify: `tests/mobile-placeholder-journey.spec.js` (headless) + real-phone smoke
  (phone-farm) per the steps above.
- Done decisions (2026-08-19): CTA copy = "Open in 3D"; reduced-motion stays on the
  placeholder path via the probe.
