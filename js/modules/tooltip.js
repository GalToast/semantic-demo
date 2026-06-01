import { formatBusinessName, cleanPublicNoteText, sanitizePublicFacingNote } from './utils/dom-formatters.js';
import { describeCluster } from './utils/ui-presentation.js';
import { getViewportSize } from './environment.js';
import { subscribe, EVENTS } from './event-bus.js';

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
        phoneRow.style.display = hasPhone ? 'flex' : 'none';
        if (hasPhone) {
            const link = phoneRow.querySelector('a');
            if (link) link.textContent = point.phone;
            anyContact = true;
        }
    }
    if (emailRow) {
        emailRow.style.display = hasEmail ? 'flex' : 'none';
        if (hasEmail) {
            const link = emailRow.querySelector('a');
            if (link) link.textContent = point.email;
            anyContact = true;
        }
    }
    if (webRow) {
        webRow.style.display = hasWebsite ? 'flex' : 'none';
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

    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;

    // 10/10 Polish: Handle aria-hidden and visibility
    tooltip.setAttribute('aria-hidden', 'false');
    tooltip.style.visibility = 'visible';

    if (!tooltip.classList.contains('visible')) {
        tooltipRevealFrame = requestAnimationFrame(() => {
            tooltipRevealFrame = null;
            tooltip.classList.add('visible');
            tooltip.style.opacity = '1';
            tooltip.style.transform = 'translateY(0) scale(1)';
        });
    } else {
        tooltip.style.opacity = '1';
        tooltip.style.transform = 'translateY(0) scale(1)';
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
    tooltip.style.opacity = '0';
    tooltip.style.transform = 'translateY(8px) scale(0.985)';

    if (tooltipHideTimer) clearTimeout(tooltipHideTimer);
    tooltipHideTimer = setTimeout(() => {
        tooltipHideTimer = null;
        if (!tooltip.classList.contains('visible')) {
            tooltip.style.visibility = 'hidden';
        }
    }, 180);
}

// Event Bus Subscriptions
subscribe(EVENTS.TOOLTIP_HIDE_REQUESTED, hideTooltip);
subscribe(EVENTS.CAMERA_MOVED, hideTooltip);

// Window exports retired 2026-05-28; all consumers migrated to direct imports:
// updateTooltipContent, positionTooltip, hideTooltip -> search-ui-adapter.js (search-state.js)
// hideTooltip -> map-state.js, keyboard-help.js
