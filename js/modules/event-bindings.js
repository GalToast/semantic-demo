/**
 * event-bindings.js — Delegation shim to canonical implementation.
 *
 * Legacy tests and lifecycle.js import from js/modules/event-bindings.js.
 * All logic lives in js/modules/event-bindings.ts (BOTH pattern).
 */
export {
  revealSelectedBusinessCard,
  setInfoPanelOpen,
  initEventListeners,
  disposeEventListeners,
  zoomCamera,
  expandNeighborhoodFromCurrentNode,
  recenterFocusedNode,
  returnToCountyView,
  updateHasQuery,
} from './event-bindings.ts';
