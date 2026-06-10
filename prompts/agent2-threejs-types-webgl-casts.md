# Agent 2 — THREE.js @types Adoption + WebGL `as any` Elimination

You are adopting proper `@types/three` and eliminating `as any` casts in the Three.js/WebGL modules of the semantic-explorer project.

**Working directory:** `C:\Users\HP\Desktop\Temp while my comp is at the shop\semantic-explorer`

## YOUR SCOPE — Non-overlapping with other agents

You own these 10 files ONLY:
- `types/three-engine.d.ts` — replace `[key: string]: any` with specific typed dynamic properties
- `js/modules/three-engine.ts`
- `js/modules/three-node-manager.ts`
- `js/modules/three-thread-manager.ts`
- `js/modules/three-interaction-visuals.ts`
- `js/modules/three-search-animations.ts`
- `js/modules/thread-inspector-webgl.ts`
- `js/modules/focus-anchor-indicator.ts`
- `js/modules/focus-pocket-geometry.ts`
- `js/modules/journey-webgl-utils.ts`

You do NOT own:
- `types/state.d.ts` — Agent 1 handles that
- `js/modules/weather-ui.js`, `audio-scape.js` — Agent 4 handles those
- Any `src/lib/` files — Agent 6 handles those
- Any files being deleted — Agent 3 handles dead code

## STEP 1 — Check if `@types/three` is already installed

```bash
cd "C:\Users\HP\Desktop\Temp while my comp is at the shop\semantic-explorer"
cat package.json | grep -E "@types/three|three"
```

If `@types/three` is NOT in `devDependencies`, install it:
```bash
npm install --save-dev @types/three
```

Then check if `types/three-ambient.d.ts` exists. If it does, delete it — `@types/three` replaces it. (It may have already been deleted.)

## STEP 2 — Update `types/three-engine.d.ts`

Read the current file (93 lines). It has `[key: string]: any` as an escape hatch on `WebGLContextState`. Replace with specific dynamic properties that are actually accessed at runtime:

```typescript
// Instead of:
[key: string]: any;

// Use specific known dynamic properties:
denseBundleMode?: boolean;
shader?: { uniforms: Record<string, { value: unknown }> };
```

Also: the `controls: any` on line 22 should become `controls: THREE.OrbitControls | null` (after `@types/three` is installed, `OrbitControls` will be available).

## STEP 3 — Eliminate `as any` casts in your 9 module files

Current cast counts in your files:
- `focus-pocket-geometry.ts` — 17 casts (mostly `(state.nodePositions as any)`, `(state.camera as any)`, `(state.points as any)`)
- `thread-inspector-webgl.ts` — 22 casts (mostly `(getInspectedStrandGroup() as any)`, `(getScene() as any)`, `(getNodePositions() as any[])`)
- `focus-anchor-indicator.ts` — 19 casts (mostly `(group as any).userData`, `(state.scene as any).add`, `(ringMesh.geometry as any)?.dispose`)
- `three-interaction-visuals.ts` — 1 cast (`const state = _state as any`)
- `three-engine.ts` — 2 casts (`(window as any).THREE`, `const state = _state as any`)
- `three-node-manager.ts` — 1 cast (`const state = _state as any`)
- `three-search-animations.ts` — 1 cast (`const state = _state as any`)
- `three-thread-manager.ts` — 1 cast (`const state = _state as any`)
- `journey-webgl-utils.ts` — 1 cast (`(state.nodePositions as any[])`)

### Patterns to fix:

**Pattern A: `const state = _state as any`** — Replace with:
```typescript
import type { SemanticState } from '../../types/state.js';
const state: SemanticState = _state as SemanticState;
```
Or if `_state` is already typed via the module augmentation in `types/state.d.ts`, just use `state` directly.

**Pattern B: `(state.nodePositions as any)[index]`** — If `SemanticState.nodePositions` is typed as `NodePosition[]`, the cast is unnecessary. Agent 1 is adding missing properties to the interface; if a property isn't typed yet, use `(state.nodePositions as NodePosition[])[index]` instead of `as any`.

**Pattern C: `(group as any).userData.isAnchor = true`** — THREE.js `Object3D` has a `userData` property typed as `Record<string, any>` in `@types/three`. After installing `@types/three`, this cast should be unnecessary — `group.userData.isAnchor` works directly.

**Pattern D: `(state.scene as any).add(group)`** — If `state.scene` is typed as `THREE.Scene | null`, use `state.scene!.add(group)` with a null check.

**Pattern E: `(ringMesh.geometry as any)?.dispose?.()`** — After `@types/three`, `geometry.dispose()` is typed. Use `ringMesh.geometry?.dispose()`.

**Pattern F: `(material.uniforms as any).opacity.value`** — Shader material uniforms. After `@types/three`, `ShaderMaterial.uniforms` is typed. Use `material.uniforms.opacity.value`.

**Pattern G: `(lineMaterial as any).onBeforeCompile`** — After `@types/three`, `ShaderMaterial.onBeforeCompile` is typed. Remove the cast.

**Pattern H: `new THREE.Line2(...)`** — `Line2` comes from `three/examples/jsm/lines/Line2`. Check if `@types/three` covers this. If not, you may need a local type declaration for `Line2` and `LineGeometry`.

## STEP 4 — Handle `Line2` / `LineGeometry` / `LineMaterial`

These come from `three/examples/jsm/lines/`. Check if they're used:
```bash
grep -rn "Line2\|LineGeometry\|LineMaterial" js/modules/three-*.ts js/modules/thread-inspector-webgl.ts
```

If used, create a minimal ambient declaration in `types/three-lines.d.ts`:
```typescript
declare module 'three/examples/jsm/lines/Line2.js' {
    import { Line } from 'three';
    export class Line2 extends Line {
        computeLineDistances(): this;
    }
}
declare module 'three/examples/jsm/lines/LineGeometry.js' {
    import { BufferGeometry } from 'three';
    export class LineGeometry extends BufferGeometry {
        setPositions(array: number[]): this;
        setColors(array: number[]): this;
    }
}
declare module 'three/examples/jsm/lines/LineMaterial.js' {
    import { ShaderMaterial } from 'three';
    export class LineMaterial extends ShaderMaterial {
        linewidth: number;
        resolution: { x: number; y: number };
    }
}
```

## STEP 5 — Verify

1. `npm run typecheck` — must pass
2. `npm run build` — must succeed
3. Count remaining `as any` in your 9 module files: should drop from ~65 to < 10
4. `git diff --stat` — should show changes in your 10 files + possibly `package.json`/`package-lock.json`

## STEP 6 — Report

```markdown
## Agent 2 — THREE.js Types Report

### @types/three adoption
- Installed: Y/N (version)
- three-ambient.d.ts deleted: Y/N/A
- types/three-lines.d.ts created: Y/N/A

### Cast elimination stats
- Files modified: <count>
- `as any` casts eliminated: <count> (from ~65 to <remaining>)
- Remaining `as any`: <count> (with reasons)

### Verification
- `npm run typecheck`: PASS/FAIL
- `npm run build`: PASS/FAIL
- `git diff --stat`: <summary>

### Cross-seam findings
- Anything in types/state.d.ts that needs updating for your files: <list>
- Any THREE.js imports that break after @types/three: <list>
```
