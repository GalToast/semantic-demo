/**
 * panel-bindings.js — Delegation shim to canonical implementation.
 *
 * Legacy imports (e.g., demo-choreography.ts) dynamically import this module.
 * All logic lives in js/modules/bindings/panel-bindings.ts (BOTH pattern).
 */
export {
  revealSelectedBusinessCard,
  setInfoPanelOpen,
  unbindPanelControls,
  bindPanelControls,
} from './panel-bindings.ts';
