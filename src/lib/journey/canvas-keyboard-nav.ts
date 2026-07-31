/**
 * @lib/journey/canvas-keyboard-nav.ts — Canvas aria-keyshortcuts handler
 *
 * Wires up the 6 aria-keyshortcuts the Canvas advertises:
 *   - ArrowLeft / ArrowRight  → previous / next thread neighbor
 *   - ArrowUp / ArrowDown     → previous / next cluster sibling
 *   - Home                    → current walk trail's seed index
 *   - End                     → current walk trail's last-stop index
 *   - Plus / Equal            → zoom in (toward orbit target)
 *   - Minus                   → zoom out (from orbit target)
 *
 * `Canvas.svelte` binds `handleCanvasKeydown` to the canvas's keydown event
 * in `onMount` (matching the `selected-card.ts:240-256` idempotent-listener
 * pattern). The handler MUST `preventDefault()` + `stopImmediatePropagation()`
 * to override Three.js `OrbitControls`, which is bound to the same canvas
 * DOM element and defaults to swallowing arrow keys for camera rotation.
 *
 * # Debounce policy (250ms for focus-changing actions)
 *
 * Thread-walk and cluster-sibling lookups are non-trivial work (semantic
 * neighbor resolution, `EVENTS.CAMERA_NODE_FOCUSED` re-fires, preview
 * re-renders). Raw OS auto-repeat (~30/sec) would thrash the AT screen
 * reader's announcement rate and stack camera animations. 250ms is:
 *   - LONGER than OS auto-repeat interval (~33ms) → suppresses hold-to-spam
 *   - LONGER than `walkThreadNeighbor` work (~5-20ms) → no animation queue
 *   - SHORTER than human double-tap (~100-200ms) → intentional taps pass
 *
 * Zoom (Plus/Minus/Equal) is NOT debounced — that's the conventional
 * "hold to continuously zoom" gesture and `zoomCamera()` is light work.
 *
 * # Cluster siblings ordering
 *
 * Same-cluster points sorted by signal score DESCENDING (the
 * highest-signal sibling is at the top, walking Down advances to less-
 * signaled siblings, walking Up returns to more-signaled). Ties broken
 * by index ascending for determinism.
 *
 * Boundary: at the cluster edge, no-wrap. A toast `'End of cluster'` is
 * shown — same UX pattern as the existing `traverseNeighbor` end-of-path
 * toast. AT users get a clear signal that their keypress was registered.
 */
import { get } from 'svelte/store'
import { businessRecords } from '@lib/data-store'
import { describeCluster } from '@lib/utils/ui-presentation'
import { calculateSignalScore } from '@lib/utils/geo-data'
import { focusOnNode } from '@lib/engine/camera-choreography/cursor'
import { zoomCamera } from '@lib/engine/camera-choreography/routes'
import { traverseNeighbor } from '@lib/journey/thread-settler'
import { showExperienceToast } from '@lib/orchestration/toast'
import { appState } from '@lib/state/app.svelte'

// Dispatch targets are imported directly (no re-export). Tests use
// `vi.mock(...)` against the source module paths above.

// ── Constants ───────────────────────────────────────────────────────────────────────

/** 250ms debounce for focus-changing actions (arrows, Home, End). */
const FOCUS_DEBOUNCE_MS = 250
const _lastFireByKey = new Map<string, number>()

/** Returns true if the action should be suppressed (debounced). */
function shouldDebounceKey(key: string, isZoom: boolean): boolean {
    if (isZoom) return false
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
    const last = _lastFireByKey.get(key) ?? 0
    if (now - last < FOCUS_DEBOUNCE_MS) return true
    _lastFireByKey.set(key, now)
    return false
}

/** Test-only: reset the debounce state between specs. */
export function __resetCanvasKeyboardDebounce(): void {
    _lastFireByKey.clear()
}

// ── Cluster siblings ─────────────────────────────────────────────────────────────────

export function getClusterSiblings(focusedIndex: number): readonly number[] {
    const records = get(businessRecords)
    const focused = records[focusedIndex]
    if (!focused) return []
    const myCluster = focused.cluster
    const ranked: Array<{ index: number; score: number }> = []
    for (let i = 0; i < records.length; i++) {
        const r = records[i]
        if (!r || r.cluster !== myCluster) continue
        const score = calculateSignalScore(r as unknown as Parameters<typeof calculateSignalScore>[0])
        ranked.push({ index: i, score })
    }
    ranked.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score // DESC by score
        return a.index - b.index // ties broken by index ASC
    })
    return ranked.map((r) => r.index)
}

// ── Trail extremes ─────────────────────────────────────────────────────────────────────

export function getTrailSeedIndex(): number | null {
    const seed = appState.navState.trailSeedIndex
    return typeof seed === 'number' && Number.isFinite(seed) ? seed : null
}

export function getTrailEndIndex(): number | null {
    const history = appState.navState.walkHistoryIndices
    if (!Array.isArray(history) || history.length === 0) return null
    const last = history[history.length - 1]
    return typeof last === 'number' && Number.isFinite(last) ? last : null
}

export function getCurrentFocusedIndex(): number | null {
    const idx = appState.navState.focusedIndex
    return typeof idx === 'number' && Number.isFinite(idx) ? idx : null
}

// ── Action map ────────────────────────────────────────────────────────────────────────

interface ZoomAction {
    readonly kind: 'zoom'
    readonly multiplier: number
}
interface ThreadAction {
    readonly kind: 'thread'
    readonly step: 1 | -1
}
interface ClusterAction {
    readonly kind: 'cluster'
    readonly step: 1 | -1
}
interface HomeAction {
    readonly kind: 'home'
}
interface EndAction {
    readonly kind: 'end'
}
type Action = ZoomAction | ThreadAction | ClusterAction | HomeAction | EndAction

/**
 * Keys the canvas claims. Each maps to a handler action. Other keys are
 * NOT preventDefault'd — they fall through to Three.js OrbitControls or
 * browser default so power-users can still rotate / pan the camera.
 */
const ACTION_MAP: Readonly<Record<string, Action>> = {
    ArrowRight: { kind: 'thread', step: 1 },
    ArrowLeft: { kind: 'thread', step: -1 },
    ArrowDown: { kind: 'cluster', step: 1 },
    ArrowUp: { kind: 'cluster', step: -1 },
    Home: { kind: 'home' },
    End: { kind: 'end' },
    Plus: { kind: 'zoom', multiplier: 1 / 1.2 },
    Equal: { kind: 'zoom', multiplier: 1 / 1.2 },
    Minus: { kind: 'zoom', multiplier: 1.2 }
}

export function isClaimedCanvasKey(key: string): boolean {
    return key in ACTION_MAP
}

// ── Dispatcher ─────────────────────────────────────────────────────────────────────────

function dispatchClusterAction(step: 1 | -1, focusedIndex: number): void {
    const siblings = getClusterSiblings(focusedIndex)
    const pos = siblings.indexOf(focusedIndex)
    if (pos === -1) return // defensive: focused index not in its own sibling list
    const nextPos = pos + step
    if (nextPos < 0 || nextPos >= siblings.length) {
        const records = get(businessRecords)
        const focused = records[focusedIndex]
        const clusterName = focused ? describeCluster(focused.cluster ?? 0) : 'this group'
        showExperienceToast('End of this group', `No ${step > 0 ? 'next' : 'previous'} business in ${clusterName}.`)
        return
    }
    const targetIndex = siblings[nextPos]
    if (typeof targetIndex === 'number' && Number.isFinite(targetIndex)) {
        focusOnNode(targetIndex, { fromCanvasNode: true })
    }
}

function dispatchHomeAction(): void {
    const seed = getTrailSeedIndex()
    if (seed === null) return
    focusOnNode(seed, { fromCanvasNode: true })
}

function dispatchEndAction(): void {
    const end = getTrailEndIndex()
    if (end === null) return
    focusOnNode(end, { fromCanvasNode: true })
}

function dispatchZoomAction(multiplier: number): void {
    zoomCamera(multiplier)
}

/**
 * Main handler. Call from `Canvas.svelte`'s keydown listener.
 *
 * Order of operations (matches the upstream plan):
 *   1. Look up the action — early-return if not one of our keys
 *   2. Debounce focus-changing actions (250ms); zoom is raw repeat
 *   3. preventDefault + stopImmediatePropagation to override OrbitControls
 *   4. Dispatch per the action.kind
 */
export function handleCanvasKeydown(event: KeyboardEvent): void {
    const action = ACTION_MAP[event.key]
    if (!action) return

    if (shouldDebounceKey(event.key, action.kind === 'zoom')) return

    // Claim the key. preventDefault stops the browser scroll on arrows;
    // stopImmediatePropagation stops Three.js OrbitControls (bound to the
    // same canvas element) from rotating the camera on the same key.
    event.preventDefault()
    event.stopImmediatePropagation()

    const focusedIndex = getCurrentFocusedIndex()

    switch (action.kind) {
        case 'thread':
            if (focusedIndex === null) return
            traverseNeighbor(action.step)
            return
        case 'cluster':
            if (focusedIndex === null) return
            dispatchClusterAction(action.step, focusedIndex)
            return
        case 'home':
            dispatchHomeAction()
            return
        case 'end':
            dispatchEndAction()
            return
        case 'zoom':
            dispatchZoomAction(action.multiplier)
            return
    }
}
