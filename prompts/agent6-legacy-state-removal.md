# Agent 6 — Legacy `@legacy/state.js` Removal from `src/lib/` Files

You are removing direct `import { state } from '@legacy/state.js'` from 4 files in `src/lib/`, replacing them with Svelte store-based state access. This is a key step in the Svelte migration — these files bypass the store layer and read/write the legacy state singleton directly.

**Working directory:** `C:\Users\HP\Desktop\Temp while my comp is at the shop\semantic-explorer`

## YOUR SCOPE — Non-overlapping with other agents

You own these 4 files ONLY:
- `src/lib/focus/pocket.ts`
- `src/lib/demo/choreography.ts`
- `src/lib/demo/guards.ts`
- `src/lib/demo/camera.ts`

You do NOT own:
- `js/modules/` files — Agent 1 handles `as any` casts there
- `types/` files — Agent 1 handles interface additions
- `src/lib/journey/canvas-*.ts` — these still import `@legacy/state.js` but are intentionally left for a later phase (they need the state singleton for real-time raycaster access)
- `src/lib/engine/` — the bridge layer stays as-is

## CONTEXT — Why these files import legacy state

These 4 files were ported from legacy JS modules during the Svelte migration scaffold phase. They were given stub implementations that import `state` directly from `@legacy/state.js` to avoid breaking the build. The goal now is to replace those imports with proper store reads.

## STEP 1 — Understand the store architecture

Read these files to understand the available stores:
- `src/lib/stores/navigation.svelte.ts` — nav state (currentView, focusedNode, mode, navState)
- `src/lib/stores/focus.svelte.ts` — focus state (focusTarget, constellation, etc.)
- `src/lib/stores/camera.svelte.ts` — camera state (cameraPosition, controls)
- `src/lib/stores/engine-bridge.svelte.ts` — engine bridge (scene, renderer, points)
- `src/lib/stores/index.svelte.ts` — re-exports all stores

The pattern for reading from stores:
```typescript
import { navStore } from '@lib/stores/navigation.svelte.js';
import { focusStore } from '@lib/stores/focus.svelte.js';
import { engineBridgeStore } from '@lib/stores/engine-bridge.svelte.js';

// In a function:
const nav = navStore();
const focus = focusStore();
const engine = engineBridgeStore();

// Access properties:
const currentView = nav.currentView;
const focusedNode = nav.focusedIndex;
```

The pattern for writing to stores:
```typescript
import { navStore } from '@lib/stores/navigation.svelte.js';

navStore.update(s => ({ ...s, focusedIndex: newIndex }));
```

## STEP 2 — Fix `src/lib/focus/pocket.ts`

Read the file. It imports:
```typescript
import { state, withStateMutation } from '@legacy/state.js';
```

And uses `state` extensively for:
- `state.navState` — navigation state
- `state.targetPositions` — position arrays
- `state.originalPositions` — position arrays
- `state.nodePositions` — position arrays
- `state.camera` — camera reference
- `state.points` — business point data
- `state.FOCUS_CONSTELLATION_MOTIFS` — constellation config
- `state.focusPocketMotionByIndex` — motion state
- `state.focusPocketTransitionStartedAt` — timing

Replace with store reads. For `withStateMutation`, check if the stores have an equivalent:
```typescript
import { withStateMutation } from '@legacy/state.js';
```

If `withStateMutation` is needed for tracked sub-object mutations, keep this import — it's the Proxy guard, not a state read. The import can remain as:
```typescript
import { withStateMutation } from '@legacy/state.js';
// But remove: import { state } from '@legacy/state.js';
```

Then replace all `state.X` reads with store reads:
```typescript
import { navStore } from '@lib/stores/navigation.svelte.js';
import { engineBridgeStore } from '@lib/stores/engine-bridge.svelte.js';

const nav = navStore();
const engine = engineBridgeStore();

// Instead of state.navState.focusedIndex:
nav.focusedIndex

// Instead of state.camera:
engine.camera

// Instead of state.points:
engine.points
```

For state writes (e.g., `state.targetPositions[i] = ...`), use `withStateMutation` wrapping if the store doesn't expose a direct setter, or use the store's update function.

## STEP 3 — Fix `src/lib/demo/choreography.ts`

Read the file. It imports:
```typescript
import { state } from '@legacy/state.js';
```

And likely uses `state.points` for node selection during demo choreography.

Replace with:
```typescript
import { engineBridgeStore } from '@lib/stores/engine-bridge.svelte.js';
const engine = engineBridgeStore();
// Use engine.points instead of state.points
```

Also check for dynamic imports:
```typescript
const mod = await import('@legacy/state.js');
```
Replace with store reads.

## STEP 4 — Fix `src/lib/demo/guards.ts`

Read the file. It imports:
```typescript
import { state } from '@legacy/state.js';
```

And uses `state` for:
- `state.currentView` — checking if in galaxy view
- `state.focusedNode` — checking if a node is focused
- `state.navState` — navigation state checks
- `state.renderer` — WebGL renderer check
- `state.points` — point data for demo eligibility

Replace with store reads:
```typescript
import { navStore } from '@lib/stores/navigation.svelte.js';
import { engineBridgeStore } from '@lib/stores/engine-bridge.svelte.js';

const nav = navStore();
const engine = engineBridgeStore();

// state.currentView → nav.currentView
// state.focusedNode → nav.focusedIndex
// state.renderer → engine.renderer
// state.points → engine.points
```

## STEP 5 — Fix `src/lib/demo/camera.ts`

Read the file. It imports:
```typescript
import { state } from '@legacy/state.js';
```

And uses `state.camera` and `state.controls` for camera snapshots during demo.

Replace with:
```typescript
import { engineBridgeStore } from '@lib/stores/engine-bridge.svelte.js';
const engine = engineBridgeStore();
// state.camera → engine.camera
// state.controls → engine.controls
```

## STEP 6 — Verify

1. `npm run check` — svelte-check must pass on `src/`
2. `npm run build:svelte` — Vite build must succeed
3. `grep -rn "@legacy/state" src/lib/focus/pocket.ts src/lib/demo/choreography.ts src/lib/demo/guards.ts src/lib/demo/camera.ts` — must return 0 results (except possibly `withStateMutation` import in pocket.ts)
4. `npm run build` — legacy esbuild must still succeed (these files are in src/, not in the esbuild entry)

## STEP 7 — Report

```markdown
## Agent 6 — Legacy State Removal Report

### Files modified (4 expected)
| File | Legacy imports removed | Store imports added | withStateMutation kept |
|------|----------------------|--------------------|-----------------------|
| `src/lib/focus/pocket.ts` | | | |
| `src/lib/demo/choreography.ts` | | | |
| `src/lib/demo/guards.ts` | | | |
| `src/lib/demo/camera.ts` | | | |

### Store mapping
- `state.navState` → `navStore().X`
- `state.camera` → `engineBridgeStore().camera`
- `state.points` → `engineBridgeStore().points`
- `state.renderer` → `engineBridgeStore().renderer`
- `state.controls` → `engineBridgeStore().controls`
- Other: <list any custom mappings>

### Verification
- `npm run check`: PASS/FAIL (svelte-check)
- `npm run build:svelte`: PASS/FAIL
- `grep "@legacy/state" src/lib/focus/pocket.ts`: 0 results (or note withStateMutation exception)
- `grep "@legacy/state" src/lib/demo/*.ts`: 0 results

### Cross-seam findings
- Any store property that doesn't exist yet (needs Agent 1 to add): <list>
- Any state mutation that can't be done through stores: <list>
- Remaining @legacy/state imports in src/lib/ (not in your scope): <list with file:line>
```
