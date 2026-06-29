/**
 * three-micro-demo-bridge.ts — Micro-demo event bridge for Three.js visuals
 *
 * Extracted from three-interaction-visuals.ts (L862–915, ~54 LOC)
 * as part of the decomposition plan at docs/three-interaction-visuals-decomposition-plan.md
 * (Phase 2 — Micro-demo bridge).
 *
 * Module-local state:
 *   - _demoHighlightNode: currently highlighted node index
 *   - _demoHighlightBoost: highlight intensity multiplier
 *   - _onDemoNodeHighlight: handler ref for 'micro-demo-node-highlight' listener
 *   - _onDemoNamePulse: handler ref for 'micro-demo-name-pulse' listener
 */
import { triggerSearchHeroMoment } from './three-search-animations'
import { appState as _state } from '@lib/state/app.svelte'
const state = _state

let _demoHighlightNode: number | null = null
let _demoHighlightBoost = 1.0

let _onDemoNodeHighlight: ((e: Event) => void) | null = null
let _onDemoNamePulse: (() => void) | null = null

/**
 * Initialize the micro-demo event bridge.
 * Registers document event listeners for micro-demo node highlighting
 * and name pulse animations. Safe to call multiple times (idempotent).
 */
export function initMicroDemoBridge(): void {
    if (typeof document !== 'undefined' && document && document.addEventListener) {
        _onDemoNodeHighlight = (e: Event) => {
            const detail = (e as CustomEvent).detail as { index: number; phase: string }
            const { index, phase } = detail
            if (!state.pointsMaterial?.userData?.shader) return
            const shader = state.pointsMaterial.userData.shader

            if (phase === 'glow' || phase === 'gliding') {
                _demoHighlightNode = index
                _demoHighlightBoost = phase === 'gliding' ? 1.55 : 1.35
                const pos = state.nodePositions[index]
                if (pos) {
                    shader.uniforms.uHoverNodePos.value.set(pos.x, pos.y, pos.z)
                    shader.uniforms.uHoverBoost.value = _demoHighlightBoost
                    shader.uniforms.uHoverRadius.value = 0.12
                }
            } else if (phase === 'arrived') {
                _demoHighlightNode = index
                _demoHighlightBoost = 1.65
                if (typeof triggerSearchHeroMoment === 'function') {
                    triggerSearchHeroMoment(index)
                }
            } else if (phase === 'cleanup' || phase === 'wide_view') {
                _demoHighlightNode = null
                _demoHighlightBoost = 1.0
                shader.uniforms.uHoverBoost.value = 1.0
            }
        }

        _onDemoNamePulse = () => {
            const nameEl = document.querySelector('#info-panel h2') as HTMLElement | null
            if (nameEl) {
                nameEl.style.transition = 'text-shadow 0.4s ease, color 0.4s ease'
                nameEl.style.color = '#fff'
                nameEl.style.textShadow = '0 0 12px rgba(78, 205, 196, 0.8)'
                // eslint-disable-next-line no-restricted-syntax -- one-shot UI animation timer, scoped to local effect
                setTimeout(() => {
                    nameEl.style.color = ''
                    nameEl.style.textShadow = ''
                }, 600)
            }
        }

        document.addEventListener('micro-demo-node-highlight', _onDemoNodeHighlight as EventListener)
        document.addEventListener('micro-demo-name-pulse', _onDemoNamePulse as EventListener)
    }
}

/**
 * Remove micro-demo event listeners to prevent handler leaks.
 * Called during disposal (disposeInteractionVisuals).
 */
export function disposeMicroDemoBridge(): void {
    if (typeof document !== 'undefined' && document && document.removeEventListener) {
        if (_onDemoNodeHighlight) {
            document.removeEventListener('micro-demo-node-highlight', _onDemoNodeHighlight as EventListener)
            _onDemoNodeHighlight = null
        }
        if (_onDemoNamePulse) {
            document.removeEventListener('micro-demo-name-pulse', _onDemoNamePulse as EventListener)
            _onDemoNamePulse = null
        }
    }
}
