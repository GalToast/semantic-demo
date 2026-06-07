/**
 * app.js — Compatibility wrapper for the TS entry flip.
 *
 * Runtime builds now use app.ts as the entry (via build-app.mjs).
 * This file preserves the TS/JS export and import surface for the
 * drift contract (ts-js-drift-contract.mjs). It re-exports init
 * from the TypeScript entry and keeps all sibling imports for surface
 * parity. The self-start lives in app.ts, not here.
 */

import '../state.js';
import './journey.js';
import './micro-demo.js';
import './search-state.js';
import './camera-controls.js';
import './focus-pocket.js';
import './data-loader.js';
import './audio-scape.js';
import './three-search-animations.js';
import './tooltip.js';
import './three-engine.js';
import './event-bindings.js';
import './keyboard-help.js';
import './utils/ui-presentation.js';
import './utils/geo-data.js';
import './journey-lifecycle-adapter.js';
import './cluster-filter-adapter.js';
import './journey-compass-controller.js';
import './journey-selected-card.js';
import './thread-inspector-adapter.js';
import './view-controller.js';
import './semantic-lane.js';
import './exploration-mode.js';
import './lifecycle.js';
import './semantic-threads.js';
import './semantic-search-api-cache.js';
import './url-state.js';
import './loading-ui.js';
import './pathfinding.js';
import './scene-reveal.js';
import './journey-webgl.js';
import './webgl-restore-adapter.js';
import './semantic-dive-ui.js';
import './focus-stage-dom.js';
import './map-state.js';
import './cluster-labels.js';
import './legend-ui.js';
import './search-panel-adapter.js';
import './journey-point-color.js';
import './event-bus.js';
import './semantic-guide.js';
import './connection-analysis.js';
import './search-results-ui.js';
import './app-svelte-island.js';

// Re-export init from the TypeScript entry for export-surface parity.
// The self-start (init().catch + setWebGLContextRestoreHandler) lives in app.ts.
export { init } from './app.ts';
