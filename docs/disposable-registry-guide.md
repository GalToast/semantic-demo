# DisposableRegistry — Integration Guide

**Status:** Core module committed (`d5911fc5`). 15 contract tests passing.

**Goal:** Eliminate the "start something, forget to stop it" bug class that has
caused ~37% of recent commits (leaks, races, crashes).

---

## What is it?

A single registry that tracks all your cleanup obligations (timers, DOM
listeners, store subscriptions, GPU resources). Register at creation time,
call `disposeAll()` once at teardown. No more forgetting cleanup.

```ts
const reg = new DisposableRegistry({ label: 'my-module' })

// Register a timer
reg.timer(setTimeout(() => ..., 1000))

// Register a DOM listener
reg.listener(window, 'resize', onResize)

// Register a store subscription
reg.subscription(store.subscribe((s) => ...))

// Register a Three.js resource
reg.resource(mesh)

// Later — one call, everything cleaned up
reg.disposeAll()
```

---

## API Quick Reference

| Method | What it tracks | Cleanup on `disposeAll()` |
|---|---|---|
| `timer(id)` | `setTimeout` / `setInterval` id | `clearTimeout(id)` + `clearInterval(id)` |
| `raf(id)` | `requestAnimationFrame` id | `cancelAnimationFrame(id)` |
| `listener(target, type, handler, opts?)` | DOM / EventTarget listener | `target.removeEventListener(...)` |
| `subscription(unsub)` | Store `.subscribe()` return | Calls `unsub()` |
| `resource(obj)` | Object with `.dispose()` | Calls `obj.dispose()` |
| `add(fn)` | Raw cleanup function | Calls `fn()` |
| `addMany(...)` | Batch of any above | Same as individual |

---

## Usage Patterns

### Pattern 1: Non-Svelte engine module (e.g. `three-engine.ts`)

```ts
import { DisposableRegistry } from '@lib/utils/disposable-registry'

let _registry: DisposableRegistry | null = null

export async function init() {
  _registry?.disposeAll()
  _registry = new DisposableRegistry({ label复核: 'my-engine' })

  const id = setTimeout(onReady, 100)
  _registry.timer(id)

  const handler = (e: Event) => { ... }
  window.addEventListener('resize', handler)
  _registry.listener(window, 'resize', handler)
}

export function cancel() {
  _registry?.disposeAll()
  _registry = null
}
```

**Key rule:** Every `addXxx` must happen during init. Every teardown path must
call `disposeAll()`.

### Pattern 2: Svelte component or .svelte.ts module

```ts
import { disposable } from '@lib/utils/disposable.svelte'
import { onDestroy } from 'svelte'

const reg = disposable('MyComponent')

onDestroy(() => {
  reg.disposeAll()
})
```

In a `.svelte` file:

```svelte
<script>
  import { disposable } from '@lib/utils/disposable.svelte'
  import { onDestroy } from 'svelte'

  const reg = disposable('Canvas')

  onMount(() => {
    reg.timer(setTimeout(() => ..., 1000))
    reg.listener(window, 'resize', onResize)
  })

  onDestroy(() => reg.disposeAll())
</script>
```

---

## Migration Strategy

**Rule: Don't refactor for refactoring's sake. Refactor when you touch a file for
another reason.** This keeps risk low and avoids unnecessary churn.

### What to migrate first (highest ROI)

| File | Why | Risk |
|---|---|---|
| `src/lib/engine/three-engine.ts` | 5+ event listeners, manual remove in `cancelAnimate()` | **Low** — just swap `addEventListener` → `registry.listener` |
| `src/components/InfoPanel.svelte` | 2× `setInterval` at 16ms | **Low** — simple timer replacement |
| `src/components/LegacyCompassSurface.svelte` | `setInterval`, store subscriptions | **Low** |
| `src/App.svelte` | Multiple dynamic imports | **Medium** — use `add(unsub)` for abort controllers |

### Files to leave alone for now

- `src/lib/audio/audio-scape.ts` — uses `{ once: true }` (safe)
- `src/components/CompassRail.svelte` — already has `pendingTimers` array
- `src/components/MapView.svelte` — one-shot `setTimeout`

---

## Testing

```ts
import { DisposableRegistry } from '@lib/utils/disposable-registry'

it('lifetime is cleanly managed', () => {
  const reg = new DisposableRegistry()
  reg.timer(setTimeout(() => {}, 1_000_000))
  expect(reg.size).toBe(1)
  reg.disposeAll()
  expect(reg.size).toBe(0)
  expect(reg.isDisposed).toBe(true)
})
```

---

## Anti-patterns to avoid

1. **Double disposal**: Don't call `disposeAll()` from both `onDestroy` AND a
cleanup function. The registry is idempotent, but it's confusing.

2. **Registering after disposeAll**: In DEV mode, the registry warns if you add
a new disposable after `disposeAll()`. Fix: re-create the registry before adding.

3. **Holding onto registry after dispose**: Always null out the reference after
dispose:

```ts
// Good
_registry?.disposeAll()
_registry = null

// Risky (next init might use stale registry)
_registry?.disposeAll()
```

---

## Where this would have prevented recent bugs

| Commit | Bug | How DisposableRegistry would have prevented |
|---|---|---|
| `55407d0d` | Missing `.catch()` on dynamic import | `reg.add(() => { /* cancel in-flight import */ })` |
| `80243db5` | Subscription cleanup missed | `reg.subscription(store.subscribe(...))` |
| `3f82b364` | Canvas / weather UI leak | `reg.listener(canvas, '...', handler)` + `reg.timer(id)` |
| `1dd5f217` | Cursor timeout leaks | `reg.timer(setTimeout(...))` |
| `54ec6c32` | Hydration loop leak | Not directly, but registry makes it obvious when timers aren't cleared |

---

## Future: DisposableRegistry as a language-level pattern

Once the team is comfortable with this pattern:

1. Add an ESLint rule: `prefer-disposable-registry` for modules with more than
   2 `addEventListener` or `setTimeout` calls.
2. Make it the default for new engine modules: `@lib/engine/*` should accept an
   optional `DisposableRegistry` in their init function.
3. Add a global assertion in test harness: after `deinit()`, assert that any
   `DisposableRegistry` instances are disposed.

---

## Reference

- Module: `src/lib/utils/disposable-registry.ts`
- Svelte helper: `src/lib/utils/disposable.svelte.ts`
- Contract tests: `tests/unit-active/disposable-registry-contract.test.ts`
- Commit: `d5911fc5`
