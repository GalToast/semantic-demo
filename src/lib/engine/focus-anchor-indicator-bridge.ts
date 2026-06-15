/**
 * @lib/engine/focus-anchor-indicator-bridge.ts — Sanctioned passthrough (W11-T10 Wave 1).
 * Re-exports the legacy focus-anchor-indicator module. Will retire when T10-Wave 3
 * ports the module natively.
 */
export {
  createFocusAnchorIndicator,
  updateFocusAnchorIndicator,
  disposeFocusAnchorIndicator,
} from '../../../js/modules/focus-anchor-indicator';
