/**
 * focus-trap.ts — Thin re-export shim
 *
 * Canonical implementation moved to src/lib/utils/focus-trap.ts (W11-T1b).
 * This shim preserves backward compatibility for engine kernel importers.
 */

export { FOCUSABLE_SELECTORS, setupFocusTrap, releaseFocusTrap } from '@lib/utils/focus-trap';
