/**
 * src/lib/ui/tooltip.ts
 *
 * Tooltip display, positioning, and event-bus integration.
 *
 * W49c: replaced module-level `_tooltipUnsubs` Array + manual cleanup with
 * a module-owned DisposableRegistry (same pattern as weather-ui.ts). The
 * previous `disposeTooltipEventBusSubscriptions()` only cleared event-bus
 * subscriptions, leaving `tooltipRevealFrame` (RAF) and `tooltipHideTimer`
 * (setTimeout) orphaned across engine destroy. Now `dispose…` delegates
 * to `_registry.disposeAll()` which clears every tracked resource in
 * reverse order, including the RAF and setTimeout.
 */

import { formatBusinessName, cleanPublicNoteText, sanitizePublicFacingNote } from '@lib/utils/dom-formatters'
import { describeCluster } from '@lib/utils/ui-presentation'
import { getViewportSize } from '@lib/utils/environment'
import { subscribeKeyed, EVENTS } from '@lib/orchestration/event-bus'
import { createDisposableRegistry, type DisposableRegistry } from '@lib/utils/disposable-registry'
import type { Point } from '@lib/state/state-types'

/** Last RAF id — kept for inline cancellation when the tooltip is
 *  re-positioned before the fade-in completes. The registry owns the
 *  cancellation callback for dispose-all, but the inline code also clears
 *  it on rapid re-position so we don't leak RAF callbacks. */
let tooltipRevealFrame: number | null = null

/** Last setTimeout id (200ms hide-delay timer). Same pattern as the RAF
 *  — inline clears on re-position; registry owns dispose. */
let tooltipHideTimer: ReturnType<typeof setTimeout> | null = null

/**
 * Module-owned disposable registry. Owns event-bus subscriptions, the
 * RAF, and the setTimeout. Created lazily on first use so dispose is
 * safe even if init never ran (returns early on null registry).
 */
let _registry: DisposableRegistry | null = null

function ensureRegistry(): DisposableRegistry {
    if (!_registry) {
        _registry = createDisposableRegistry({ label: 'tooltip' })
    }
    return _registry
}

export function updateTooltipContent(point: Point): void {
    const tooltip = document.getElementById('hover-tooltip')
    if (tooltip) tooltip.classList.remove('ambiguous')

    const tooltipSectionLabels = document.querySelectorAll('#hover-tooltip .tooltip-section-label')
    if (tooltipSectionLabels[0]) tooltipSectionLabels[0].textContent = 'Facts'
    if (tooltipSectionLabels[1]) tooltipSectionLabels[1].textContent = 'Business Category'

    const nameEl = document.getElementById('tooltip-name')
    const whatEl = document.getElementById('tooltip-what')
    const triviaEl = document.getElementById('tooltip-trivia')
    const cityEl = document.getElementById('tooltip-city')
    const clusterEl = document.getElementById('tooltip-cluster')

    if (nameEl) nameEl.textContent = formatBusinessName(point.name)
    if (whatEl) whatEl.textContent = cleanPublicNoteText(point.what || '')

    // W6 UX audit: explain why this node appears near others in the 3D space
    const proximityEl = document.getElementById('tooltip-proximity')
    if (proximityEl) {
        const clusterName = describeCluster(point.cluster ?? 0)
        proximityEl.textContent = `Grouped with other ${clusterName.toLowerCase()} businesses by what they do, not just where they are.`
    }

    if (triviaEl) {
        triviaEl.textContent =
            sanitizePublicFacingNote(point.trivia || point.public_note || point.public_detail || '') ||
            'A MoCo business in the semantic graph.'
    }

    if (cityEl) cityEl.textContent = point.city || 'MoCo, TX'
    if (clusterEl) clusterEl.textContent = describeCluster(point.cluster ?? 0)

    // Show contact info if available
    const phoneRow = document.getElementById('contact-phone')
    const emailRow = document.getElementById('contact-email')
    const webRow = document.getElementById('contact-web')
    const contactWrap = document.getElementById('tooltip-contact')

    const hasPhone = point.phone && point.phone !== 'unknown'
    const hasEmail = point.email && point.email !== 'unknown'
    const hasWebsite = point.website && point.website !== 'unknown'

    let anyContact = false
    if (phoneRow) {
        phoneRow.hidden = !hasPhone
        if (hasPhone) {
            const link = phoneRow.querySelector('a')
            if (link) link.textContent = point.phone!
            anyContact = true
        }
    }
    if (emailRow) {
        emailRow.hidden = !hasEmail
        if (hasEmail) {
            const link = emailRow.querySelector('a')
            if (link) link.textContent = point.email!
            anyContact = true
        }
    }
    if (webRow) {
        webRow.hidden = !hasWebsite
        if (hasWebsite) {
            const link = webRow.querySelector('a')
            if (link) {
                link.textContent = point.website!.replace(/^https?:\/\//, '').replace(/\/$/, '')
                link.href = point.website!
            }
            anyContact = true
        }
    }

    if (contactWrap) {
        contactWrap.style.display = anyContact ? 'block' : 'none'
    }
}

export function positionTooltip(x: number, y: number): void {
    const tooltip = document.getElementById('hover-tooltip')
    if (!tooltip) return

    if (tooltipHideTimer) {
        clearTimeout(tooltipHideTimer)
        tooltipHideTimer = null
    }
    if (tooltipRevealFrame) {
        cancelAnimationFrame(tooltipRevealFrame)
        tooltipRevealFrame = null
    }

    const padding = 18
    const width = tooltip.offsetWidth || 280
    const height = tooltip.offsetHeight || 170

    let left = x + 18
    let top = y + 18

    const viewport = getViewportSize()

    if (left + width + padding > viewport.width) {
        left = Math.max(padding, x - width - 18)
    }
    if (top + height + padding > viewport.height) {
        top = Math.max(padding, y - height - 18)
    }

    tooltip.style.left = `${left}px`
    tooltip.style.top = `${top}px`

    tooltip.setAttribute('aria-hidden', 'false')

    if (!tooltip.classList.contains('visible')) {
        // eslint-disable-next-line no-restricted-syntax -- animation loop helper (intentional RAF call)
        const frameId = requestAnimationFrame(() => {
            tooltipRevealFrame = null
            tooltip.classList.add('visible')
        })
        tooltipRevealFrame = frameId
        // Register for cleanup so engine destroy cancels pending RAF.
        ensureRegistry().raf(frameId)
    }
}

export function hideTooltip(): void {
    const tooltip = document.getElementById('hover-tooltip')
    if (!tooltip) return

    if (tooltipRevealFrame) {
        cancelAnimationFrame(tooltipRevealFrame)
        tooltipRevealFrame = null
    }

    tooltip.classList.remove('visible')
    tooltip.setAttribute('aria-hidden', 'true')

    if (tooltipHideTimer) clearTimeout(tooltipHideTimer)
    // eslint-disable-next-line no-restricted-syntax -- one-shot timer scoped to local promise / effect cleanup
    const timerId = setTimeout(() => {
        tooltipHideTimer = null
    }, 200)
    tooltipHideTimer = timerId
    // Register for cleanup so engine destroy cancels pending timer.
    ensureRegistry().timer(timerId as unknown as ReturnType<typeof setTimeout>)
}

/**
 * Registers all tooltip event-bus subscriptions.
 * Must be called once during app init (after DOM is ready).
 *
 * Called from src/lib/engine/adapters/lifecycle-bridge.ts init() step 9b
 * (Svelte-track owner). The previous app.js / lifecycle.js caller is
 * off-limits; the engine bridge lifecycle now drives this initialization.
 *
 * W49c: subscriptions register with the module-owned DisposableRegistry
 * instead of the previous parallel `_tooltipUnsubs` array.
 */
export function initTooltipEventBusSubscriptions(): void {
    const reg = ensureRegistry()
    reg.add(
        subscribeKeyed('tooltip:hide-requested', EVENTS.TOOLTIP_HIDE_REQUESTED, hideTooltip)
    )
    reg.add(
        subscribeKeyed('tooltip:position-requested', EVENTS.TOOLTIP_POSITION_REQUESTED, ({ x, y }) =>
            positionTooltip(x as number, y as number)
        )
    )
    reg.add(
        subscribeKeyed(
            'tooltip:content-update-requested',
            EVENTS.TOOLTIP_CONTENT_UPDATE_REQUESTED,
            ({ point }) => updateTooltipContent(point as Point)
        )
    )
    reg.add(subscribeKeyed('tooltip:camera-moved', EVENTS.CAMERA_MOVED, hideTooltip))
}

/**
 * Tear down all tooltip resources — event-bus subscriptions, RAF, and
 * setTimeout — in reverse registration order. Idempotent: safe to call
 * multiple times; subsequent calls are no-ops until the next init.
 *
 * W49c: previously only cleared `_tooltipUnsubs`, leaving RAF and
 * setTimeout orphaned. Now delegates to the registry which owns all
 * three resource classes.
 */
export function disposeTooltipEventBusSubscriptions(): void {
    if (!_registry) return
    _registry.disposeAll()
    _registry = null
}
