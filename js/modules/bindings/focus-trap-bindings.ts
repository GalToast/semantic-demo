/**
 * focus-trap-bindings.ts — Thin re-export shim
 *
 * Canonical implementation moved to src/lib/utils/focus-trap-bindings.ts (W11-T1b).
 * This shim preserves backward compatibility for engine kernel importers.
 */

export { bindFocusTrapObserver, disposeFocusTrapBindings } from '../../../src/lib/utils/focus-trap-bindings';
