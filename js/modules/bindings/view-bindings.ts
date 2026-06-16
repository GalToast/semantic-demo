/**
 * view-bindings.ts
 * Typechecked sibling for view-bindings.js
 * Core click helper, zoom, and view controls.
 */

import { state as _state } from '@lib/engine/state-bridge'
const state = _state as any
import { switchView } from '../view-controller.ts'
import { toggleAutoRotate } from '../camera-controls.ts'
import { debugWarn } from '@lib/utils/diagnostic-adapter'
import { resetExperienceState, copyCurrentViewLink } from '../lifecycle.ts'
import { showExperienceToast } from '@lib/ui/ui-feedback'
import { zoomMap } from '../map-state.ts'

interface BindClickOptions {
    optional?: boolean
}

type EventHandler = (event?: MouseEvent) => void

declare global {
    interface Window {
        __semanticDemoProd?: boolean
    }
}

function isStrictBindMode(): boolean {
    return typeof window !== 'undefined' && !window.__semanticDemoProd
}

export function bindClick(id: string, handler: EventHandler, options: BindClickOptions = {}): void {
    const element = document.getElementById(id)
    if (!element) {
        if (options.optional) return
        const message = `[event-bindings] required button #${id} not found in DOM`
        if (isStrictBindMode()) {
            throw new Error(message)
        }
        debugWarn(message)
        return
    }
    element.onclick = handler
}

export function zoomCamera(multiplier: number): void {
    if (state.currentView === 'map' && typeof zoomMap === 'function') {
        zoomMap(multiplier)
        return
    }
    if (!state.camera || !state.controls) return
    const target = state.controls.target
    const direction = state.camera.position.clone().sub(target).normalize()
    const currentDistance = state.camera.position.distanceTo(target)
    const newDistance = currentDistance * multiplier
    const minDist = state.controls.minDistance || state.ORBIT_MIN_DISTANCE_DEFAULT
    const maxDist = state.controls.maxDistance || state.ORBIT_MAX_DISTANCE_DEFAULT
    const clampedDistance = Math.max(minDist, Math.min(maxDist, newDistance))
    state.camera.position.copy(target.clone().add(direction.multiplyScalar(clampedDistance)))
}

export function bindViewControls(): void {
    bindClick('btn-galaxy', () => switchView('galaxy'))
    bindClick('btn-map', () => switchView('map'))
    bindClick('btn-zoom-in', () => zoomCamera(0.84))
    bindClick('btn-zoom-out', () => zoomCamera(1.18))
    bindClick('btn-reset', () => resetExperienceState())
    bindClick('btn-rotate', () => toggleAutoRotate())
    bindClick(
        'btn-share-view',
        () => {
            const btn = document.getElementById('btn-share-view')
            if (!btn) return
            const originalChildren = Array.from(btn.childNodes)
            const originalLabel = btn.getAttribute('aria-label') || 'Copy current view link'
            if (typeof copyCurrentViewLink === 'function') {
                copyCurrentViewLink()
                    .then(() => {
                        btn.textContent = ''
                        const copiedSpan = document.createElement('span')
                        copiedSpan.className = 'share-toggle-label'
                        copiedSpan.setAttribute('aria-hidden', 'true')
                        copiedSpan.textContent = 'Copied'
                        btn.appendChild(copiedSpan)
                        btn.setAttribute('aria-label', 'Link copied to clipboard')
                        setTimeout(() => {
                            btn.textContent = ''
                            for (const child of originalChildren) {
                                btn.appendChild(child)
                            }
                            btn.setAttribute('aria-label', originalLabel)
                        }, 2000)
                    })
                    .catch(() => {
                        showExperienceToast('Copy unavailable', 'Use the address bar to copy this current view.')
                    })
            }
        },
        { optional: true }
    )
}
