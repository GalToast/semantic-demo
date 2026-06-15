# Refactor & Feature Plan: Premium Visual Upgrades

## Goal
Implement two high-impact visual upgrades for the Semantic Explorer:
1. **Seam 1: Bioluminescent Variable-Width Threads** in the ambient mycelium network (`js/modules/three-thread-manager.ts`) using `LineSegments2` and a custom shader material that breathes subtly.
2. **Seam 4: Postprocessing Gradient Dither** in the effect pass (`js/modules/three-postprocessing.ts`) using a custom pseudo-random dither effect to eliminate color banding in the dark indigo background.

---

## Technical Design: Seam 1 (Variable-Width Bioluminescent Threads)

### 1. The Challenge
Currently, `three-thread-manager.ts` creates standard `THREE.LineSegments` which have a fixed 1px width in modern WebGL. This lacks premium thickness and doesn't match the gorgeous, fat, flowing active threads of the `ThreadInspector` and `JourneySemanticOverlay`.

### 2. The Solution: `LineSegments2` + `LineSegmentsGeometry` + `LineMaterial`
We will replace `THREE.LineSegments` and `THREE.LineBasicMaterial` inside `three-thread-manager.ts` with their fat-line counterparts from `three/addons/lines/`:
- `LineSegments2` (a subclass of Mesh)
- `LineSegmentsGeometry`
- `LineMaterial`

### 3. GLSL Shader Enhancement for Ambient Threads
To keep performance extremely high while introducing bioluminescence:
- We will use `LineMaterial` with vertex colors enabled.
- We will hook into the `onBeforeCompile` phase of `LineMaterial` to inject an ambient breathing animation driven by a `uTime` uniform.
- This creates a soft, organic "bioluminescent pulse" along the background mycelium lines without requiring heavy per-line cpu calculation or separate draw calls.

---

## Technical Design: Seam 4 (Postprocessing Gradient Dither)

### 1. The Challenge
On dark displays and high-contrast screens, the smooth transition from deep indigo (`#0a0b16`) to pitch black (`#000000`) creates visual "banding artifacts" due to limited color precision (8-bit per channel).

### 2. The Solution: Custom `DitherEffect`
In `js/modules/three-postprocessing.ts`, we will construct a custom `DitherEffect` using the `postprocessing` library's subclassing pattern:
```typescript
import { Effect } from 'postprocessing';

class DitherEffect extends Effect {
    constructor() {
        super('DitherEffect', `
            void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
                // High-performance, high-quality triangle dithering
                // Adds a tiny fraction of a color-step in random noise to disperse band boundaries
                float rand = fract(sin(dot(uv, vec2(12.9898, 78.233))) * 43758.5453);
                float noise = (rand - 0.5) / 255.0; // scale to 8-bit color step
                outputColor = vec4(inputColor.rgb + vec3(noise), inputColor.a);
            }
        `);
    }
}
```
We will append this `DitherEffect` to the main `EffectPass` so it cleans up color banding in premium mode.

---

## Implementation Checklist

### Phase 1: Postprocessing Gradient Dither (Fast Wins)
- [ ] Implement `DitherEffect` inside `js/modules/three-postprocessing.ts`.
- [ ] Add `DitherEffect` as an active pass in `initPostProcessing()`.
- [ ] Verify compilation and test suite run cleanly.

### Phase 2: Variable-Width Bioluminescent Threads (ambient network)
- [ ] Update imports in `js/modules/three-thread-manager.ts` to include `LineSegments2`, `LineSegmentsGeometry`, and `LineMaterial`.
- [ ] Refactor `createLineSegments` to build and return a `LineSegments2` instance with high-performance instanced geometry.
- [ ] Inject custom shader uniforms and a soft breathing vertex modifier inside the line material.
- [ ] Update the animate loop inside `js/modules/three-engine.ts` to keep the custom `resolution` uniform of `LineMaterial` in sync with window size and DPR (required for fat-line projection).
- [ ] Run verification tests.

---

## Verification Plan
1. **Compilation Check:** Run `npm run check` and ensure 0 errors and 0 warnings.
2. **Unit Tests:** Run `npm run test:unit` to ensure zero regressions in the mock environment or store values.
3. **Smoke Test:** Compile the production Svelte bundle using `npm run build` to guarantee proper bundle-splitting.
