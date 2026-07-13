/**
 * @lib/z-index.ts — Managed z-index layer system
 *
 * Single source of truth for all z-index values in the application.
 * Replaces scattered CSS z-index values that caused overlay-behind-journey-modal,
 * controls-above-focus-card, and similar z-index bug families.
 *
 * Usage in TypeScript:
 *   import { Z_LAYERS } from '@lib/z-index';
 *   style.zIndex = Z_LAYERS.search.toString();
 *
 * Usage in CSS (via z-layers.css custom properties):
 *   z-index: var(--z-search);
 */
export const Z_LAYERS = {
  /** Three.js WebGL canvas and base scene */
  canvas: 0,

  /** Field nodes (point instanced mesh) */
  fieldNodes: 10,

  /** Thread/mycelium lines */
  threads: 20,

  /** Semantic manifold and lens overlays */
  overlays: 30,

  /** Legend panel */
  legend: 50,

  /** Search trail cue (mobile) — above canvas/threads, below interactive chrome */
  trailCue: 50,

  /** Mobile focus bottom-sheet card — below panels so the a11y toggle wins */
  focusStageCard: 70,

  /** Info panel and side panels */
  panels: 80,

  /** Elevated panels (popovers, dropdowns) */
  panelsElevated: 90,

  /** Search input and results */
  search: 100,

  /** Focus neighbor rail — above search, below journey chrome */
  neighborRail: 110,

  /** Journey chrome (compass, breadcrumb, step indicators) */
  journeyChrome: 200,

  /** Active journey trail visualization */
  journeyActive: 500,

  /** Focus pocket card */
  focusCard: 600,

  /** Compass rail */
  compass: 700,

  /** Camera/interaction controls */
  controls: 800,

  /** Journey blocking overlay (prevents interaction during transitions) */
  journeyBlock: 900,

  /** Generic blocker (modal backdrop, loading gate) */
  blocker: 1000,

  /** Inside-walk HUD bars (status/controls) — above blocker, below toasts */
  insideWalk: 1100,

  /** Journey modal (trail review, etc.) */
  journeyModal: 2000,

  /** Loading overlay (highest priority — on top of everything; matches --z-max ceiling) */
  loading: 9999,

  /** Click-pulse interaction ring — just below the max tooltip layer */
  canvasInteraction: 9998
} as const;

/** Z-index layer key type for type-safe access */
export type ZLayerKey = keyof typeof Z_LAYERS;

/**
 * Get a z-index value by layer name.
 * Useful when the layer name is dynamic (e.g., from a config).
 */
export function getZIndex(layer: ZLayerKey): number {
  return Z_LAYERS[layer];
}
