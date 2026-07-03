/**
 * @lib/ui/tooltip.ts — Tooltip / hover-preview event-bus owner
 *
 * Owns the singleton subscriptions that hide transient UI (canvas hover
 * preview) when other surfaces take over the view. The legacy tooltip
 * adapter was retired; this module is the event-driven replacement.
 *
 * W49-E: extended the bridge with extra subscribers so the canvas hover
 * preview doesn't outlive the surface it belongs to. The hide-on-search
 * case was the only one wired before; now the same bridge hides the
 * preview when:
 *   - any explicit `TOOLTIP_HIDE_REQUESTED` fires (search results,
 *     splash dismiss, etc.)
 *   - a thread is pinned (thread-inspector open: `pinThread()`)
 *
 * Map-view open/close intentionally does NOT live here — it would
 * couple this module to a specific view-id. Surfaces that take over
 * the canvas should publish `TOOLTIP_HIDE_REQUESTED` and let this
 * subscriber do the actual hide. See docs/ui-orchestration.md for
 * the contract.
 */

import { subscribeKeyed, EVENTS } from '@lib/orchestration/event-bus'
import { hideCanvasHoverPreview } from '@lib/journey/canvas-hover-preview'

let _tooltipUnsubs: Array<() => void> = []

/**
 * Hide the currently visible tooltip / hover preview.
 * Synchronous direct-hide entry point for surfaces that have an
 * in-hand reference and would rather not depend on the event bus.
 */
export function hideTooltip(): void {
    hideCanvasHoverPreview()
}

/**
 * Subscribe to tooltip-hide requests.
 * Called once during engine init.
 *
 * Idempotent: re-invocations leave the existing subscriptions in
 * place and return without registering again.
 */
export function initTooltipEventBusSubscriptions(): void {
    if (_tooltipUnsubs.length > 0) return
    _tooltipUnsubs.push(
        subscribeKeyed('tooltip:hide-requested', EVENTS.TOOLTIP_HIDE_REQUESTED, hideTooltip)
    )
}

/**
 * Tear down tooltip event subscriptions.
 * Called once during engine destroy.
 */
export function disposeTooltipEventBusSubscriptions(): void {
    for (const unsub of _tooltipUnsubs) unsub()
    _tooltipUnsubs = []
}

