# Roadmap: Final Stabilization & Native Transition

**Date:** 2026-06-06
**Status:** PROPOSED
**Goal:** Transition the Semantic Explorer from its current high-quality hybrid state to a pure Svelte/TypeScript architecture with polished mycelium graphics.

## Track 1: Advanced Visuals (Phase 1.3)
*   **LOD System:** Implement point-sprite rendering for distant clusters to maintain 60FPS on massive datasets.
*   **Variable-Width Mycelium:** Replace standard 1px lines with `Line2` (WebGL) for true bioluminescent "tapering" effects.
*   **Depth & Dither:** Add a subtle background noise/grain shader to eliminate color banding in the dark indigo gradients.

## Track 2: Core Migration Completion (Phase 5)
*   **Lifecycle Extraction:** Port the remaining 1,212-line `lifecycle.js` to `src/lib/orchestration/`. This is the "brain" that coordinates between data, engine, and UI.
*   **Component Finalization:** Complete the WebGL integration for the `ThreadInspector` and `FocusPocket` components (adding geometry/animations).
*   **Event Bus Migration:** Fully replace legacy `dispatchNavTransition` with the new Svelte-native Event Bus.

## Track 3: Burning the Bridge (Phase 6)
*   **Entry Point Flip:** Make `src/main.ts` the primary entry point for all builds.
*   **Legacy Cleanup:** Delete the `js/modules/` directory entirely once 100% of logic is verified in `src/lib/`.
*   **Bundle Optimization:** Remove the bridge layer code to reduce bundle size by ~15%.

---
## Recommended Immediate Action
I suggest we launch one more **Nemotron Ultra** subagent to handle the **Phase 5: Lifecycle Extraction**. This is the single largest logic block remaining and requires the high reasoning capacity of Nemotron to safely decouple the last legacy dependencies.
