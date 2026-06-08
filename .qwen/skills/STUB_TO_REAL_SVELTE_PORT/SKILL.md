---
name: Stub-to-Real Svelte Port
description: Step-by-step procedure for replacing orchestration-layer stubs with real Svelte-store-backed implementations during a JS → Svelte migration. Covers store tracing, component visibility, event-bus gaps, and browser verification with Playwright when canvas blocks pointer events.
source: auto-skill
extracted_at: '2026-06-07T01:24:06.056Z'
---

# Stub-to-Real Svelte Port

Use this when a JS → Svelte/TS migration has "complete" components but their data never renders — the stubs are in the **orchestration/actions layer** (the TS modules that the Svelte components import). The components are fine; the data pipes are hollow.

## When to use

- A Svelte component is marked complete but its rendered content is always empty / default.
- You find functions in TS modules that `return null`, `return false`, `debugWarn('[journey] Stub function hit: ...')`, or similar placeholder patterns.
- User interactions (clicks, searches, hovers) don't update the Svelte UI, but the legacy app worked fine.
- `visible={false}` is hard-coded on a component in `App.svelte`.

## Procedure

### Step 1: Map the data-flow chain

For each component that looks "complete" but doesn't render data:

1. **Read the component's `<script>` block** — find every import that comes from `src/lib/` (stores, actions, utils).
2. **Identify store reads:** `$storeName`, `get(storeName)`, `$derived.by(() => ...)` that calls into `src/lib/`.
3. **Identify action imports:** functions like `inspectThreadNeighbor`, `applyLocalNeighborhoodFocus`, `clearPocketNodes`.
4. **Build a mental map:**
   ```
   Component (renderer)
     → imports action functions from src/lib/journey/*.ts
       → action functions read/write stores from src/lib/stores/*.ts
         → stores hold the reactive state the component renders
   ```

**Key finding:** The stubs are almost never in the component or the store — they're in the **actions layer** (the TS modules that bridge between stores and the component). The `SVELTE_MIGRATION_PARITY_AUDIT` skill's Layer 2 covers detecting this, but doesn't prescribe the fix procedure.

### Step 2: Read the legacy imperative module

Open the legacy `.js` module that the stubs are porting from (e.g., `js/modules/thread-inspector.js`).

1. **Identify the public API surface:** all `export function` declarations.
2. **For each exported function, note:**
   - What legacy state properties does it read? (`state.navState.focusedIndex`, `state.inspectedThreadIndex`, etc.)
   - What legacy state properties does it write? (`state.inspectedThreadIndex = index`)
   - What callbacks/adapters does it call? (bridge functions, engine methods)
   - What side effects does it have? (DOM queries, `setTimeout`, event bus publishes)
3. **Look for module-scope side effects** — at the top of many legacy modules there are `subscribe(EVENTS.xxx, ...)` calls or `setInspectedStrandOverlayUpdater(...)` registrations. These must also be ported.

### Step 3: Trace each property to its Svelte store equivalent

For every legacy `state.someProperty` read or write:

1. **Find the corresponding Svelte store** — search `src/lib/stores/` for the property name.
2. **Check if it's a writable store** with a setter function (e.g., `updateThreadInspector({ ... })`, `navState.update(...)`).
3. **If no store or setter exists, you need to create or extend one.**

Common store mappings:
| Legacy property | Svelte equivalent |
|---|---|
| `state.navState.mode` | `navState.update(s => ({ ...s, mode: ... }))` from `@lib/stores/navigation` |
| `state.navState.focusedIndex` | Same store, write via update or `setFocusedIndex(index)` |
| `state.inspectedThreadIndex` | `focusStore.update(s => ({ ...s, threadInspector: { ...s.threadInspector, inspectedIndex: idx } }))` |
| `state.pinnedThreadIndex` | `focusStore.update(s => ({ ...s, pinnedThreadIndex: idx }))` |
| `state.threadInspectorPointerInside` | `focusStore.update(s => ({ ...s, threadInspector: { ...s.threadInspector, pointerInside: bool } }))` |

### Step 4: Implement each stub function

Replace each `return null` / `debugWarn('[journey] Stub...')` with a real implementation:

```typescript
// Pattern: import stores, read with get(), write with .update()
import { get } from 'svelte/store';
import { focusStore, updateThreadInspector } from '@lib/stores/focus';
import { navState } from '@lib/stores/navigation';
import { businessRecords } from '@lib/data-store';

export function inspectThreadNeighbor(index: number): ThreadInspectionDescriptor {
  // 1. Validate
  if (!Number.isFinite(index)) return IDLE_DESCRIPTOR;

  // 2. Read current state
  const nav = get(navState);

  // 3. Write to the store (triggers reactivity)
  updateThreadInspector({ active: true, inspectedIndex: index });

  // 4. Call side-effect integrations (engine bridge, strand continuity)
  if (_engineBridge) _engineBridge.inspectThread(index);

  // 5. Return the resolved descriptor for synchronous callers
  return getThreadInspectionState(index);
}
```

**Rules:**
- Use `get(store)` only for one-shot reads inside action functions.
- Use `store.update(...)` for writes — this is the Svelte 5 reactive path.
- Never assign directly to a store value (`$store = ...` — that's Svelte 4 syntax).
- For timers, use the `StrandContinuityManager.setTimer(purpose, ms, callback)` pattern (purpose-keyed, no-leak).

### Step 5: Wire missing event bus subscribers

After implementing all exported functions, check if the legacy module had **module-scope event subscriptions**:

```javascript
// In the legacy module's top-level scope:
subscribe(EVENTS.CAMERA_NODE_FOCUSED, (payload) => { ... });
```

The Svelte equivalent lives in `src/lib/orchestration/triggers.ts`. Add a subscriber:

```typescript
import { subscribe, EVENTS } from '@lib/orchestration/event-bus';
import { navState } from '@lib/stores/navigation';

subscribe(EVENTS.SEARCH_FOCUS_REQUESTED, ({ index }: { index: number }) => {
  if (!Number.isFinite(index)) return;
  navState.update((s) => ({ ...s, focusedIndex: index, mode: 'focus', surface: 'focus' }));
  // ... other side effects
});
```

**Check for:** `subscribe(EVENTS.XXX, ...)` calls in the legacy module that have NO equivalent in `src/lib/orchestration/triggers.ts`. These are silent drop paths.

### Step 6: Fix `App.svelte` component visibility

The most common reason a "complete" Svelte component doesn't render:

```svelte
<!-- Before (hard-coded false — never shows) -->
<FocusPocket visible={false} />
<ThreadInspector visible={false} />

<!-- After (driven by derived focus state) -->
<FocusPocket visible={focusActive} />
<ThreadInspector visible={focusActive} />
```

Where `focusActive` is a `$derived` from state:

```typescript
let focusActive = $derived(
  $navState.mode === 'focus' || $navState.mode === 'inside' || $navState.focusedIndex !== null
);
```

Always check `App.svelte` for `visible={false}` on components marked "Complete" in project docs.

### Step 7: Verify with svelte-check

```bash
npx svelte-check --workspace src --no-tsconfig --diagnostic-sources svelte,css
```

Expect **0 errors**. Warnings about unused CSS selectors in other files are acceptable if they're pre-existing.

### Step 8: Browser verification when canvas blocks pointer events

When the WebGL canvas takes full viewport and intercepts all `pointer*` events, standard Playwright `click()` will fail with "subtree intercepts pointer events":

**Workaround 1 — Programmatic dispatch:**
```typescript
// In browser_evaluate:
const el = document.querySelector('#target-id');
el.click(); // bypasses pointer-event hit-testing
```

**Workaround 2 — Canvas node raycasting:**
The canvas has its own pointer handler. Clicking at a 3D node position works via the canvas's own raycasting:
```typescript
canvas.dispatchEvent(new PointerEvent('pointerdown', { clientX, clientY, button: 0 }));
```

**Workaround 3 — Direct state injection via browser_evaluate:**
For testing the reactive component rendering (not the interaction path), import the Svelte stores via dynamic import or directly set the legacy `__APP_STATE__` properties that the engine bridge reads:
```typescript
const s = window.__APP_STATE__;
s.focusedNode = 100;
s.navState.mode = 'focus';
```

**Verification checklist:**
- `document.getElementById('focus-stage')?.classList.contains('active')` → is focus stage active?
- `document.getElementById('focus-thread-inspector')` → present in DOM?
- `document.getElementById('focus-pocket')` → present with `.focus-node` children?
- `document.body.dataset.focusedNode` → set to a number?
- `document.body.dataset.navSurface` → set to `'focus'`?

### Step 9: Check for duplicate-mounted components (islands track)

In a dual-track migration (Svelte islands + Svelte src/), the islands-track components mount with the same DOM IDs. Check which track is actually rendering:

```typescript
// In browser_evaluate:
document.getElementById('focus-thread-inspector')?.className
// 'focus-thread-inspector' = islands track (legacy class names, no svelte- hash)
// 'focus-thread-inspector svelte-xxxxx' = src/ track (Svelte component with component hash)
```

If the islands track wins for a component you're porting, the src/ version is live but shadowed. Defer resolution — the islands track is slated for retirement per AGENTS.md canonical-track rule.

## Output Format

After completing the port, report:

```
### Files changed
- `src/lib/journey/thread-inspector.ts` — replaced 8 stubs
- `src/components/ThreadInspector.svelte` — enhanced to full descriptor
- `src/App.svelte` — wired visible prop
- `src/lib/orchestration/triggers.ts` — added missing subscriber

### Build health
svelte-check: 0 errors, 2 pre-existing CSS warnings

### Browser verification
- [x] FocusPocket renders 10 constellation nodes (svelte-wdgx9m hash)
- [x] focus-stage active when mode === 'focus'
- [x] ThreadInspector overlay present with title/copy/meta/buttons
- [x] body[data-focused-node] set to focused index
- [x] body[data-nav-surface] set to 'focus'

### Gaps discovered
- Click on focus pocket node → thread inspector not wired (future scope)
- Islands track shadows the src/ ThreadInspector component
```
