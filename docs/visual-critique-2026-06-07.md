# Visual Critique — Semantic Explorer 3D Mycelium (Re-audit)

**Date:** 2026-06-07  
**Reviewer:** Source-code analysis against `js/modules/three-*.js`, `design-tokens.js`. Updated from 2026-06-06 baseline.  
**States examined:** Idle galaxy, search active (desktop). Focus, trail, and mobile deferred.  
**Methodology:** Line-by-line comparison of every numeric value cited in the 2026-06-06 critique against current source. New findings added where the original missed visually significant values.

---

## Summary

Since the 2026-06-06 critique, **11 of the 15 proposed improvements have been implemented**. Node opacity, emissive, lighting, atmosphere sphere, thread breathing animation, focus effect opacity, persistent anchor glow, hit-proxy removal, per-cluster sizing, and ambient light are all in place. The scene is materially brighter and more alive than the critique described.

Remaining gaps: thread `AdditiveBlending` + `depthWrite: false` still causes depth order artifacts, the atmosphere sphere and county reference sphere remain near-perceptual-threshold, `frustumCulled` is still false, and a dead `getThreadOpacityEnvelope()` function creates maintenance confusion.

**Overall grade: B+** — the visual system now delivers on the bioluminescent promise. Depth-order correctness and atmosphere subtlety are the last gaps.

---

## A. Node / Spore Visuals

### Delta Table

| Attribute | Critique Claimed | Code Actual (file:line) | Status |
|---|---|---|---|
| Spore opacity | 0.38 | `SCENE_ATMOSPHERE.sporeOpacity = 0.65` (`three-node-manager.js:26`) | **FIXED** |
| Emissive color | `0x16453f` (dark teal) | `0x2a8a7a` (`three-node-manager.js:316`) | **FIXED** |
| Emissive intensity | 0.34 | 0.55 (`three-node-manager.js:317`) | **FIXED** |
| Geometry | `SphereGeometry(1, 6, 5)` — 30 faces | Same (`three-node-manager.js:313`) | Unchanged |
| Base radius | 0.0019 | 0.0019 (`three-node-manager.js:29`) | Unchanged |
| Color lift | lerp(0xbffdf4, 0.015–0.06) | Same (`three-node-manager.js:143`) | Unchanged |
| Color factor | Not cited | 1.62× boost (`three-node-manager.js:335`) | **New** |
| FrustumCull | false | false (`three-node-manager.js:327`) | Unchanged |
| Hit proxy | 8,406 invisible instances | Removed; only disposal refs remain (`three-node-manager.js:291-294`) | **FIXED** |
| Per-cluster sizing | Not implemented | `getClusterSizeFactor()` 0.82–1.18× (`three-node-manager.js:46-52`) | **FIXED** |
| Shininess | 58 | 58 (`three-node-manager.js:318`) | Unchanged |

### What Was Done

- Opacity 0.38 → 0.65 (71% increase). Nodes are now clearly visible at overview.
- Emissive `0x16453f` → `0x2a8a7a` with intensity 0.34 → 0.55. Spores self-illuminate noticeably.
- Color factor 1.62× applied to vertex colors at creation (`getNodeSporeColor(i, 1.62)`), boosting the palette 62% above base.
- Hit-proxy mesh fully removed — only cleanup/disposal references remain.
- Per-cluster size variation added: `getClusterSizeFactor(cluster)` maps cluster IDs to 0.82–1.18× scale multiplier via `seededUnit`, giving dense clusters smaller nodes and sparse clusters larger ones.

### What Remains

1. **Geometry still low-poly** (`three-node-manager.js:313`). At 6×5 segments and ~2px screen size, this is acceptable for desktop. At close zoom during focus-dive, the diamond shapes are visible. A LOD switch (point sprites at distance, higher-poly spheres at close) would fix this but is architectural effort.
2. **FrustumCulled still false** (`three-node-manager.js:327`). Acceptable for instanced draw calls (single call), but wastes fragment processing on off-screen nodes.
3. **Color lift still subtle** (`three-node-manager.js:143`). 1.5%–6% lerp to `0xbffdf4` is washed out by the 1.62× color factor. The lift has minimal visual impact at this brightness level.

---

## B. Thread / Mycelium Visuals

### Delta Table

| Attribute | Critique Claimed | Code Actual (file:line) | Status |
|---|---|---|---|
| Material | `LineBasicMaterial`, `linewidth: 1` | Same (`three-thread-manager.js:39-46`) | Unchanged |
| Opacity (overview) | core: 0.112, wispy: 0.047, bridge: 0.068 | **Presentation profile:** core: 0.18, wispy: 0.09, bridge: 0.12 (`three-thread-manager.js:77`) | **FIXED** |
| Opacity (overview) | — | **Envelope (dead):** core: 0.13, wispy: 0.055, bridge: 0.08 (`three-thread-manager.js:67`) | Diverges (dead code) |
| Opacity (search) | core: 0.32, wispy: 0.14, bridge: 0.22 | core: 0.32, wispy: 0.14, bridge: 0.22 (`three-thread-manager.js:83`) | Unchanged |
| Blending | `AdditiveBlending` + `depthWrite: false` | Same (`three-thread-manager.js:44-45`) | Unchanged |
| Breathing animation | None | Dual-harmonic sine waves (`three-engine.js:609-614`) | **FIXED** |
| Pulse amplitude | ±0.028 | Envelope pulse values 0.006–0.072 (`three-thread-manager.js:65-71`) | Unchanged |

### What Was Done

- Overview opacity raised from 0.112/0.047/0.068 to 0.18/0.09/0.12 in the presentation profile. Threads are now visible at overview on most monitors.
- Thread breathing animation added: two sine waves per thread type with per-layer frequency and phase offsets (`three-engine.js:609-614`). Core uses base frequency, wispy at 0.7×, bridge at 0.45×. Second harmonic adds 0.18–0.28 asymmetry. Wind speed modulates pulse rate.

### Dual-Opacity-Definition Issue (NEW FINDING)

`getThreadOpacityEnvelope()` (`three-thread-manager.js:65-72`) and `getMyceliumPresentationProfile()` (`three-thread-manager.js:74-89`) define **different values for the same modes**:

| Mode | Envelope (dead) | Presentation (live driver) | Delta |
|---|---|---|---|
| overview core | 0.13 | 0.18 | +38% |
| overview wispy | 0.055 | 0.09 | +64% |
| overview bridge | 0.08 | 0.12 | +50% |
| focused core | 0.14 | 0.14 | same |
| search core | 0.32 | 0.32 | same |
| trail core | 0.20 | 0.20 | same |

`getThreadOpacityEnvelope()` is exported (`three-engine.js:52,95`) but **never called anywhere** in the codebase. It is dead code. The sole runtime driver is `getMyceliumPresentationProfile()`, called at:
- `three-thread-manager.js:198` (creation)
- `three-engine.js:602` (per-frame update)

**Risk:** A developer reading the envelope function would assume overview core is 0.13, not 0.18. This is a maintenance trap.

### What Remains

1. **AdditiveBlending + depthWrite: false** (`three-thread-manager.js:44-45`). Threads still render in front of nodes they should be behind. Dense cluster centers still over-brighten toward white. Switching to `NormalBlending` + `depthWrite: true` would fix depth order at the cost of losing the additive glow.
2. **1px linewidth** (`three-thread-manager.js:43`). WebGL clamps `linewidth` to 1 on most platforms. No variable-width line implementation (Line2, instanced cylinders) is present. This is a medium-effort architectural change.
3. **Straight line segments** (`three-engine.js:604-614`). Threads are straight `LineSegments`. No Bezier curvature. `pushBezierLinePair` in `mycelium-engine.js` adds slight curve control points, but the lines read as angular, not organic.

---

## C. Scene / Atmosphere

### Delta Table

| Element | Critique Claimed | Code Actual (file:line) | Status |
|---|---|---|---|
| Fog type | `FogExp2(0x070a12, 0.0028)` | Same (`three-engine.js:296`, `SCENE_ATMOSPHERE.fogDensity` at `three-node-manager.js:22`) | Unchanged |
| Background | Same as fog (setClearColor) | Same (`three-engine.js:333`) | Unchanged |
| Atmosphere sphere | `0x0d2024@0.026`, BackSide | `0x2a1f0a@0.10`, BackSide (`three-engine.js:378-381`) | **FIXED** |
| County wireframe | `0x4ecdc4bie`, opacity: 0.0045 | **refSphere:** `0x4ecdc4@0.015`, wireframe (`three-engine.js:394`); **county-outline:** `0x4ecdc4@0.18`, LineLoop (`three-node-manager.js:475`) | **FIXED** (both) |
| Tone mapping | ACESFilmic, exposure 0.95 | Same (`three-engine.js:334-335`) | Unchanged |
| HemisphereLight | `(0xe8f4ff, 0x080820, 0.35)` | Same (`three-engine.js:309`) | Unchanged |
| DirectionalLight | 0.25 | 0.6, positioned (-2, 3, 5) (`three-engine.js:314-315`) | **FIXED** |
| AmbientLight | Not present | `(0x1a1510, 0.4)` (`three-engine.js:320`) | **FIXED** (added) |
| Total lighting | ~0.6 | ~1.35 (0.35 + 0.6 + 0.4) | **FIXED** |

### What Was Done

- Atmosphere sphere: opacity 0.026 → 0.10, color `0x0d2024` → `0x2a1f0a`. Now visible as a warm amber haze at the scene periphery.
- DirectionalLight: 0.25 → 0.6, repositioned to (-2, 3, 5) for directional rim lighting.
- AmbientLight added: `0x1a1510` at 0.4 intensity, providing warm base fill.
- County depth reference sphere: opacity 0.0045 → 0.015 (still subtle, intentional parallax shell).
- County outline (LineLoop): opacity 0.18 (`three-node-manager.js:475`). Provides a clear bounding rectangle.

### Note on Original Critique Error

The original critique cited "county wireframe" with `0x4ecdc4bie` (malformed hex) and opacity 0.0045. The actual codebase has two separate objects:
1. `county-depth-reference` — wireframe sphere at opacity 0.015 (`three-engine.js:394-400`)
2. `county-outline` — LineLoop rectangle at opacity 0.18 (`three-node-manager.js:475-480`)

The original conflated these. The LineLoop is quite visible; the wireframe sphere is intentionally subtle.

### What Remains

1. **Atmosphere sphere opacity 0.10** (`three-engine.js:380`). Visible on dark calibrated monitors, but still registers as "very subtle" on bright office displays. 0.12–0.15 would be more broadly perceptible.
2. **County reference sphere 0.015** (`three-engine.js:394`). Still below perceptual threshold on most displays. Either boost to 0.03+ or remove — 0.015 is in no-man's-land.
3. **Fog density 0.0028** (`three-node-manager.js:22`). Distant nodes fade but the effect is very gradual. Fine as-is for depth cue; not a priority.
4. **Background flat solid** (`three-engine.js:333`). No gradient or noise. Low priority but adds depth.

---

## D. Interaction / Behavior

### Delta Table

| Element | Critique Claimed | Code Actual (file:line) | Status |
|---|---|---|---|
| Focus motes opacity | 0.36–0.64 | 0.82 (outside) / 0.90 (inside) (`three-interaction-visuals.js:35`) | **FIXED** |
| Focus petals opacity | 0.42–0.54 | 0.65 (outside) / 0.75 (inside) (`three-interaction-visuals.js:71`) | **FIXED** |
| Focus filaments opacity | 0.36–0.48 | 0.50 (outside) / 0.62 (inside) (`three-interaction-visuals.js:109`) | **FIXED** |
| Mote count | 18 | 18 (`three-interaction-visuals.js:15`) | Unchanged |
| Petal count | 18 | 18 (same file, same logic) | Unchanged |
| Filament segments | 18×18 = 324 | Same (`three-interaction-visuals.js:16`: FOCUS_WISP_COUNT=18, FOCUS_WISP_SEGMENTS=18) | Unchanged |
| Anchor bloom light | Not present | `PointLight(0xfff4ba, 0, 0.6)` (`three-interaction-visuals.js:393`) | **FIXED** (added) |
| Persistent anchor glow | Not present | `ANCHOR_GLOW_PERSIST_MS=4200`, `ANCHOR_GLOW_PERSIST_INTENSITY=0.28` (`three-search-animations.js:23-24`) | **FIXED** |

### What Was Done

- Focus motes: target opacity raised to 0.82/0.90 (from 0.36–0.64). Clearly visible.
- Focus petals: target opacity raised to 0.65/0.75 (from 0.42–0.54). Clearly visible.
- Focus filaments: target opacity raised to 0.50/0.62 (from 0.36–0.48). Clearly visible.
- Anchor bloom light added: warm PointLight (`0xfff4ba`) at intensity 0.62 (inside) / 0.24 (outside), providing a local warm glow at the focus node.
- Persistent anchor glow: after hero bloom peaks, anchor retains 0.28× residual boost for 4.2 seconds, decaying linearly.

### What Remains

1. **Mote/petal count still 18 each**. Could be denser (24–28) for a richer aura, but this is cosmetic preference, not a deficiency.
2. **No hover emissive flash**. Hover boosts size to 1.45× (`three-node-manager.js:104`) and the shader uniform `uHoverBoost` to 1.5 (`three-engine.js:633`), but there's no emissive color shift on hover entry.
3. **Search corridor particles still 36 count** (`three-search-animations.js:123`). Could be denser.

---

## E. Performance Observations

| Metric | Current State | Risk |
|---|---|---|
| `frustumCulled = false` | All 8,406 instanced nodes rendered every frame (`three-node-manager.js:327`) | Low (instanced = 1 draw call). Fragments for off-screen nodes are wasted but the overhead is minimal at 8K instances. |
| Hit proxy mesh | **Removed.** Only disposal refs remain. | None (resolved). |
| Focus filaments | 324 line segments, updated every frame (`three-interaction-visuals.js:118-158`) | Low. Single focus at a time; position buffer fill + needsUpdate is cheap. |
| No LOD system | Same geometry regardless of distance | Medium. At overview, ~2px points don't benefit from 30-face spheres. At close-up, low-poly spheres are visible. |
| Thread breathing | Per-frame sine calculations for 3 thread layers | Negligible. 6 trig operations per frame. |
| Per-cluster size cache | `_clusterSizeCache` Map (`three-node-manager.js:45`) | Negligible. Grows monotonically, never cleared. Acceptable for ≤100 clusters. |

---

## F. Mobile Observations

No new mobile-specific 3D evidence collected in this pass. The original critique's mobile observations (search drawer obscuring canvas, disabled Explore Neighborhood, no touch hover) remain valid.

---

## G. Prioritized Improvement Plan (Remaining Items Only)

| # | Improvement | Module | Impact | Effort | Category |
|---|---|---|---|---|---|
| 1 | **Switch threads to NormalBlending + depthWrite: true** | `three-thread-manager.js:44-45` | 🔴 Major (correctness) | 🟢 Trivial | B |
| 2 | **Delete dead `getThreadOpacityEnvelope()`** | `three-thread-manager.js:65-72`, exports at `three-engine.js:52,95` | 🟡 Maintenance | 🟢 Trivial | B |
| 3 | **Boost county reference sphere to 0.03 or remove** | `three-engine.js:394` | 🟠 Medium | 🟢 Trivial | C |
| 4 | **Bump atmosphere sphere to 0.12–0.15** | `three-engine.js:380` | 🟠 Medium | 🟢 Trivial | C |
| 5 | **LOD: point sprites at distance, higher-poly spheres close** | `three-node-manager.js` | 🟠 Medium | 🔴 Architectural | A |
| 6 | **Variable-width lines (Line2 or instanced cylinders)** | `three-thread-manager.js` | 🟠 Medium | 🔴 Architectural | B |
| 7 | **Hover emissive flash** | `three-node-manager.js` | 🟡 Small | 🟢 Small | D |
| 8 | **Background gradient** | `three-engine.js` or CSS | 🟡 Aesthetic | 🟢 Small | C |

---

## H. Implementation Recommendations

### Phase 1 — Trivial (< 10 min, no visual risk)
1. **Item #1:** `three-thread-manager.js:44` — change `blending: THREE.AdditiveBlending` to `blending: THREE.NormalBlending`. Change `depthWrite: false` to `depthWrite: true`. This fixes thread-in-front-of-node depth order.
2. **Item #2:** Delete `getThreadOpacityEnvelope()` from `three-thread-manager.js:65-72`. Remove the re-export from `three-engine.js:52,95`. No callers exist.
3. **Item #3:** `three-engine.js:394` — change opacity from 0.015 to 0.03 (or remove the mesh entirely if the effect is deemed unnecessary).
4. **Item #4:** `three-engine.js:380` — change opacity from 0.10 to 0.13.

### Phase 2 — Small Effort (15–30 min)
5. **Item #7:** Add emissive flash on hover enter: in the hover-hit path, temporarily set `nodeSporeMaterial.emissiveIntensity` to 1.2 for 200ms, then lerp back to 0.55.
6. **Item #8:** CSS `radial-gradient` behind canvas, or a subtle noise background quad.

### Phase 3 — Architectural (2–4 hrs)
7. **Item #5:** LOD system: at camera distance > threshold, swap spore mesh for `THREE.Points` with circular sprite texture. Revert to instanced spheres within close radius.
8. **Item #6:** Replace `LineBasicMaterial` `LineSegments` with `Line2` from `three/examples/jsm/lines/` for true variable-width lines, or use instanced thin cylinders.

---

## I. Open Questions

1. **Thread depthWrite switch side effects:** Switching threads to `depthWrite: true` with `NormalBlending` may make low-opacity threads (wispy at 0.09) harder to see against the dark background. May need a compensating opacity bump of +0.02–0.04 on wispy threads. Needs visual QA after the change.

2. **Atmosphere sphere purpose:** Is the `semantic-depth-atmosphere` sphere (`three-engine.js:376-386`) meant to be a visible artistic element or purely a depth-cue shell? If the latter, 0.10 is fine; if the former, 0.13+ is needed.

3. **Mobile touch hover:** The original critique flagged this. No 3D touch hover equivalent exists. Is this in scope for the Svelte migration or deferred?

4. **PointsMaterial opacity multiplier:** `three-engine.js:572` applies `0.32 * SCENE_ATMOSPHERE.pointOpacityScale * pointsRevealProgress * pointsOpacityScale` — the 0.32 base means the point cloud (separate from spore mesh) is rendered at 32% of full opacity at overview. This interacts with the spore opacity (0.65). Are both layers intentional, or should the points layer be suppressed when spores are visible?

---

## Appendix: Tooling Self-Report

**Tools used:** Read, Grep, Glob, Write, Edit (not needed — no source edits made).  
**No files modified** in `js/modules/*.js`, `dist/`, or `docs/visual-critique-2026-06-06.md`.  
**New file created:** `docs/visual-critique-2026-06-07.md`.
