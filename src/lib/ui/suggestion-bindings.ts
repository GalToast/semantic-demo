/**
 * suggestion-bindings.ts
 * Random/similar/neighbor suggestion controls.
 */

import { appState as _state } from '@lib/state/app.svelte'
import type { Point } from '@lib/state/state-types'
import { DisposableRegistry } from '@lib/utils/disposable-registry'
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

// ── Memoized O(8406) caches ────────────────────────────────────────────────

/** Cached eligible-points list (status !== 'disqualified'), invalidated on dataset change. */
let _cachedEligiblePoints: Point[] | null = null
let _cachedPointsLength = 0
let _cachedEligibleLength = 0

function _invalidatePointCaches(): void {
    _cachedEligiblePoints = null
    _cachedEligibleLength = 0
}

/** Get the cached eligible-points list, recomputing only when the dataset length changes. */
function _getEligiblePoints(): Point[] {
    const pts = state.points
    const len = pts?.length ?? 0
    if (_cachedEligiblePoints !== null && _cachedPointsLength === len) {
        return _cachedEligiblePoints
    }
    const eligible = (pts as Point[]).filter((p) => p && p.status !== 'disqualified')
    _cachedEligiblePoints = eligible
    _cachedPointsLength = len
    _cachedEligibleLength = eligible.length
    return eligible
}

/** Memoized cluster-index map: for each cluster, list of point indices (excluding the focused index). */
let _cachedClusterIndex: number | null = null
let _cachedSameCluster: { p: Point; i: number }[] | null = null

function _getSameCluster(focusedIdx: number): { p: Point; i: number }[] {
    const cluster = state.points[focusedIdx]?.cluster
    if (Number.isFinite(cluster)) {
        if (_cachedClusterIndex === focusedIdx && _cachedSameCluster !== null) {
            return _cachedSameCluster
        }
        const same = state.points
            .map((p, i) => ({ p, i }))
            .filter(({ p, i }: { p: Point; i: number }) => p && p.cluster === cluster && i !== focusedIdx)
        _cachedClusterIndex = focusedIdx
        _cachedSameCluster = same
        return same
    }
    return []
}

/** Memoized nearest-neighbor index per focused point index. */
let _cachedNearestIdx: number | null = null
let _cachedNearestFocusedIdx: number | null = null

/**
 * Invalidate all point-based caches. Called when dataset may have changed.
 * Exported so journey code can call it after a dataset swap.
 */
export function invalidatePointCaches(): void {
    _invalidatePointCaches()
    _cachedClusterIndex = null
    _cachedSameCluster = null
    _cachedNearestIdx = null
    _cachedNearestFocusedIdx = null
}

const _registry = new DisposableRegistry({ label: 'suggestion' })

export function disposeSuggestionBindings(): void {
    _registry.disposeAll()
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

        // eslint-disable-next-line no-restricted-syntax -- one-shot timer scoped to local promise / effect cleanup
        _registry.timer(setTimeout(() => {
            const eligible = _getEligiblePoints()
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

            const rand = eligible[Math.floor(_nextSeededRandom() * _cachedEligibleLength)]
            const idx = state.points.indexOf(rand as Point)

            if (idx >= 0) {
                const searchInput = document.getElementById('search-input') as HTMLInputElement | null
                if (searchInput) searchInput.value = ''
                clearShortSemanticSearchState(null, null)

                focusOnNode(idx, { fromCanvasNode: true })
            }
        }))
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
                    // eslint-disable-next-line no-restricted-syntax -- one-shot timer scoped to local promise / effect cleanup
                    _registry.timer(setTimeout(() => btn.classList.remove('shake'), 400))
                }
                return
            }
            const sameCluster = _getSameCluster(focusedIdx)
            if (sameCluster.length) {
                const _randPick = sameCluster[Math.floor(_nextSeededRandom() * sameCluster.length)] as
                    | { p: Point; i: number }
                    | undefined
                const i = _randPick ? _randPick.i : -1
                focusOnNode(i, { fromCanvasNode: true })
            }
        } else if (action === 'neighbor') {
            if (focusedIdx === null) {
                const textEl = document.getElementById('summary-text')
                if (textEl) textEl.textContent = 'Select a business first to find its nearest linked business.'
                if (btn) {
                    btn.classList.add('shake')
                    btn.title = 'Select a business first'
                    // eslint-disable-next-line no-restricted-syntax -- one-shot timer scoped to local promise / effect cleanup
                    _registry.timer(setTimeout(() => btn.classList.remove('shake'), 400))
                }
                return
            }
            if (!state.points) return
            const fp = state.points[focusedIdx]
            if (fp) {
                let nearest: number | null = _cachedNearestIdx
                if (_cachedNearestFocusedIdx !== focusedIdx || nearest === null) {
                    nearest = null
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
                    _cachedNearestIdx = nearest
                    _cachedNearestFocusedIdx = focusedIdx
                }
                if (nearest !== null) focusOnNode(nearest, { fromCanvasNode: true })
            }
        } else if (action === 'report') {
            if (typeof showSemanticThreadsDetail === 'function') showSemanticThreadsDetail()
        }
    })
}
