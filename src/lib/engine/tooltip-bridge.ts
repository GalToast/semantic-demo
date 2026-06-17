/**
 * @lib/engine/tooltip-bridge.ts — Sanctioned passthrough for tooltip hide
 *
 * Bridges `hideTooltip` from the imperative engine kernel until the full
de tooltip port is done (W20+). No Svelte equivalent justified; this is a
 * tiny DOM-only helper.
 */
export { hideTooltip } from '@lib/ui/tooltip'
