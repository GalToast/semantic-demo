import { bindClick } from './view-bindings.js';
import { isCompactFocusStageViewport } from '../utils/ui-presentation.js';
import { closeLegendPanel } from '../legend-ui.js';
import { cancelMicroDemo } from '../micro-demo.js';

let _previouslyFocusedInfoPanel = null;

export function revealSelectedBusinessCard() {
    setInfoPanelOpen(true);
}

export function setInfoPanelOpen(open, options = {}) {
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
    document.body.dataset.focusPanelMode = shouldBeOpen ? 'manual-panel' : 'manual-collapsed';

    if (panelBtn) {
        panelBtn.classList.toggle('is-collapsed', !shouldBeOpen);
        panelBtn.setAttribute('aria-expanded', String(shouldBeOpen));
    }

    const infoToggleIcon = document.getElementById('info-toggle-icon');
    if (infoToggleIcon) infoToggleIcon.classList.toggle('is-collapsed', !shouldBeOpen);
    if (infoPanelToggle) infoPanelToggle.setAttribute('aria-expanded', String(shouldBeOpen));

    if (!shouldBeOpen && restoreFocus) {
        const prevFocus = _previouslyFocusedInfoPanel || infoPanelToggle || panelBtn;
        if (prevFocus && typeof prevFocus.focus === 'function') {
            prevFocus.focus({ preventScroll: true });
        }
        _previouslyFocusedInfoPanel = null;
    } else if (!shouldBeOpen) {
        _previouslyFocusedInfoPanel = null;
    }

    return shouldBeOpen;
}

let _activeResizeHandler = null;

export function bindPanelControls(onWindowResize) {
    if (_activeResizeHandler) {
        window.removeEventListener('resize', _activeResizeHandler);
    }
    _activeResizeHandler = onWindowResize;
    window.addEventListener('resize', onWindowResize);

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
