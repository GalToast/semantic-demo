# W6-T1 — App.svelte Integration Spec (deferred)

**Date:** 2026-06-19
**Status:** Spec only. NOT applied. The implementation lands when parallel-session finishes their App.svelte work.

---

## Why this is a spec, not an edit

The current working tree has `src/App.svelte` modified by the parallel session as part of unrelated W6 follow-ups (focus-integrations, contract test infra). Touching it now would race their work and produce a stomping commit. This document captures the minimal change needed so the next session (or parallel session when their work lands) can apply it cleanly.

## Component pieces already in place

| File | State | Purpose |
|------|-------|---------|
| `src/lib/stores/engine-ready.svelte.ts` | ✅ created (Worker G) | Svelte 5 `$state` flag flipped on first user gesture |
| `src/lib/orchestration/wait-for-gesture.ts` | ✅ created (Worker G) | Window-level gesture monitor with teardown |
| `src/components/Splash.svelte` | ✅ created (main lane) | CSS-only splash screen with `data-testid="splash-cta"` button |
| `src/components/Canvas.svelte` | ✅ modified | New `defer?: boolean` prop added; when `true`, initEngine() waits on the engine-ready store |
| `src/main.ts` | ✅ modified | `installGestureMonitor()` wired up after `initRouteTraceSubscriptions()`, calls `engineReady.signalReady()` on first signal |

## Required App.svelte change

The integration is two lines plus one conditional. Apply when App.svelte is freed:

### 1. Add imports

```ts
import Splash from '@components/Splash.svelte';
import { engineReady } from '@lib/stores/engine-ready.svelte';
```

### 2. Replace the existing `<Canvas …/>` invocation

**Before** (likely form, exact wording may vary):

```svelte
<Canvas interactive={…} />
```

**After**:

```svelte
{#if engineReady.value}
  <Canvas interactive={true} defer={true} />
{:else}
  <Splash />
{/if}
```

### 3. Cleanup on unmount (optional)

If the Splash is dismissed before the canvas has rendered, ensure the conditional re-renders cleanly. The Svelte `$effect` inside `Splash.svelte` already syncs `document.body.dataset.appState` to spin up/down the body attribute, so this is housekeeping only.

## Verification step after apply

1. `npm run check:svelte` — should pass 0 errors / 0 warnings.
2. `npm run build` — should exit 0. The first paint should show only the splash; the canvas DOM should not appear in the network response payload until interaction.
3. `npm run test:unit --run` — w6-splash-t1-contract.mjs should pass.
4. Lighthouse on `http://127.0.0.1:4174/` with `--only-categories=performance`: target TBT < 200 ms (down from current ~4.3 s) and Perf score ≥ 80 (up from 65).

## Why the splash doesn't gate paths inside Splash.svelte

W6-T1's charter said: "wedge the engine behind user intent, not lazily hide the splash visuals." Splash.svelte is intentionally always visible while not dismissed; it never tries to "look like the engine" or steal focus from it. Once dismissed, the headline disappears via the conditional that swaps to `<Canvas />`.

## Open question

Should Splash.svelte be visible again on visibility change (= `'hidden'`)? The current implementation does not restore it. If we want a "dimmed overlay" behavior during long idle, that becomes W6-T1.5.
