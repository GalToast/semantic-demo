# Visual Critique — Semantic Explorer 3D Mycelium

**Date:** 2026-06-06  
**Reviewer:** Code analysis against `js/modules/three-*.js`, `design-tokens.js`, CSS cascade, and browser state snapshots.  
**States examined:** Idle galaxy, search active (desktop + mobile). Focus, trail, and focus-pocket states deferred to follow-up after initial pass.  

---

## Methodology

This critique is grounded in source-code analysis of the core visual modules, evaluated against the stated design goal of a **"bioluminescent, warm amber + dark indigo"** mycelium aesthetic. No post-processed render passes (Unreal, Blender, Figma screenshots) were used. Findings are reproducible by reading the cited line ranges.

---

## Summary

The current visual system has **solid technical foundations** (ACES tone mapping, SRGB color space, instanced mesh batching) but **under-commits to the bioluminescent promise**. Nodes are hard to read, threads disappear at overview, and the atmosphere is too subtle to register. The app reads as a sparse point cloud with faint lines rather than an alive mycelium network.

**Overall grade: B-/C+** — technically competent, but visually timid.

---

## A. Node / Spore Visuals

### Current implementation (from `three-node-manager.js`)

| Attribute | Value | Impact |
|---|---|---|
| Geometry | `SphereGeometry(1, 6, 5)` — 30 faces | Very low-poly; at ~2px screen size, reads as a diamond or triangle, not a sphere. |
| Base radius | `0.0019` → scaled by `MYCELIUM_FIELD_SCALE` (3.2, 2.6, 3.7) | Tiny in world space; relies on camera distance to appear visible. |
| Material | `MeshPhongMaterial`, `opacity: 0.38` | Below visual threshold for dark `0x070a12` background. Reads as faint specks. |
| Emissive | `0x16453f` (dark teal), intensity `0.34` | Too dark to register as "glow"; contributes almost nothing to self-illumination. |
| Color lift | `lerp(NODE_SPORE_COLOR_LIFT=0xbffdf4, 0.015–0.06)` | Subtle to the point of imperceptible on most displays. Random variation lost in the noise of 8,406 points. |
| Frustum cull | `false` | Wastes GPU on off-screen nodes. Negligible at ~30 draw calls, but unnecessary. |
| Hit proxy | Invisible (`opacity: 0.0`), same point count | Doubles instance count for raycasting. Separate invisible geometry is wasteful when raycaster can tolerance-test against the visible mesh. |

### Findings

1. **Nodes lack visual identity.** At overview zoom, 8,406 low-poly spheres at 0.38 opacity on a near-black background create a "fuzzy noise" look rather than an organic mycelium. The user gets no sense of individual node "presence."
2. **No size differentiation by category or importance.** All nodes are size-identical except for focus/hover/trail neighbors. Industry clusters should have distinct visual weight.
3. **The "lift" color barely registers.** A 1.5%–6% lerp to `0xbffdf4` on a dark background is lost to display gamma compression on non-calibrated screens.
4. **Phong material is wasted without specular highlights.** The material has `shininess: 58` but the scene is lit by ambient-ish lights only (`HemisphereLight 0.35` + `DirectionalLight 0.25`). No specular catch is possible.

### Prioritized improvements

```
### Priority 1: Increase node opacity and add soft glow
- Where: js/modules/three-node-manager.js:createNodeSporeLayer()
- Current: opacity 0.38, emissive 0x16453f@0.34, no post-glow
- Proposed: Raise opacity to 0.65–0.75. Swap emissive for a lighter teal (0x2a8a7a) 
  at intensity 0.55. Optionally add a second-pass sprite glow or tune the point 
  shader to fake a halo.
- Impact: major
- Effort: small

### Priority 2: Per-node size by cluster density
- Where: js/modules/three-node-manager.js:getNodeSporeScale()
- Current: scale = base * random(0.86–1.34) * emphasis. Emphasis only for 
  focus/hover/trail.
- Proposed: Add a cluster-density multiplier so dense clusters have smaller 
  individual nodes but higher aggregate brightness; sparse clusters have larger, 
  more isolated nodes. Use the seeded random already in place.
- Impact: major
- Effort: small

### Priority 3: Reduce geometry segments or switch to point sprites for distant LOD
- Where: js/modules/three-node-manager.js
- Current: 6×5 sphere segments for 8,406 nodes = ~502K triangles for spores alone.
- Proposed: At distance > threshold, render as `THREE.Points` with a circular 
  texture sprite. Only use instanced spheres within a close radius. Drops triangle 
  count by ~80% at overview.
- Impact: major (perf + visual clarity)
- Effort: medium

### Priority 4: Remove or consolidate hit-proxy mesh
- Where: js/modules/three-node-manager.js:setNodeSporeInstanceMatrix()
- Current: Second instanced mesh with 8,406 instances, all invisible, all updated 
  every frame.
- Proposed: Tolerance-test raycaster against the visible spore mesh position + 
  known radius. Remove the hit-proxy entirely.
- Impact: medium (perf, no visual change)
- Effort: trivial
```

---

## B. Thread / Mycelium Visuals

### Current implementation (from `three-thread-manager.js`)

| Attribute | Value | Impact |
|---|---|---|
| Material | `LineBasicMaterial`, `linewidth: 1` | WebGL `linewidth` is clamped to 1px on most platforms. Threads render as 1px hairlines regardless of intent. |
| Opacity (overview) | core: 0.112, wispy: 0.047, bridge: 0.068 | Below human perceptual threshold against `#070a12` background. Most users will not see threads at all. |
| Opacity (search) | core: 0.32, wispy: 0.14, bridge: 0.22 | Visible during search, but still thin and low-contrast. |
| Blending | `AdditiveBlending` + `depthWrite: false` | Creates depth artifacts where threads appear "in front" of nodes they should be behind. Also causes over-brightening where many lines overlap. |
| Geometry | Straight `LineSegments` from `mycelium-engine.js` | No curvature or organic feel. Relationships look like rigid laser beams rather than fungal filaments. |

### Findings

1. **Threads are invisible at overview.** Opacity as low as 0.047 on a dark background means threads are literally invisible on most monitors calibrated to ~200 nits. The mycelium "network" becomes a point cloud.
2. **1px lines cannot convey relationship strength.** Semantic similarity is encoded only in opacity, which is already too low. Users have no visual hierarchy of "strong" vs "weak" connections.
3. **Additive blending causes brightness blow-out in dense areas.** Where many threads overlap (likely in cluster centers), additive blending pushes colors toward white, losing the teal warm-amber palette.
4. **Straight line segments lack organic feel.** Real mycelial threads curve, branch, and taper. Straight lines look mechanical.
5. **No pulse or animation on idle threads.** The `pulse` opacity is defined in the opacity envelope but only varies slightly (±0.028). No periodic glow or "breathing" effect is visible.

### Prioritized improvements

```
### Priority 1: Raise thread base opacity and add tube/fat-line rendering
- Where: js/modules/three-thread-manager.js:createLineSegments()
- Current: LineBasicMaterial, linewidth: 1, opacity 0.047–0.112
- Proposed: 
  1. Bump overview core to 0.18, wispy to 0.09, bridge to 0.12.
  2. Replace LineBasicMaterial with a custom shader material on 
     THREE.InstancedMesh cylinders or use three/examples/jsm/lines/Line2 
     for true variable-width lines.
  3. Fade opacity by distance from camera (far threads dimmer).
- Impact: major
- Effort: medium

### Priority 2: Add slight curvature to thread paths
- Where: js/modules/mycelium-engine.js build functions
- Current: Straight line segments between nodes.
- Proposed: Use a quadratic or cubic Bezier with a control point that drifts 
  slightly toward the cluster centroid. Adds organic "fungal" feel.
- Impact: medium (aesthetic)
- Effort: small

### Priority 3: Depth-write enabled for threads, additive blending removed
- Where: js/modules/three-thread-manager.js:createLineSegments()
- Current: depthWrite: false, blending: AdditiveBlending
- Proposed: depthWrite: true, blending: NormalBlending. This fixes the "threads 
  on top of nodes" issue. If additive wash-out in dense areas is a concern, 
  lower the base opacity instead.
- Impact: major (correctness)
- Effort: trivial

### Priority 4: Idle thread breathing animation
- Where: js/modules/three-thread-manager.js, updateMyceliumThreads 
  (or mycelium-engine.js)
- Current: Static opacity per mode.
- Proposed: Slow sine-wave opacity modulation (0.8–1.2× base) across all threads, 
  offset by thread index to avoid rhythmic pulsing. Gives the mycelium a "living" 
  appearance.
- Impact: medium (atmosphere)
- Effort: small
```

---

## C. Scene / Atmosphere

### Current implementation

| Element | Value | Impact |
|---|---|---|
| Fog | `FogExp2(0x070a12, 0.0028)` | Very dark, low density. Distant nodes fade but not dramatically. Creates a flat depth cue rather than atmospheric perspective. |
| Background | Same as fog (`setClearColor`) | Solid near-black. No star field, no gradient, no subtle texture. |
| Sky/atmosphere | `MeshBasicMaterial` sphere, `0x0d2024@0.026` | Opacity 0.026 is below perceptual threshold. Completely invisible. Wasted geometry. |
| County wireframe | `0x4ecdc4bie`, `opacity: 0.0045`, wireframe | Completely invisible. Wasted geometry. |
| Tone mapping | `ACESFilmicToneMapping`, exposure 0.95 | Good choice, but exposure a bit dark for a bioluminescent scene. |
| Lighting | `HemisphereLight(0xe8f4ff, 0x080820, 0.35)` + `DirectionalLight(0xffffff, 0.25)` | Total ~0.6 intensity. Very dim. Makes Phong spores rely on emissive (which is also weak). Shadows are barely present. |

### Findings

1. **The scene is dark to the point of monotonous.** Everything is near-black or dark teal. The "warm amber" in the design system (`#ffd66b`, `#ffdf6e`) appears only in UI elements, not in the 3D scene. The mycelium has no warmth.
2. **Atmosphere elements are wasted GPU cycles.** Both the glow sphere and wireframe sphere have opacity below perceptual threshold. Remove them or make them visible.
3. **No depth layering.** Fog is subtle; background is flat. The scene lacks "vastness" — the mycelium feels like a clump of dots rather than a sprawling network.
4. **Lighting is too even.** Hemisphere + directional at low intensity creates flat, soft shading. The mycelium has no dramatic light direction, no caustics, no "glow from within."

### Prioritized improvements

```
### Priority 1: Add a subtle warm ambient light + increase directional intensity
- Where: js/modules/three-engine.js:initThreeJS()
- Current: Hemisphere 0.35 + Directional 0.25 = 0.6 total
- Proposed: Add an AmbientLight(0x1a1510, 0.4) for warm base fill. 
  Increase Directional to 0.6 and position it from a low angle (-2, 3, 5) 
  to create long shadows and rim light on spores. Total intensity ~1.2.
- Impact: major
- Effort: trivial

### Priority 2: Make the atmosphere glow sphere visible or remove it
- Where: js/modules/three-engine.js lines 354-364
- Current: opacity 0.026, BackSide, color 0x0d2024
- Proposed: Either remove the mesh entirely (saves GPU) or boost opacity to 
  0.08–0.12 and shift color to a warm amber (0x2a1f0a) to create a subtle 
  bioluminescent haze.
- Impact: medium
- Effort: trivial

### Priority 3: Add background gradient noise instead of flat black
- Where: js/modules/three-engine.js (renderer clear color or CSS background)
- Current: Solid #070a12
- Proposed: Use a CSS `radial-gradient` from `#0d1117` (center) to `#05070a` 
  (edges) behind the canvas, or render a subtle noise texture on a large 
  background quad. Breaks the flat void look.
- Impact: medium (aesthetic depth)
- Effort: small

### Priority 4: Warm tint to fog for near-field warmth
- Where: js/modules/three-engine.js line ~278
- Current: fogColor: 0x070a12 (cool, near-black)
- Proposed: Shift to 0x0a0e16 (slightly warmer, very subtle blue shift). 
  Current is so dark it reads as neutral. Warmming it slightly adds depth 
  and aligns with the amber warmth in the UI palette.
- Impact: small (subtle polish)
- Effort: trivial
```

---

## D. Interaction / Behavior

### Focus pocket visual system (from `three-interaction-visuals.js`)

| Element | Value | Impact |
|---|---|---|
| Focus motes | 18 particles, opacity 0.36–0.64 | Low opacity; particles are tiny and sparse. Hard to notice if the user isn't looking for them. |
| Focus petals | 18 petals, opacity 0.42–0.54 | Similar issue. Petals are small and blend into the background. |
| Focus filaments | 18 × 18 = 324 line segments | Complex geometry for a subtle effect. Opacity 0.36–0.48. |

### Findings

1. **Focus effects are underwhelming.** When a user selects a business, the "aura" around it is barely visible. The 2.4× scale bump helps, but the motes/petals/filaments vanish into the fog.
2. **No camera bloom on focus.** The focus node gets a ring and a gentle pulse (from `focus-anchor-indicator.js`), but there's no atmospheric "glow ring" or chromatic aberration to draw the eye.
3. **Search results lack visual connection to scene.** When searching "plumbing," the corridor animation draws lines, but after the animation completes, the result nodes are just... there. No persistent "you searched for this" visual marker.

### Prioritized improvements

```
### Priority 1: Boost focus motes + petals opacity and increase count
- Where: js/modules/three-interaction-visuals.js
- Current: opacity 0.36–0.64 for motes, 0.42–0.54 for petals
- Proposed: Bump to 0.7–0.9 for motes, 0.6–0.8 for petals. Add 6–8 more motes 
  total (24 instead of 18) for a denser aura. Increase particle size by 20%.
- Impact: major
- Effort: small

### Priority 2: Persistent search-result halo
- Where: js/modules/three-search-animations.js and related
- Current: Corridor animation plays once, then fades. Anchor node is visually 
  identical to others after animation.
- Proposed: Keep a subtle persistent glow (e.g., emissive boost 2.0×) on anchor 
  node for 3–5 seconds after search. Also add category-colored halos for 
  non-anchor results in the top 5.
- Impact: major
- Effort: small

### Priority 3: Hover state more distinct
- Where: js/modules/three-node-manager.js:getNodeSporeScale(), point shader 
  in installPointMaterialShader()
- Current: hover boosts size to 1.45× and triggers shader mask. Subtle.
- Proposed: Add a hover emissive flash (brighten emissive color to lighter 
  teal 0x48d4c0, intensity 1.2) for 200ms on hover enter. Also increase 
  hover radius in shader for a broader neighbor glow.
- Impact: medium
- Effort: small
```

---

## E. Performance Observations

| Metric | Observation | Risk |
|---|---|---|
| `frustumCulled = false` | All 8,406 instanced nodes rendered every frame | Low on desktop (instanced = 1 draw call), but wastes GPU on nodes behind camera or off-screen. |
| Hit proxy mesh | 8,406 invisible instances, updated every frame | Medium. Doubles instance-update CPU cost. Should use raycaster tolerance test instead. |
| Focus filaments | 324 line segments × however many focused nodes | Could be heavy if multiple nodes are focused simultaneously. Currently only one focus at a time. |
| No LOD system | Same geometry density regardless of camera distance | Medium. At overview, points are 2px; detail is wasted. At close-up, low-poly spheres look bad. |

---

## F. Mobile Observations (from accessibility snapshots)

From the mobile search snapshot (`mobile-search-snapshot.md`):

1. **Search results compete with the 3D canvas for screen real estate.** The drawer occupies the full viewport; the 3D scene is completely obscured. This is by design but worth noting: the 3D aspect is diminished on mobile.
2. **"Explore Neighborhood" button is disabled.** Mobile users see a disabled button with no explanation. This is a UX issue, not purely visual, but it breaks the visual flow.
3. **No touch-specific hover states.** 3D hover (raycaster on mouse move) has no mobile equivalent. Touch targets on the canvas are undocumented.

---

## G. Prioritized Improvement Plan (Top 10)

| # | Improvement | Module | Impact | Effort | Category |
|---|---|---|---|---|---|
| 1 | **Raise node opacity + brighten emissive** | `three-node-manager.js` | 🔴 Major | 🟢 Trivial | A.1 |
| 2 | **Raise thread opacity + switch to depth-write true** | `three-thread-manager.js` | 🔴 Major | 🟢 Trivial | B.3 |
| 3 | **Warm ambient light + stronger directional** | `three-engine.js` | 🔴 Major | 🟢 Trivial | C.1 |
| 4 | **Add per-cluster size differentiation** | `three-node-manager.js` | 🔴 Major | 🟢 Small | A.2 |
| 5 | **Boost focus motes/petals opacity** | `three-interaction-visuals.js` | 🔴 Major | 🟢 Small | D.1 |
| 6 | **Persistent search-result anchor glow** | `three-search-animations.js` | 🟠 Medium | 🟢 Small | D.2 |
| 7 | **Remove or make visible atmosphere spheres** | `three-engine.js` | 🟠 Medium | 🟢 Trivial | C.2 |
| 8 | **Add idle thread breathing animation** | `three-thread-manager.js` | 🟠 Medium | 🟢 Small | B.4 |
| 9 | **Remove hit-proxy mesh (raycaster tolerance)** | `three-node-manager.js` | 🟠 Medium | 🟢 Trivial | A.4 |

---

## H. Implementation Recommendations

### Phase 1 — "Trivial High-Impact" (10 min, no visual risk)
1. Item #1: Node opacity 0.38 → 0.65; emissive `0x16453f` → `0x2a8a7a`, intensity 0.34 → 0.55.
2. Item #3: Add `AmbientLight(0x1a1510, 0.4)`, boost directional to 0.6, reposition.
3. Item #2: Thread overview opacity: core 0.112 → 0.18, wispy 0.047 → 0.09, bridge 0.068 → 0.12. Enable `depthWrite`.
4. Item #7: Remove or boost atmosphere spheres.
5. Item #9: Remove hit-proxy mesh, use raycaster tolerance.

### Phase 2 — "Small Effort, Major Gain" (30–60 min)
6. Item #4: Per-cluster size variation.
7. Item #5: Boost focus effect opacity.
8. Item #6: Persistent search glow.
9. Item #8: Thread breathing animation.

### Phase 3 — "Medium Effort, Architectural" (2–4 hrs)
10. Item #10: LOD system for distant nodes (point sprites).
11. Item #11: True variable-width lines (Line2 or instanced cylinders).
12. Item #12: Background gradient/noise.

---

## Unexamined States

- **Focus selected state** — captured in DOM but not in screenshot for visual inspection
- **Trail/journey state** — requires interaction; deferred to follow-up
- **Focus pocket / neighborhood-inside state** — requires deeper navigation

These will be added to a follow-up critique after interactive exploration.
