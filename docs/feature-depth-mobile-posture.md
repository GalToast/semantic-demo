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

## Owners

- Implement: pi-main-lane (safe: does NOT touch `Placeholder2D`'s unapler paint path)
- Verify: `mobile surface-contract-check` desktop+mobile; real-phone smoke (phone-farm
  pipes exist).
- Defer decision items: whether the CTA copy changes to "Enter 3D" vs "Open on desktop";
  whether iOS prefers-reduced-motion forces placeholder (yes today via `media` gates).
