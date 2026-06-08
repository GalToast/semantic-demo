/**
 * @lib/engine/bridge.ts — Legacy-compatible proxy (delegates to adapters/)
 *
 * This file is kept for backward compatibility.  All logic has been extracted
 * into domain-specific adapters under `src/lib/engine/adapters/`:
 *
 *   ├── core.ts              # Factory composition root
 *   ├── camera-bridge.ts     # Camera transitions, poses, orbit sync
 *   ├── search-bridge.ts     # Search results, glow, corridor focus
 *   ├── lifecycle-bridge.ts  # Init, destroy, view, filters, diagnostics
 *   └── data-bridge.ts       # Data loading orchestration and dataset syncing
 *
 * New code should import directly from `@lib/engine` (the barrel) or from the
 * adapter files when a narrower dependency is preferred.
 *
 * DESIGN PRINCIPLES (carried forward from the monolith)
 * ─────────────────
 * 1. IMPERATIVE ONLY.  Methods that Svelte components call in response to user
 *    actions.  The Svelte stores are the single source of truth for UI state.
 * 2. THIN DELEGATION.  Each method delegates to exactly one legacy module.
 * 3. SINGLETON LIFECYCLE.  `createEngineBridge()` returns a fresh instance.
 *    The Canvas component owns it via onMount / onDestroy.
 * 4. NO THREE.JS IMPORTS.  Keeps the Svelte build free of Three.js overhead.
 */

// ── Re-export the factory ───────────────────────────────────────────────────

export { createEngineBridge } from './adapters/core';

// ── Re-export public types ───────────────────────────────────────────────────

export type {
  EngineBridge,
  EngineCallbacks,
  EngineStatus,
  FocusNodeOptions,
  SearchCorridorOptions,
  SwitchViewOptions,
  FilterOptions,
  SceneDiagnostics,
  BridgeSearchResult,
  BridgeSearchMetadata,
  BridgeSearchResponse,
  BridgeSearchState,
} from './adapters/types';
