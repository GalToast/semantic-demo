import { appState } from '@lib/state/app.svelte.ts'

export function zoomMap(multiplier: number): void {
    if (!appState.map) return
    if (multiplier < 1) {
        ;(appState.map as { zoomIn(): void }).zoomIn()
    } else {
        ;(appState.map as { zoomOut(): void }).zoomOut()
    }
}
