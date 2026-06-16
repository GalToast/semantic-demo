/**
 * suggestion-bindings.ts
 * Typechecked sibling for suggestion-bindings.js
 * Random/similar/neighbor suggestion controls.
 */

import { state as _state } from '@lib/engine/state-bridge'
const state = _state as any
import { bindClick } from './view-bindings.ts'
import { focusOnNode } from '@lib/engine/camera-choreography'
import { clearShortSemanticSearchState } from '@lib/engine/search-state-bridge'
import { showSemanticThreadsDetail } from '../connection-analysis.ts'

interface SuggestionEvent extends MouseEvent {
    target: HTMLElement
}

export function bindSuggestionControls(): void {
    const focusRandomBusiness = (): void => {
        if (!state.points || state.points.length === 0) return

        const btn = (document.getElementById('btn-surprise') ||
            document.getElementById('btn-launch')) as HTMLElement | null
        const originalText = btn ? btn.textContent : 'Random Business'

        if (btn) {
            btn.classList.add('is-loading')
            btn.setAttribute('aria-disabled', 'true')
            btn.textContent = 'Finding...'
        }

        setTimeout(() => {
            const eligible = state.points.filter((p: any) => p && p.status !== 'disqualified')
            if (!eligible.length) {
                const summaryEl = document.getElementById('summary-text')
                if (summaryEl) summaryEl.textContent = 'No eligible businesses for surprise selection.'
                if (btn) {
                    btn.classList.add('disabled')
                    btn.setAttribute('aria-disabled', 'true')
                    btn.title = 'No eligible businesses for surprise selection'
                    btn.textContent = originalText
                }
                return
            }

            if (btn) {
                btn.classList.remove('is-loading')
                btn.classList.remove('disabled')
                btn.removeAttribute('aria-disabled')
                btn.removeAttribute('title')
                btn.textContent = originalText
            }

            const rand = eligible[Math.floor(Math.random() * eligible.length)]
            const idx = state.points.indexOf(rand)

            if (idx >= 0) {
                const searchInput = document.getElementById('search-input') as HTMLInputElement | null
                if (searchInput) searchInput.value = ''
                clearShortSemanticSearchState(null, null)

                focusOnNode(idx, { fromCanvasNode: true })
            }
        }, 800)
    }

    bindClick('btn-launch', focusRandomBusiness, { optional: true })
    bindClick('btn-surprise', focusRandomBusiness, { optional: true })

    bindClick('summary-suggestions', (event?: MouseEvent) => {
        const e = event as SuggestionEvent
        const btn = (e.target as HTMLElement)?.closest?.('[data-action]') as HTMLElement | null
        if (!btn) return
        const action = btn.dataset.action
        const focusedIdx = Number.isFinite(state.navState?.focusedIndex)
            ? state.navState.focusedIndex
            : Number.isFinite(state.focusedNode)
              ? state.focusedNode
              : null

        if (action === 'similar') {
            if (focusedIdx === null) {
                const textEl = document.getElementById('summary-text')
                if (textEl) textEl.textContent = 'Select a business first to explore nearby groups.'
                if (btn) {
                    btn.classList.add('shake')
                    btn.title = 'Select a business first'
                    setTimeout(() => btn.classList.remove('shake'), 400)
                }
                return
            }
            const cluster = state.points[focusedIdx]?.cluster
            if (Number.isFinite(cluster)) {
                const sameCluster = state.points
                    .map((p: any, i: number) => ({ p, i }))
                    .filter(({ p, i }: { p: any; i: number }) => p && p.cluster === cluster && i !== focusedIdx)
                if (sameCluster.length) {
                    const { i } = sameCluster[Math.floor(Math.random() * sameCluster.length)]
                    focusOnNode(i, { fromCanvasNode: true })
                }
            }
        } else if (action === 'neighbor') {
            if (focusedIdx === null) {
                const textEl = document.getElementById('summary-text')
                if (textEl) textEl.textContent = 'Select a business first to find its nearest linked business.'
                if (btn) {
                    btn.classList.add('shake')
                    btn.title = 'Select a business first'
                    setTimeout(() => btn.classList.remove('shake'), 400)
                }
                return
            }
            if (!state.points) return
            const fp = state.points[focusedIdx]
            if (fp) {
                let nearest: number | null = null
                let nearestDist = Infinity
                state.points.forEach((p: any, i: number) => {
                    if (!p || i === focusedIdx) return
                    const dx = p.x - fp.x
                    const dy = p.y - fp.y
                    const dz = p.z - fp.z
                    const d = dx * dx + dy * dy + dz * dz
                    if (d < nearestDist) {
                        nearestDist = d
                        nearest = i
                    }
                })
                if (nearest !== null) focusOnNode(nearest, { fromCanvasNode: true })
            }
        } else if (action === 'report') {
            if (typeof showSemanticThreadsDetail === 'function') showSemanticThreadsDetail()
        }
    })
}
