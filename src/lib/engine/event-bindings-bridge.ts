/**
 * @lib/engine/event-bindings-bridge.ts — Sanctioned passthrough (W11-T10 Wave 1).
 * Re-exports the legacy event-bindings module. Will retire when T10-Wave 3
 * ports the module natively.
 */
export {
  revealSelectedBusinessCard,
  setInfoPanelOpen,
  disposeEventListeners,
  zoomCamera,
  expandNeighborhoodFromCurrentNode,
  recenterFocusedNode,
  returnToCountyView,
  updateHasQuery,
  initEventListeners,
} from '../../../js/modules/event-bindings';
