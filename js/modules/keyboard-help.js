import { state } from '../state.js';
import { demoController } from './demo-controller.js';
import { showExperienceToast } from './ui-feedback.js';
import { closeLegendGuide } from './legend-ui.js';
import { hideTooltip } from './tooltip.js';
import { hideSummaryCard } from './semantic-guide.js';
import { setInfoPanelOpen, zoomCamera, recenterFocusedNode } from './event-bindings.js';
import { traverseNeighbor } from './journey.js';

// Injected reset functions are set via initKeyboardResetOwnership() before first keydown.
let _returnToOverview = () => {};
let _resetExplorationFocus = () => {};

export function initKeyboardResetOwnership({ returnToOverview, resetExplorationFocus } = {}) {
    if (typeof returnToOverview === 'function') _returnToOverview = returnToOverview;
    if (typeof resetExplorationFocus === 'function') _resetExplorationFocus = resetExplorationFocus;
}

let _shortcutsPanelArrowToastShown = false;
let _keyboardShortcutKeyListenerBound = false;
let _previouslyFocused = null;

export function isKeyboardTextEntryTarget(target) {
    if (!target || typeof target.tagName !== 'string') return false;
    const tagName = target.tagName.toLowerCase();
    const type = typeof target.type === 'string' ? target.type.toLowerCase() : '';
    
    if (tagName === 'input' && (type === 'text' || type === 'search' || type === 'email' || type === 'url' || type === 'password')) {
        return true;
    }
    if (tagName === 'textarea') return true;
    if (target.isContentEditable) return true;
    
    return false;
}

export function isKeyboardControlTarget(target) {
    if (!target || typeof target.tagName !== 'string') return false;
    const tagName = target.tagName.toLowerCase();
    if (tagName === 'button' || tagName === 'select' || tagName === 'a') return true;
    return false;
}

export function initKeyboardShortcutsHint() {
    // Don't re-create if already in DOM
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

    function closePanel() {
        if (panel._autoDismissTimer) {
            clearTimeout(panel._autoDismissTimer);
            panel._autoDismissTimer = null;
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
            if (typeof _previouslyFocused.focus === 'function') _previouslyFocused.focus();
            _previouslyFocused = null;
        }
        document.removeEventListener('keydown', _onPanelKeydown);
    }

    function _onPanelKeydown(e) {
        if (e.key === 'Escape') {
            e.stopPropagation();
            closePanel();
            return;
        }
        // Simple focus trap: Tab cycles within the panel
        if (e.key === 'Tab') {
            const focusable = panel.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
            if (focusable.length === 0) return;
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus();
            }
        }
    }

    // Wire the close button
    panel.querySelector('.kh-close').addEventListener('click', closePanel);

    function openPanel(returnFocusEl) {
        if (panel._autoDismissTimer) {
            clearTimeout(panel._autoDismissTimer);
            panel._autoDismissTimer = null;
        }
        _previouslyFocused = returnFocusEl || document.getElementById('btn-keyboard-help') || document.activeElement;
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
        panel.querySelector('.kh-close')?.focus({ preventScroll: true });
        document.removeEventListener('keydown', _onPanelKeydown);
        document.addEventListener('keydown', _onPanelKeydown);
    }

    panel._openKeyboardHintPanel = openPanel;
    panel._closeKeyboardHintPanel = closePanel;

    // Wire "?" toolbar button if it exists
    const helpBtn = document.getElementById('btn-keyboard-help');
    if (helpBtn) {
        helpBtn.setAttribute('aria-controls', 'keyboard-hint-panel');
        helpBtn.setAttribute('aria-expanded', 'false');
        helpBtn.setAttribute('aria-pressed', 'false');
        helpBtn.addEventListener('click', () => {
            if (panel.classList.contains('visible')) {
                closePanel();
            } else {
                openPanel(document.activeElement || helpBtn);
            }
        });
    }

    if (!_keyboardShortcutKeyListenerBound) {
        _keyboardShortcutKeyListenerBound = true;
        document.addEventListener('keydown', (event) => {
            const isShortcutKey = event.key === '?' || (event.key === '/' && event.shiftKey);
            if (!isShortcutKey) return;
            if (isKeyboardTextEntryTarget(event.target)) return;
            event.preventDefault();
            event.stopPropagation();
            openPanel(document.getElementById('btn-keyboard-help'));
        });
    }
}

export function showKeyboardShortcutsHint() {
    const panel = document.getElementById('keyboard-hint-panel');
    if (!panel) return;
    if (typeof panel._openKeyboardHintPanel === 'function') {
        panel._openKeyboardHintPanel(document.getElementById('btn-keyboard-help'));
    } else {
        const onboarding = document.getElementById('onboarding-hint');
        onboarding?.classList.remove('visible');
        onboarding?.setAttribute('aria-hidden', 'true');
        panel.classList.add('visible');
        panel.setAttribute('aria-hidden', 'false');
        panel.querySelector('.kh-close')?.focus({ preventScroll: true });
    }
    // Auto-dismiss after 5 seconds. Clear any pending auto-dismiss first to avoid double-firing.
    if (panel._autoDismissTimer) clearTimeout(panel._autoDismissTimer);
    panel._autoDismissTimer = setTimeout(() => {
        if (typeof panel._closeKeyboardHintPanel === 'function') {
            panel._closeKeyboardHintPanel();
        } else {
            panel.classList.remove('visible');
            panel.setAttribute('aria-hidden', 'true');
        }
        panel._autoDismissTimer = null;
    }, 5000);
}

export function flashArrowKeyToast() {
    if (_shortcutsPanelArrowToastShown) return;
    _shortcutsPanelArrowToastShown = true;
    showExperienceToast('Arrow keys to navigate — press ? for shortcuts', { duration: 3500 });
}

export function handleGalaxyKeydown(event) {
    if (!event?.target) return;
    if (isKeyboardTextEntryTarget(event.target)) return;
    const isControlTarget = isKeyboardControlTarget(event.target);

    if (event.key === 'Escape') {
        // 1) If demo is active, ESC cancels the demo
        if (demoController.isRunning()) {
            demoController.cancel();
            return;
        }
        closeLegendGuide({ restoreFocus: true });
        hideTooltip();
        hideSummaryCard();
        setInfoPanelOpen(false);
        const searchInput = document.getElementById('search-input');
        const hasSearchText = Boolean(searchInput?.value?.trim());
        const hasSearchState = Boolean(state.currentSearchSummary || state.searchGlowActive);
        const hasFocusState = state.focusedNode !== null || state.navState?.focusedIndex !== null;
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
        traverseNeighbor(1);
    } else if (event.key === 'Home') {
        if (state.currentView === 'galaxy') {
            event.preventDefault();
            _resetExplorationFocus();
        }
    } else if (event.key === 'End' || (event.key === 'c' && !event.ctrlKey && !event.metaKey)) {
        if (state.currentView === 'galaxy') {
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
