/**
 * js/modules/keyboard-help.ts
 *
 * Keyboard shortcut handling and hint panel management.
 */

import { getCurrentView, getFocusedNode, getNavState } from '../state/selectors/index.ts';
import { getCurrentSearchSummary, getSearchGlowActive } from '../state/selectors/index.ts';
import { cancelMicroDemo } from './micro-demo.ts';
import { showExperienceToast } from './ui-feedback.ts';
import { closeLegendGuide } from './legend-ui.ts';
import { hideTooltip } from './tooltip.ts';
import { hideSummaryCard } from '../../src/lib/journey/semantic-guide.ts';
import { setInfoPanelOpen } from './bindings/panel-bindings.ts';
import { zoomCamera } from './bindings/view-bindings.ts';
import { recenterFocusedNode } from './bindings/journey-bindings.ts';
import { traverseNeighbor } from './journey.ts';

// Injected reset functions are set via initKeyboardResetOwnership() before first keydown.
let _returnToOverview: () => void = () => {};
let _resetExplorationFocus: () => void = () => {};

export function initKeyboardResetOwnership(
    { returnToOverview, resetExplorationFocus }: { returnToOverview?: () => void; resetExplorationFocus?: () => void } = {}
): void {
    if (typeof returnToOverview === 'function') _returnToOverview = returnToOverview;
    if (typeof resetExplorationFocus === 'function') _resetExplorationFocus = resetExplorationFocus;
}

let _shortcutsPanelArrowToastShown = false;
let _previouslyFocused: HTMLElement | null = null;

export function isKeyboardTextEntryTarget(target: EventTarget | null): target is HTMLElement {
    if (!target || typeof (target as HTMLElement).tagName !== 'string') return false;
    const el = target as HTMLElement;
    const tagName = el.tagName.toLowerCase();
    const type = typeof (el as HTMLInputElement).type === 'string' ? (el as HTMLInputElement).type.toLowerCase() : '';

    if (tagName === 'input' && (type === 'text' || type === 'search' || type === 'email' || type === 'url' || type === 'password')) {
        return true;
    }
    if (tagName === 'textarea') return true;
    if (el.isContentEditable) return true;

    return false;
}

export function isKeyboardControlTarget(target: EventTarget | null): target is HTMLElement {
    if (!target || typeof (target as HTMLElement).tagName !== 'string') return false;
    const tagName = (target as HTMLElement).tagName.toLowerCase();
    if (tagName === 'button' || tagName === 'select' || tagName === 'a') return true;
    return false;
}

export function initKeyboardShortcutsHint(): void {
    if (document.getElementById('keyboard-hint-panel')) return;

    const panel = document.createElement('div');
    panel.id = 'keyboard-hint-panel';
    panel.className = 'keyboard-hint-panel';
    panel.setAttribute('role', 'region');
    panel.setAttribute('aria-label', 'Keyboard shortcuts');
    panel.setAttribute('aria-hidden', 'true');
    panel.innerHTML = `
        <div class="kh-title">Keyboard Shortcuts</div>
        <div class="kh-row"><span class="kh-keys"><kbd>Arrow</kbd></span><span>Navigate nodes</span></div>
        <div class="kh-row"><span class="kh-keys"><kbd>Home</kbd></span><span>Reset view</span></div>
        <div class="kh-row"><span class="kh-keys"><kbd>End</kbd></span><span>Recenter</span></div>
        <div class="kh-row"><span class="kh-keys"><kbd>+ / -</kbd></span><span>Zoom</span></div>
        <div class="kh-row"><span class="kh-keys"><kbd>Esc</kbd></span><span>Close overlays</span></div>
        <button class="kh-close" type="button" aria-label="Dismiss shortcuts panel">&times;</button>
    `;
    document.body.appendChild(panel);

    function closePanel(): void {
        if ((panel as any)._autoDismissTimer) {
            clearTimeout((panel as any)._autoDismissTimer);
            (panel as any)._autoDismissTimer = null;
        }
        panel.classList.remove('visible');
        panel.setAttribute('aria-hidden', 'true');
        const helpButton = document.getElementById('btn-keyboard-help');
        if (helpButton) {
            helpButton.setAttribute('aria-expanded', 'false');
            helpButton.setAttribute('aria-pressed', 'false');
        }
        sessionStorage.setItem('kh_dismissed', '1');
        if (_previouslyFocused) {
            if (typeof (_previouslyFocused as HTMLElement).focus === 'function') (_previouslyFocused as HTMLElement).focus();
            _previouslyFocused = null;
        }
        document.removeEventListener('keydown', _onPanelKeydown);
    }

    function _onPanelKeydown(e: KeyboardEvent): void {
        if (e.key === 'Escape') {
            e.stopPropagation();
            closePanel();
            return;
        }
        if (e.key === 'Tab') {
            const focusable = panel.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
            if (focusable.length === 0) return;
            const first = focusable[0] as HTMLElement;
            const last = focusable[focusable.length - 1] as HTMLElement;
            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus();
            }
        }
    }

    panel.querySelector('.kh-close')!.addEventListener('click', closePanel);

    function openPanel(returnFocusEl?: HTMLElement | null): void {
        if ((panel as any)._autoDismissTimer) {
            clearTimeout((panel as any)._autoDismissTimer);
            (panel as any)._autoDismissTimer = null;
        }
        _previouslyFocused = returnFocusEl || document.getElementById('btn-keyboard-help') || document.activeElement as HTMLElement;
        const onboarding = document.getElementById('onboarding-hint');
        onboarding?.classList.remove('visible');
        onboarding?.setAttribute('aria-hidden', 'true');
        panel.classList.add('visible');
        panel.setAttribute('aria-hidden', 'false');
        const helpButton = document.getElementById('btn-keyboard-help');
        if (helpButton) {
            helpButton.setAttribute('aria-expanded', 'true');
            helpButton.setAttribute('aria-pressed', 'true');
        }
        (panel.querySelector('.kh-close') as HTMLElement)?.focus({ preventScroll: true });
        document.removeEventListener('keydown', _onPanelKeydown);
        document.addEventListener('keydown', _onPanelKeydown);
    }

    (panel as any)._openKeyboardHintPanel = openPanel;
    (panel as any)._closeKeyboardHintPanel = closePanel;

    const helpBtn = document.getElementById('btn-keyboard-help');
    if (helpBtn) {
        helpBtn.setAttribute('aria-controls', 'keyboard-hint-panel');
        helpBtn.setAttribute('aria-expanded', 'false');
        helpBtn.setAttribute('aria-pressed', 'false');

        helpBtn.onclick = null;

        helpBtn.addEventListener('click', () => {
            if (panel.classList.contains('visible')) {
                closePanel();
            } else {
                openPanel(document.activeElement as HTMLElement || helpBtn);
            }
        }, { capture: true });
    }
}

export function showKeyboardShortcutsHint(): void {
    const panel = document.getElementById('keyboard-hint-panel');
    if (!panel) return;
    if (typeof (panel as any)._openKeyboardHintPanel === 'function') {
        (panel as any)._openKeyboardHintPanel(document.getElementById('btn-keyboard-help'));
    } else {
        const onboarding = document.getElementById('onboarding-hint');
        onboarding?.classList.remove('visible');
        onboarding?.setAttribute('aria-hidden', 'true');
        panel.classList.add('visible');
        panel.setAttribute('aria-hidden', 'false');
        (panel.querySelector('.kh-close') as HTMLElement)?.focus({ preventScroll: true });
    }
    if ((panel as any)._autoDismissTimer) clearTimeout((panel as any)._autoDismissTimer);
    (panel as any)._autoDismissTimer = setTimeout(() => {
        if (typeof (panel as any)._closeKeyboardHintPanel === 'function') {
            (panel as any)._closeKeyboardHintPanel();
        } else {
            panel.classList.remove('visible');
            panel.setAttribute('aria-hidden', 'true');
        }
        (panel as any)._autoDismissTimer = null;
    }, 5000);
}

export function flashArrowKeyToast(): void {
    if (_shortcutsPanelArrowToastShown) return;
    _shortcutsPanelArrowToastShown = true;
    showExperienceToast('Arrow keys to navigate — press ? for shortcuts', 'Press arrow keys to navigate between nodes.');
}

export function handleGalaxyKeydown(event: KeyboardEvent): void {
    if (!event?.target) return;
    if (isKeyboardTextEntryTarget(event.target)) return;
    const isControlTarget = isKeyboardControlTarget(event.target);

    if (event.key === 'Escape') {
        if (document.body.dataset.demoActive === 'true') {
            cancelMicroDemo('escape-key');
            return;
        }
        closeLegendGuide({ restoreFocus: true });
        hideTooltip();
        hideSummaryCard();
        setInfoPanelOpen(false);
        const searchInput = document.getElementById('search-input') as HTMLInputElement | null;
        const hasSearchText = Boolean(searchInput?.value?.trim());
        const hasSearchState = Boolean(getCurrentSearchSummary() || getSearchGlowActive());
        const hasFocusState = getFocusedNode() !== null || getNavState()?.focusedIndex !== null;
        if (hasSearchText || hasSearchState || hasFocusState) {
            event.preventDefault();
            _returnToOverview();
            document.getElementById('search-input')?.focus({ preventScroll: true });
        }
        return;
    }

    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
        if (isControlTarget && event.key === 'ArrowUp') return;
        event.preventDefault();
        flashArrowKeyToast();
        traverseNeighbor(-1);
    } else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
        if (isControlTarget && event.key === 'ArrowDown') return;
        event.preventDefault();
        flashArrowKeyToast();
        traverseNeighbor(1);
    } else if (event.key === 'Home') {
        if (getCurrentView() === 'galaxy') {
            event.preventDefault();
            _resetExplorationFocus();
        }
    } else if (event.key === 'End' || (event.key === 'c' && !event.ctrlKey && !event.metaKey)) {
        if (getCurrentView() === 'galaxy') {
            event.preventDefault();
            recenterFocusedNode();
        }
    }

    if (event.key === '=' || event.key === '+') {
        zoomCamera(0.84);
    } else if (event.key === '-' || event.key === '_') {
        zoomCamera(1.18);
    } else if (event.key === '?' || event.key === '/') {
        event.preventDefault();
        if (typeof showKeyboardShortcutsHint === 'function') {
            showKeyboardShortcutsHint();
        }
    }
}
