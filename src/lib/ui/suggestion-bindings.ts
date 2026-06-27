/**
 * suggestion-bindings.ts
 * Random/similar/neighbor suggestion controls.
 */

import { appState as _state } from '@lib/state/app.svelte'
import type { Point } from '@lib/state/state-types'
const state = _state
import { bindClick } from '@lib/ui/view-bindings'
import { focusOnNode } from '@lib/engine/camera-choreography'
import { clearShortSemanticSearchState } from '@lib/search/state'
import { showSemanticThreadsDetail } from '@lib/journey/connection-analysis'
import { seededUnit } from '@lib/utils/seeded-random'

/**
 * Monotonic counter that feeds seededUnit() to give suggestion picks a
 * deterministic uniform distribution in [0, 1). Replaces the previous
 * Math.random() calls so suggestion ordering is reproducible across runs
 * and predictable in tests.
 */
let _suggestionPickSeed = 0
const _nextSeededRandom = (): number => seededUnit(_suggestionPickSeed++, 0)

let _suggestionTimer: ReturnType<typeof setTimeout> | null = null

export function disposeSuggestionBindings(): void {
    if (_suggestionTimer !== null) {
        clearTimeout(_suggestionTimer)
        _suggestionTimer = null
    }
}

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

        if (_suggestionTimer !== null) clearTimeout(_suggestionTimer)
        _suggestionTimer = setTimeout(() => {
            _suggestionTimer = null
            const eligible = state.points.filter((p) => p && p.status !== 'disqualified')
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

            const rand = eligible[Math.floor(_nextSeededRandom() * eligible.length)]
            const idx = state.points.indexOf(rand as Point)

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
                    .map((p, i) => ({ p, i }))
                    .filter(({ p, i }: { p: Point; i: number }) => p && p.cluster === cluster && i !== focusedIdx)
                if (sameCluster.length) {
                    const _randPick = sameCluster[Math.floor(_nextSeededRandom() * sameCluster.length)] as
                        | { p: Point; i: number }
                        | undefined
                    const i = _randPick ? _randPick.i : -1
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
                state.points.forEach((p, i) => {
                    if (!p || i === focusedIdx) return
                    const dx = (Number(p.x) || 0) - (Number(fp.x) || 0)
                    const dy = (Number(p.y) || 0) - (Number(fp.y) || 0)
                    const dz = (Number(p.z) || 0) - (Number(fp.z) || 0)
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
