/**
 * src/lib/ui/tooltip.ts
 *
 * Tooltip display, positioning, and event-bus integration.
 * Ported from js/modules/tooltip.ts
 */

import { formatBusinessName, cleanPublicNoteText, sanitizePublicFacingNote } from '@lib/utils/dom-formatters'
import { describeCluster } from '@lib/utils/ui-presentation'
import { getViewportSize } from '@lib/utils/environment'
import { subscribeKeyed, EVENTS } from '@lib/orchestration/event-bus'
import type { Point } from '@lib/state/state-types'

let tooltipRevealFrame: number | null = null
let tooltipHideTimer: ReturnType<typeof setTimeout> | null = null

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
        tooltipRevealFrame = requestAnimationFrame(() => {
            tooltipRevealFrame = null
            tooltip.classList.add('visible')
        })
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
    tooltipHideTimer = setTimeout(() => {
        tooltipHideTimer = null
    }, 200)
}

/**
 * Registers all tooltip event-bus subscriptions.
 * Must be called once during app init (after DOM is ready).
 *
 * Called from src/lib/engine/adapters/lifecycle-bridge.ts init() step 9b
 * (Svelte-track owner). The previous app.js / lifecycle.js caller is
 * off-limits; the engine bridge lifecycle now drives this initialization.
 */
export function initTooltipEventBusSubscriptions(): void {
    subscribeKeyed('tooltip:hide-requested', EVENTS.TOOLTIP_HIDE_REQUESTED, hideTooltip)
    subscribeKeyed('tooltip:position-requested', EVENTS.TOOLTIP_POSITION_REQUESTED, ({ x, y }) =>
        positionTooltip(x as number, y as number)
    )
    subscribeKeyed('tooltip:content-update-requested', EVENTS.TOOLTIP_CONTENT_UPDATE_REQUESTED, ({ point }) =>
        updateTooltipContent(point as Point)
    )
    subscribeKeyed('tooltip:camera-moved', EVENTS.CAMERA_MOVED, hideTooltip)
}
