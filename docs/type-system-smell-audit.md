# Type-system smell audit (W47)

A catalog of the loose-typing patterns still entrenched in the codebase.
Intended as a **roadmap**, not a single-bite fix. Each subsection proposes
the next bite in that direction.

**Status:** observations only — no code changes proposed yet. The
W47 type-safety bites (`669448ab`, `0bb89d5a`, `f3afcb1a`) tightened 3
of the worst files but the systemic patterns below remain.

---

## Axis 1: The `_state as any` engine escape hatch (21 files)

The pattern:

```ts
import { appState as _state } from '@lib/state/app.svelte'
const state = _state as any
```

is used in **21 files** to bypass the loosely-typed engine boundary.
Once a file adopts this pattern, every `state.X` access is implicitly
untyped — which is why the same files tend to be the worst offenders
on `as any` and `as unknown as` counts.

### Top consumers (by `state.X` access count)

| File                                  | `state.X` accesses | Status                       |
| ------------------------------------- | -----------------: | ---------------------------- |
| `engine/three-interaction-visuals.ts` |                118 | W47 tightened (8 → 1 `any`)  |
| `orchestration/semantic-lane.ts`      |                 46 | untouched                    |
| `engine/thread-manager.ts`            |                 34 | untouched                    |
| `engine/node-manager.ts`              |                 34 | untouched                    |
| `engine/mycelium-engine.ts`           |                 25 | untouched                    |
| `engine/three-search-animations.ts`   |                 19 | W47 tightened (16 → 1 `any`) |
| `ui/suggestion-bindings.ts`           |                 12 | untouched                    |
| `ui/journey-bindings.ts`              |                 11 | untouched                    |
| `audio/audio-scape.ts`                |                 10 | untouched                    |
| `ui/view-bindings.ts`                 |                  8 | untouched                    |
| `ui/onboarding-bindings.ts`           |                  5 | untouched                    |
| (10 more files, 1-4 accesses each)    |                  — | untouched                    |

### The right long-term fix

Tighten `appState` itself (`src/lib/state/app.svelte.ts`) so its
properties have explicit types, and the escape hatch becomes
unnecessary. That's a multi-day refactor of the state class,
not a per-file bite.

**Short-term bites (still useful):** Continue the W47 pattern of
_typed selectors at the engine boundary_ (see thread-inspector-webgl.ts
`InspectionState`, three-search-animations.ts `CorridorGlowState`).

---

## Axis 2: `as unknown as` double-casts (248 occurrences)

The `as unknown as X` pattern is a force-cast between unrelated types.
TypeScript treats this as a request to shut up and trust the author.

### Top consumers (by occurrence count)

| File                                       | Count | Why                                                                                                                                                   |
| ------------------------------------------ | ----: | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `state/app.svelte.ts`                      |    23 | The Proxy `set` trap uses `Reflect.set(target, prop, value)` after a type-narrowing chain. Mostly unavoidable until `appState` gets typed properties. |
| `engine/three-engine.ts`                   |    23 | Three.js object access (`scene.children[0]` → `Mesh`). Often `as unknown as <ThreeClass>`.                                                            |
| `journey/focus-pocket.ts`                  |    18 | Three.js BufferGeometry access.                                                                                                                       |
| `journey/canvas-node-picking.ts`           |    16 | Three.js raycasting results cast to `Mesh`/`Object3D`.                                                                                                |
| `journey/canvas-hit-test.ts`               |     8 | Similar raycasting pattern.                                                                                                                           |
| `engine/map-state.ts`                      |     8 | Leaflet object access.                                                                                                                                |
| `engine/demo-choreography.ts`              |     8 | Legacy module dynamic-import returns.                                                                                                                 |
| `engine/camera-controls-restore.svelte.ts` |     8 | Three.js controls access.                                                                                                                             |
| `components/SpectorInspector.svelte`       |     8 | Spector.js JSON responses.                                                                                                                            |
| `components/DevGui.svelte`                 |     8 | Tweakpane / dat.gui access.                                                                                                                           |

### Categories of `as unknown as`

| Pattern                       | Example                                  | Realistic fix                                                          |
| ----------------------------- | ---------------------------------------- | ---------------------------------------------------------------------- |
| **Three.js object narrowing** | `mesh as unknown as Mesh`                | Replace with `instanceof Mesh` check + type guard.                     |
| **Leaflet object narrowing**  | `layer as unknown as L.Marker`           | Same: `instanceof L.Marker`.                                           |
| **Dynamic-import narrowing**  | `mod as unknown as CameraControlsModule` | Define a typed wrapper that imports and re-exports with explicit type. |
| **JSON response narrowing**   | `capture as unknown as SpectorCapture`   | Use `zod` or a runtime type guard.                                     |
| **Untyped bridge function**   | `(mod as unknown as MyModule).foo()`     | Type the module interface at the bridge.                               |

### Bite candidate

Pick the top 3 journey files (`focus-pocket.ts`, `canvas-node-picking.ts`,
`canvas-hit-test.ts`) which together hold **42 `as unknown as`** casts
likely fixable with `instanceof` checks. Estimated 1-2 hours. Smoke tests
needed first (these are untested).

---

## Axis 3: `as any` single-casts (290 occurrences)

The single-cast `as any` is a milder version of Axis 2 but still
disables type checking on the casted expression.

### Top consumers (by occurrence count)

| File                          | Count | Note       |
| ----------------------------- | ----: | ---------- |
| `journey/semantic-overlay.ts` |    26 | Untested.  |
| `journey/route-trace.ts`      |    22 | Untested.  |
| `journey/thread-settler.ts`   |    20 | Untested.  |
| `journey/thread-inspector.ts` |    20 | Has tests. |
| `journey/focus-ui.ts`         |    16 | Untested.  |
| `journey/neighborhood.ts`     |    14 | Untested.  |
| `journey/thread-model.ts`     |    11 | Untested.  |
| `engine/three-engine.ts`      |    10 | Has tests. |
| (11 more files, 3-9 each)     |     — | —          |

**Pattern:** 6 of the top 7 are in `src/lib/journey/`. The journey
subsystem has the worst `any` density of any subsystem (6.0 `any`/file,
89% of journey's `any` budget still untouched after W47).

### Bite candidate (highest ROI)

Smoke-test + tighten `journey/semantic-overlay.ts` (465 LOC, 26 `as any`,
0 tests). Same shape as the W47 journey bite: typed signatures,
`instanceof` instead of duck-typing, lock-in test. Estimated 1-2 hours.

---

## Combined picture

```
┌──────────────────────────────────────────────────────────────────┐
│  Source-code smells (W47 measurements)                          │
├──────────────────────────────────────────────────────────────────┤
│  21 files using `const state = _X as any` escape hatch          │
│  248 `as unknown as` double-casts (force-type mismatches)        │
│  290 `as any` single-casts (mild type-system bypass)             │
│  538 total type-system escape hatches in ~60k LOC of src/         │
│  ≈ 1 escape hatch per 110 lines of code                          │
└──────────────────────────────────────────────────────────────────┘
```

**Honest read:** the type system is mostly advisory in this codebase.
The codebase works because the JS-bridged engine has hand-tuned types
at every boundary and the team has been disciplined about reading the
code, not the types.

**Two ways forward:**

1. **Bite-by-bite tightening** (the proven pattern, ~30 min each):
   continue tightening individual files. Net effect: smaller `any`
   counts per file, but the systemic smell (engine boundary) stays.

2. **State class refactor** (multi-day): tighten `appState` to remove
   the need for `_state as any` everywhere. Net effect: eliminates
   Axis 1's worst pattern, cascades into reducing Axis 2/3.

### Recommended order

1. **Continue journey tightening** (Bite C): `semantic-overlay.ts`
   first (smoke-test + tighten). Same pattern as W47. Quick win.
2. **Document a multi-bite plan** for the engine boundary refactor
   before starting it — this doc is a starting point but not the plan.
3. **Engine-boundary refactor** (multi-day): tighten `appState` itself
   so the `_state as any` escape hatch isn't needed. Cascades to all
   21 consumer files.

---

## Reference: W47 type-safety bites (committed)

| Commit     | File                                  | Before → After |
| ---------- | ------------------------------------- | -------------- |
| `669448ab` | `journey/thread-inspector-webgl.ts`   | 35 → 8 `any`   |
| `0bb89d5a` | `engine/three-search-animations.ts`   | 16 → 1 `any`   |
| `f3afcb1a` | `engine/three-interaction-visuals.ts` | 8 → 1 `any`    |

Each commit introduced a typed interface at the engine boundary
(`InspectionState`, `CorridorGlowState`/`CorridorAnimState`, etc.) and
replaced `as any` casts at function-signature and private-state-shape
boundaries. The pattern is the same in each case.
