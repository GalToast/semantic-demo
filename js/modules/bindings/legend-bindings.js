import { state } from '../../state.js';
import { isCompactFocusStageViewport } from '../utils/ui-presentation.js';
import { closeLegendPanel, openLegendPanel, restoreLegendCollapsedPanel, setPreviouslyFocusedLegend, getPreviouslyFocusedLegend, closeLegendGuide } from '../legend-ui.js';

export function bindLegendControls() {
    const infoPanel = document.querySelector('.info-panel');
    const panelBtn = document.getElementById('btn-panel');
    const legendPanel = document.getElementById('legend-panel');
    const legendToggle = document.getElementById('btn-legend');

    if (legendToggle && legendPanel) {
        legendToggle.onclick = () => {
            const isOpening = !legendPanel.classList.contains('active');
            if (isOpening) {
                setPreviouslyFocusedLegend(document.activeElement || legendToggle);
                openLegendPanel();
                if (isCompactFocusStageViewport()) {
                    if (infoPanel?.classList.contains('active')) {
                        infoPanel.classList.remove('active');
                        document.body.dataset.focusPanelMode = 'legend-open';
                        if (panelBtn) panelBtn.setAttribute('aria-expanded', 'false');
                        const infoToggle = document.getElementById('info-panel-toggle');
                        if (infoToggle) infoToggle.setAttribute('aria-expanded', 'false');
                    }
                }
            } else {
                closeLegendPanel();
                restoreLegendCollapsedPanel(infoPanel, panelBtn);
            }
        };
    }

    if (!state.registeredEvents.has('legend-interaction')) {
        state.registeredEvents.add('legend-interaction');
        document.addEventListener('pointerdown', (e) => {
            if (!legendPanel?.classList.contains('active')) return;
            if (legendPanel.contains(e.target) || legendToggle?.contains(e.target)) return;
            const prevFocus = (getPreviouslyFocusedLegend() || legendToggle);
            closeLegendPanel();
            restoreLegendCollapsedPanel(infoPanel, panelBtn);
            if (prevFocus && typeof prevFocus.focus === 'function') {
                prevFocus.focus({ preventScroll: true });
            }
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && legendPanel?.classList.contains('active')) {
                if (typeof closeLegendGuide === 'function') closeLegendGuide({ restoreFocus: true });
            }
        });
    }
}
