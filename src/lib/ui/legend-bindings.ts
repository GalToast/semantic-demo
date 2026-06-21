import { appState as _state } from '@lib/state/app.svelte'
const state = _state as any
import { isCompactFocusStageViewport } from '@lib/utils/ui-presentation'
import {
    closeLegendPanel,
    openLegendPanel,
    restoreLegendCollapsedPanel,
    setPreviouslyFocusedLegend,
    getPreviouslyFocusedLegend,
    closeLegendGuide
} from '@lib/stores/legend-panel'
import { setFocusPanelMode, FOCUS_PANEL_MODE } from '@lib/utils/focus-panel-mode'

let _legendAbortController: AbortController | null = null

export function disposeLegendBindings(): void {
    _legendAbortController?.abort()
    _legendAbortController = null
    state.registeredEvents.clear()
}

export function bindLegendControls(): void {
    const infoPanel = document.querySelector('.info-panel') as HTMLElement | null
    const panelBtn = document.getElementById('btn-panel')
    const legendPanel = document.getElementById('legend-panel') as HTMLElement | null
    const legendToggle = document.getElementById('btn-legend') as HTMLElement | null

    if (legendToggle && legendPanel) {
        legendToggle.onclick = () => {
            const isOpening = !legendPanel.classList.contains('active')
            if (isOpening) {
                const activeElement = document.activeElement
                setPreviouslyFocusedLegend(activeElement instanceof HTMLElement ? activeElement : legendToggle)
                openLegendPanel()
                if (isCompactFocusStageViewport() && infoPanel?.classList.contains('active')) {
                    infoPanel.classList.remove('active')
                    setFocusPanelMode(FOCUS_PANEL_MODE.LEGEND_OPEN)
                    if (panelBtn) panelBtn.setAttribute('aria-expanded', 'false')
                    const infoToggle = document.getElementById('info-panel-toggle')
                    if (infoToggle) infoToggle.setAttribute('aria-expanded', 'false')
                }
            } else {
                closeLegendPanel()
                restoreLegendCollapsedPanel(infoPanel, panelBtn)
            }
        }
    }

    if (!state.registeredEvents.has('legend-interaction')) {
        state.registeredEvents.add('legend-interaction')
        _legendAbortController = new AbortController()
        document.addEventListener('pointerdown', (e: PointerEvent) => {
            if (!legendPanel?.classList.contains('active')) return
            if (legendPanel.contains(e.target as Node) || legendToggle?.contains(e.target as Node)) return
            const prevFocus = (getPreviouslyFocusedLegend() || legendToggle) as HTMLElement | null
            closeLegendPanel()
            restoreLegendCollapsedPanel(infoPanel, panelBtn)
            if (prevFocus && typeof prevFocus.focus === 'function') {
                prevFocus.focus({ preventScroll: true })
            }
        }, { signal: _legendAbortController.signal })
        document.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Escape' && legendPanel?.classList.contains('active')) {
                if (typeof closeLegendGuide === 'function') closeLegendGuide({ restoreFocus: true })
            }
        }, { signal: _legendAbortController.signal })
    }
}
