/**
 * @lib/engine/ui-feedback-bridge.ts — Sanctioned passthrough (W11-T10 Wave 1).
 * Re-exports the legacy ui-feedback module. Will retire when T10-Wave 3
 * ports the module natively.
 */
export { showExperienceToast, syncSearchStatusForFocus } from '@lib/ui/ui-feedback';
export type { SyncSearchStatusOptions } from '@lib/ui/ui-feedback';
