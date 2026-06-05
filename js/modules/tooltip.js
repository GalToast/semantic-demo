import { formatBusinessName, cleanPublicNoteText, sanitizePublicFacingNote } from './utils/dom-formatters.js';
import { describeCluster } from './utils/ui-presentation.js';
import { getViewportSize } from './environment.js';
import { subscribeKeyed, EVENTS } from './event-bus.js';

let tooltipRevealFrame = null;
let tooltipHideTimer = null;

export function updateTooltipContent(point) {
    const tooltip = document.getElementById('hover-tooltip');
    if (tooltip) tooltip.classList.remove('ambiguous');

    // hideAmbiguousHoverIndicator(); // If we decide to use it

    const tooltipSectionLabels = document.querySelectorAll('#hover-tooltip .tooltip-section-label');
    if (tooltipSectionLabels[0]) tooltipSectionLabels[0].textContent = 'Facts';
    if (tooltipSectionLabels[1]) tooltipSectionLabels[1].textContent = 'Business Category';

    const nameEl = document.getElementById('tooltip-name');
    const whatEl = document.getElementById('tooltip-what');
    const triviaEl = document.getElementById('tooltip-trivia');
    const cityEl = document.getElementById('tooltip-city');
    const clusterEl = document.getElementById('tooltip-cluster');

    if (nameEl) nameEl.textContent = formatBusinessName(point.name);
    if (whatEl) whatEl.textContent = cleanPublicNoteText(point.what || '');

    // Use the central sanitizer for the trivia/note
    if (triviaEl) {
        triviaEl.textContent = sanitizePublicFacingNote(point.trivia || point.public_note || point.public_detail || '', point)
            || 'A MoCo business in the semantic graph.';
    }

    if (cityEl) cityEl.textContent = point.city || 'MoCo, TX';
    if (clusterEl) clusterEl.textContent = describeCluster(point.cluster);

    // Show contact info if available
    const phoneRow = document.getElementById('contact-phone');
    const emailRow = document.getElementById('contact-email');
    const webRow = document.getElementById('contact-web');
    const contactWrap = document.getElementById('tooltip-contact');

    const hasPhone = point.phone && point.phone !== 'unknown';
    const hasEmail = point.email && point.email !== 'unknown';
    const hasWebsite = point.website && point.website !== 'unknown';

    let anyContact = false;
    if (phoneRow) {
        phoneRow.hidden = !hasPhone;
        if (hasPhone) {
            const link = phoneRow.querySelector('a');
            if (link) link.textContent = point.phone;
            anyContact = true;
        }
    }
    if (emailRow) {
        emailRow.hidden = !hasEmail;
        if (hasEmail) {
            const link = emailRow.querySelector('a');
            if (link) link.textContent = point.email;
            anyContact = true;
        }
    }
    if (webRow) {
        webRow.hidden = !hasWebsite;
        if (hasWebsite) {
            const link = webRow.querySelector('a');
            if (link) {
                link.textContent = point.website.replace(/^https?:\/\//, '').replace(/\/$/, '');
                link.href = point.website;
            }
            anyContact = true;
        }
    }

    if (contactWrap) {
        contactWrap.style.display = anyContact ? 'block' : 'none';
    }
}

export function positionTooltip(x, y) {
    const tooltip = document.getElementById('hover-tooltip');
    if (!tooltip) return;

    if (tooltipHideTimer) {
        clearTimeout(tooltipHideTimer);
        tooltipHideTimer = null;
    }
    if (tooltipRevealFrame) {
        cancelAnimationFrame(tooltipRevealFrame);
        tooltipRevealFrame = null;
    }

    const padding = 18;
    const width = tooltip.offsetWidth || 280;
    const height = tooltip.offsetHeight || 170;

    let left = x + 18;
    let top = y + 18;

    const viewport = getViewportSize();

    if (left + width + padding > viewport.width) {
        left = Math.max(padding, x - width - 18);
    }
    if (top + height + padding > viewport.height) {
        top = Math.max(padding, y - height - 18);
    }

    // Position: only left/top are set inline because the base .hover-tooltip
    // CSS does not declare them. Animation (opacity/transform/visibility)
    // stays CSS-owned via the .visible class so the reduced-motion override
    // at tooltips.css:48 remains authoritative. Writing opacity/transform/
    // visibility here used to break that override.
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;

    tooltip.setAttribute('aria-hidden', 'false');

    if (!tooltip.classList.contains('visible')) {
        tooltipRevealFrame = requestAnimationFrame(() => {
            tooltipRevealFrame = null;
            tooltip.classList.add('visible');
        });
    }
}

export function hideTooltip() {
    const tooltip = document.getElementById('hover-tooltip');
    if (!tooltip) return;

    if (tooltipRevealFrame) {
        cancelAnimationFrame(tooltipRevealFrame);
        tooltipRevealFrame = null;
    }

    tooltip.classList.remove('visible');
    tooltip.setAttribute('aria-hidden', 'true');

    // Opacity, transform, and visibility are CSS-owned; removing .visible
    // drives the fade out via the existing transition. The setTimeout is
    // retained only to clear the previous handle — it is no longer doing
    // any inline style writes.
    if (tooltipHideTimer) clearTimeout(tooltipHideTimer);
    tooltipHideTimer = setTimeout(() => {
        tooltipHideTimer = null;
    }, 200);
}

// ── Event Bus Subscriptions ───────────────────────────────────────────────────

/**
 * Registers all tooltip event-bus subscriptions.
 * Must be called once during app init (after DOM is ready).
 *
 * TODO: Call from app.js initEventBusSubscriptions() or lifecycle.js init.
 * Currently the caller is off-limits; add this call when those files are open:
 *   import { initTooltipEventBusSubscriptions } from './tooltip.js';
 *   initTooltipEventBusSubscriptions();  // inside the caller's init sequence
 */
export function initTooltipEventBusSubscriptions() {
    subscribeKeyed('tooltip:hide-requested', EVENTS.TOOLTIP_HIDE_REQUESTED, hideTooltip);
    subscribeKeyed('tooltip:position-requested', EVENTS.TOOLTIP_POSITION_REQUESTED, ({ x, y }) => positionTooltip(x, y));
    subscribeKeyed('tooltip:content-update-requested', EVENTS.TOOLTIP_CONTENT_UPDATE_REQUESTED, ({ point }) => updateTooltipContent(point));
    subscribeKeyed('tooltip:camera-moved', EVENTS.CAMERA_MOVED, hideTooltip);
}

// Window exports retired 2026-05-28; all consumers migrated to direct imports:
// updateTooltipContent, positionTooltip, hideTooltip -> event-bus requests
// hideTooltip -> map-state.js, keyboard-help.js
