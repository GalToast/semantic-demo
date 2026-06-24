# Type-system smell audit (W47)

A catalog of the loose-typing patterns still entrenched in the codebase.
Intended as a **roadmap**, not a single-bite fix. Each subsection proposes
the next bite in that direction.

**Status:** 10 type-safety bites completed this session (see reference
table at the bottom). 67 `any` occurrences removed across 8 files.
Journey subsystem: 200 → 134 `any` (-33%). Engine subsystem: 24 → 2
`any` (-92%) on the 3 files touched.

The remaining smells are concentrated in (1) files with the documented
`_state as any` engine-boundary escape hatch, (2) the new top offender
`journey/semantic-guide.ts` (41 `any`, not in the original audit), and
(3) `engine/three-engine.ts` (1134 LOC, being decomposed in parallel).

**The roughest file in the codebase** (see Axis 4): `journey/semantic-guide.ts` —
41 `any`, dual-state import (same module imported twice with different names),
5 `: any` return types, redundant `(state as any)` casts for fields that
are already typed in `appState`.

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

| File                                  | `state.X` accesses | Status                          |
| ------------------------------------- | -----------------: | ------------------------------- |
| `engine/three-interaction-visuals.ts` |                118 | W47 tightened (8 → 1 `any`)     |
| `orchestration/semantic-lane.ts`      |                 46 | untouched                       |
| `engine/thread-manager.ts`            |                 34 | untouched                       |
| `engine/node-manager.ts`              |                 34 | untouched                       |
| `engine/mycelium-engine.ts`           |                 25 | untouched                       |
| `engine/three-search-animations.ts`   |                 19 | W47 tightened (16 → 1 `any`)    |
| `ui/suggestion-bindings.ts`           |                 12 | untouched                       |
| `ui/journey-bindings.ts`              |                 11 | untouched                       |
| `audio/audio-scape.ts`                |                 10 | untouched (see Axis 4)          |
| `ui/view-bindings.ts`                 |                  8 | untouched                       |
| `ui/onboarding-bindings.ts`           |                  5 | untouched                       |
| (10 more files, 1-4 accesses each)    |                  — | untouched                       |

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

### Top consumers (by occurrence count, post-W47-bites)

| File                              | Before → After | Note                                    |
| --------------------------------- | -------------- | --------------------------------------- |
| `journey/semantic-guide.ts`       | 41 (NEW #1)    | **The roughest file — see Axis 4**       |
| `journey/semantic-overlay.ts`     | 39 → 37        | Conservative scope (signature tightening) |
| `engine/three-engine.ts`          | 36             | 1134 LOC, being decomposed in parallel  |
| `journey/route-trace.ts`          | 23 → 18        | Has smoke tests (Bite H)                |
| `engine/thread-manager.ts`        | 18             | Untouched (engine file)                  |
| `journey/selected-card.ts`        | 17             | Has tests, untightened                  |
| `journey/neighborhood.ts`         | 22 → 15        | Has smoke + typing tests (Bite I)       |
| `journey/focus-ui.ts`             | 20 → 13        | Has smoke + typing tests (Bite E)       |
| `journey/thread-settler.ts`       | 26 → 21        | Has smoke + typing tests (Bite F)       |
| `engine/node-manager.ts`          | 11             | Untouched (engine file)                  |
| `journey/thread-inspector.ts`     | 22 → 10        | Has typing tests (Bite D)               |
| `journey/thread-model.ts`         | 13 → 1         | Has typing tests (Bite J)               |
| `engine/three-search-animations.ts` | 16 → 1       | W47 tightened                           |
| `engine/three-interaction-visuals.ts` | 8 → 1      | W47 tightened                           |
| `journey/thread-inspector-webgl.ts` | 35 → 8       | W47 tightened                           |

**Pattern:** The journey subsystem has the worst `any` density of any
subsystem. After this session's 6 journey bites, the file-level leaders
are now `semantic-guide.ts` (41, new — not in original audit) and
`semantic-overlay.ts` (37, partially tightened).

### Bite candidate (highest ROI after this session)

Tighten `journey/semantic-guide.ts` (292 LOC, 41 `any`, 5 test files,
DUAL-STATE IMPORT smell). Half the `any` casts are redundant because
`summaryCardTypeToken`, `semanticGuideRequestSequence`, and
`semanticGuideAbortController` are already typed on `appState`. Estimated
1 hour. This is **the roughest file in the codebase** (see Axis 4).

---

## Combined picture

```
┌──────────────────────────────────────────────────────────────────┐
│  Source-code smells (post-W47-session measurements)              │
├──────────────────────────────────────────────────────────────────┤
│  21 files using `const state = _X as any` escape hatch          │
│  248 `as unknown as` double-casts (force-type mismatches)        │
│  290 → 224 `as any` single-casts (-66 occurrences this session) │
│  538 → 473 total type-system escape hatches (-12% this session) │
│  ≈ 1 escape hatch per 130 lines of code                          │
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

### Recommended order (updated post-session)

1. ✅ ~~Continue journey tightening (Bite C): `semantic-overlay.ts`~~ — DONE (`edb17ab6`)
2. ✅ ~~Smoke-test + tighten `journey/thread-inspector.ts`~~ — DONE (`222991d3`)
3. ✅ ~~Smoke-test + tighten `journey/focus-ui.ts`~~ — DONE (`cb09c0c9`)
4. ✅ ~~Smoke-test + tighten `journey/thread-model.ts`~~ — DONE (`4f11d083`)
5. ✅ ~~Smoke-test + tighten `journey/neighborhood.ts`~~ — DONE (`4acf450a`)
6. ✅ ~~Smoke-test + tighten `journey/thread-settler.ts`~~ — DONE (`3cf99536`)
7. ✅ ~~Smoke-test + tighten `journey/route-trace.ts`~~ — DONE (`057dc5b0`)
8. **NEXT: Tighten `journey/semantic-guide.ts`** — the roughest file, 41 `any`,
   5 test files, dual-state import smell. Many casts are redundant.
9. **Document a multi-bite plan** for the engine boundary refactor
   before starting it — this doc is a starting point but not the plan.
10. **Engine-boundary refactor** (multi-day): tighten `appState` itself
    so the `_state as any` escape hatch isn't needed. Cascades to all
    21 consumer files.

---

## Reference: W47 type-safety bites (committed)

| Commit     | File                                  | Before → After   | Bite ID |
| ---------- | ------------------------------------- | ---------------- | ------- |
| `669448ab` | `journey/thread-inspector-webgl.ts`   | 35 → 8 `any`     | W47-1   |
| `0bb89d5a` | `engine/three-search-animations.ts`   | 16 → 1 `any`     | W47-2   |
| `f3afcb1a` | `engine/three-interaction-visuals.ts` | 8 → 1 `any`      | W47-3   |
| `1c0fc284` | `engine/demo-choreography.ts`         | async wrap + 0→24 try/catch | W47-bug-fix |
| `6736ebe0` | `journey/choreography.ts`             | race fix          | W47-bug-fix |
| `bb075544` | 3 untested engine files               | smoke tests       | W47-tests |
| `8e2ba6ca` | `state/app.svelte.ts`                 | warn→debugWarn + lock-in | W47-A |
| `a61a284b` | `docs/type-system-smell-audit.md`     | initial audit     | W47-B   |
| `edb17ab6` | `journey/semantic-overlay.ts`         | 39 → 37 `any`     | W47-C   |
| `222991d3` | `journey/thread-inspector.ts`         | 22 → 21 `any`     | W47-D   |
| `cb09c0c9` | `journey/focus-ui.ts`                 | 20 → 13 `any`     | W47-E   |
| `b7d525a8` | `tests/.../thread-settler-api...test`  | smoke test        | F-prep  |
| `fa852404` | `tests/.../route-trace-api...test`    | smoke test        | H-prep  |
| `4f11d083` | `journey/thread-model.ts`             | 13 → 1 `any`      | W47-J   |
| `4acf450a` | `journey/neighborhood.ts`             | 22 → 15 `any`     | W47-I   |
| `3cf99536` | `journey/thread-settler.ts`           | 26 → 21 `any`     | W47-F   |
| `057dc5b0` | `journey/route-trace.ts`              | 23 → 18 `any`     | W47-H   |

Each tightening commit introduced a typed interface at the engine
boundary (`InspectionState`, `CorridorGlowState`/`CorridorAnimState`,
`GuideConfig`, etc.) and replaced `as any` casts at function-signature
and private-state-shape boundaries. The pattern is the same in each case.

Total: 8 type-safety tightening bites shipped. **67 `any` occurrences
removed across 8 files** (journey: 200→134 = -33%; engine: 24→2 = -92%).

---

## Axis 4: The roughest files (beyond `as any` counts)

Type-safety tightening measures loose typing. But the most unpolished
implementations in this codebase aren't necessarily the highest-`any`
files — they're the ones with multiple smells stacked together. This
axis catalogs files where **other** rough patterns are most prominent.

### The roughest file: `journey/semantic-guide.ts` (292 LOC, 41 `any`)

This file is the single worst-polished module in the codebase by every
measure. Specific smells:

1. **Dual-state import (same module imported twice with different names):**

   ```ts
   import { appState as state } from '@lib/state/app.svelte'  // L22
   import { appState } from '@lib/state/app.svelte';          // L23
   ```

   Both imports resolve to the same object. The `state` alias exists
   purely to provide a name to attach `(state as any)` casts to.

2. **Many `as any` casts are redundant** — `appState` already has
   properly-typed fields for what the code is escaping:
   - `appState.summaryCardTypeToken: number` (state-types.ts:585)
   - `appState.semanticGuideRequestSequence: number` (state-types.ts:581)
   - `appState.semanticGuideAbortController: AbortController | null` (state-types.ts:580)
   The `(state as any).X` casts at L145, L149, L153, L156, L229, L242
   are no-ops bypassing valid typing.

3. **5 `: any` return types on builder functions** (L52, L89, L111, L120, L130).
   Each returns an object with the same shape (`title`, `text`,
   `suggestions`, `laneStatus`). They should share a `SummaryCardConfig`
   interface.

4. **Config-style params all typed `any`** (L38, L52, L99, L106, L111,
   L120, L130, L142, L167, L268, L271): `guide: any`, `config: any`,
   `payload: any`. These should share typed interfaces.

5. **3 catch blocks with `error: any`** (L195, L210, L285) — the
   canonical loose-typing catch pattern. Should be `error: unknown`
   (per `noUncheckedIndexedAccess` policy).

6. **`Record<string, any>` (L84)** — `setSemanticGuideButtonState`'s
   options object. Should be `Record<string, unknown>` (more honest;
   callers can narrow at use site).

7. **5 test files exist** (`tests/semantic-guide-*.mjs`,
   `tests/semantic-guide-*.spec.js`) so tightening has coverage.

### Other rough files

| File                              | Rough pattern                                                            |
| --------------------------------- | ------------------------------------------------------------------------ |
| `audio/audio-scape.ts`            | **7 module-level `let` singletons** (audioCtx, mainOsc, gainNode, filterNode, lastCameraPos, currentVelocity, smoothVelocity). Classic singleton state smell. 0 `any` (so Axis 1/3 misses it) but high fragility to test isolation. |
| `journey/lifecycle-adapter.ts`    | 2 module-level `let` (previouslyFocusedFocusStage, adapter). Adapter pattern with module-level state. |
| `data-store.ts`                   | Module-level promise (`leadEnrichmentLoadPromise`). Singleton state. |
| `journey/focus-ui.ts`             | **8 innerHTML calls** (XSS risk surface — pre-existing rule violation). 4 are gated on internal HTML, 4 build dynamic content with `formatBusinessName`. |
| `journey/selected-card.ts`        | 2 innerHTML calls + 17 `any`. Combined smell. |

### Recommended order for Axis 4

1. **Tighten `journey/semantic-guide.ts`** — the roughest file. Half
   the work is removing redundant casts (no behavior change). Half is
   introducing shared `GuideConfig` + `SummaryCardConfig` interfaces.
2. **innerHTML audit in `journey/focus-ui.ts`** — review the 8 innerHTML
   sites for XSS risk. Some are gated `list.innerHTML = ''` (safe empty
   set), others build dynamic content.
3. **Refactor `audio/audio-scape.ts` singletons** into a class instance
   for testability. Not urgent but fragile.
4. **Empty-catch audit** across the codebase for the
   `catch (error: any) {}` pattern (TypeScript policy says `unknown`).
