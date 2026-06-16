/**
 * panel-bindings.ts
 * Typechecked sibling for panel-bindings.js
 * Info panel toggle, resize, and state management.
 */

import { bindClick } from './view-bindings.ts';
import { isCompactFocusStageViewport } from '../utils/ui-presentation.ts';
import { closeLegendPanel } from '@lib/stores/legend-panel';
import { cancelMicroDemo } from '@lib/demo/choreography';
import { setFocusPanelMode, FOCUS_PANEL_MODE } from '@lib/utils/focus-panel-mode'

let _previouslyFocusedInfoPanel: Element | null = null;

export function revealSelectedBusinessCard(): void {
    setInfoPanelOpen(true);
}

interface SetInfoPanelOptions {
    restoreFocus?: boolean;
}

export function setInfoPanelOpen(open?: boolean | undefined, options: SetInfoPanelOptions = {}): boolean {
    const panel = document.querySelector('.info-panel');
    if (!panel) return false;
    const isOpen = panel.classList.contains('active');
    const shouldBeOpen = open !== undefined ? open : !isOpen;
    const restoreFocus = options.restoreFocus === true || open === undefined;

    const infoPanelToggle = document.getElementById('info-panel-toggle');
    const panelBtn = document.getElementById('btn-panel');
    if (shouldBeOpen && restoreFocus) {
        _previouslyFocusedInfoPanel = document.activeElement || infoPanelToggle || panelBtn;
    }

    panel.classList.toggle('active', shouldBeOpen);
    panel.setAttribute('aria-hidden', shouldBeOpen ? 'false' : 'true');
    setFocusPanelMode(shouldBeOpen ? FOCUS_PANEL_MODE.MANUAL_PANEL : FOCUS_PANEL_MODE.MANUAL_COLLAPSED);

    if (panelBtn) {
        panelBtn.classList.toggle('is-collapsed', !shouldBeOpen);
        panelBtn.setAttribute('aria-expanded', String(shouldBeOpen));
    }

    const infoToggleIcon = document.getElementById('info-toggle-icon');
    if (infoToggleIcon) infoToggleIcon.classList.toggle('is-collapsed', !shouldBeOpen);
    if (infoPanelToggle) infoPanelToggle.setAttribute('aria-expanded', String(shouldBeOpen));

    if (!shouldBeOpen && restoreFocus) {
        const prevFocus = _previouslyFocusedInfoPanel || infoPanelToggle || panelBtn;
        if (prevFocus && typeof (prevFocus as HTMLElement).focus === 'function') {
            (prevFocus as HTMLElement).focus({ preventScroll: true });
        }
        _previouslyFocusedInfoPanel = null;
    } else if (!shouldBeOpen) {
        _previouslyFocusedInfoPanel = null;
    }

    return shouldBeOpen;
}

let _activeResizeHandler: (() => void) | null = null;
let _resizeRafId: number | null = null;
let _resizeAbortController: AbortController | null = null;

type WindowResizeHandler = () => void;

export function unbindPanelControls(): void {
    if (_resizeAbortController) {
        _resizeAbortController.abort();
        _resizeAbortController = null;
    }
    if (_resizeRafId !== null) {
        cancelAnimationFrame(_resizeRafId);
        _resizeRafId = null;
    }
    _activeResizeHandler = null;
}

export function bindPanelControls(onWindowResize: WindowResizeHandler): void {
    // Tear down any prior binding first so this stays idempotent and leak-free
    unbindPanelControls();

    const controller = new AbortController();
    _resizeAbortController = controller;

    // Debounce the resize handler with requestAnimationFrame to prevent layout thrashing
    _activeResizeHandler = () => {
        if (_resizeRafId) return;
        _resizeRafId = window.requestAnimationFrame(() => {
            _resizeRafId = null;
            onWindowResize();
        });
    };

    window.addEventListener('resize', _activeResizeHandler, { signal: controller.signal });

    bindClick('info-panel-toggle', () => {
        cancelMicroDemo('user-input');
        setInfoPanelOpen();
    });

    bindClick('btn-panel', () => {
        cancelMicroDemo('user-input');
        const panelOpen = setInfoPanelOpen();
        if (isCompactFocusStageViewport() && panelOpen) {
            const legendPanel = document.getElementById('legend-panel');
            if (legendPanel?.classList.contains('active')) {
                closeLegendPanel();
            }
            const infoToggle = document.getElementById('info-panel-toggle');
            if (infoToggle) infoToggle.setAttribute('aria-expanded', 'true');
        }
    });
}
