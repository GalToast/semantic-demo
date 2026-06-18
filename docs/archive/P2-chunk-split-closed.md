# P2: Main Chunk Split — Abandoned

**Status:** Closed — known limitation  
**Date:** 2026-06-14

## What was attempted

Lazy-load 2-3 Svelte components (InfoPanel, FocusCard, JourneyChrome, ThreadInspector, DemoChoreography, LoadingOverlay, Toast, WeatherWidget) via dynamic `import()` in `App.svelte` to split them out of the 1,550 kB main entry.

## Why it failed

1. **`import()` at top-level `<script>` isn't lazy** — Vite hoists it and the import executes immediately during module evaluation, defeating the purpose.
2. **`{#if Component}` with null state breaks first paint** — components conditionally rendered via `{#if LazyComp}` render nothing until the dynamic import resolves, causing a flash of missing UI for components like LoadingOverlay that must appear instantly.
3. **Shared stores dominate the bundle** — even after lazy-loading 5 components, the main entry only dropped ~38 kB (1,550 → 1,512). The real weight is the 8,500-line store layer (`src/lib/stores/*`), which is statically imported by every component and can't be lazy-loaded without rewriting the import graph.
4. **`manualChunks` in vite.config.ts** creates separate chunks but they're still loaded as hard dependencies — the browser must fetch both the main entry and the stores chunk before the app works. The total critical-path download barely changes.

## Why the 1,550 kB main entry is acceptable

- The engine kernel (`js/modules/*`) is already lazy-loaded via `Canvas.svelte` (40 kB chunk).
- The main entry is the Svelte UI shell + stores + orchestration. It loads fast on modern hardware.
- First-paint shows the `LoadingOverlay` immediately (no flash). Data loads async. The 1.5 MB parse cost is a one-time startup penalty, not a per-interaction cost.
- gzip: 434 kB. The compressed payload is well within acceptable limits.

## Recommendation

Chunk splitting remains a valid optimization, but it requires a deeper refactor:
- Extract the store layer into a separate entry point loaded before the app shell.
- Or use Vite's `manualChunks` with a `modulepreload` polyfill so the stores chunk loads in parallel with the main entry.
- Or split the app into multiple HTML entry points (multi-page app pattern).

These are multi-day efforts, not a "mechanical" P2 task. The 1.5 MB main entry is acceptable for now.
