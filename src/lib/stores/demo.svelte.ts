/**
 * @lib/stores/demo.svelte.ts — Micro-demo state machine store (Svelte 5 runes)
 */
import { get, writable, type Readable } from 'svelte/store'
import type { BusinessRecord } from '@lib/types/business'
import { appState } from '@lib/state/app.svelte.ts'
import { getBusinessRecords } from '@lib/data-store'
import { guardReducedMotion } from '@lib/demo/guards'

// ── Types ─────────────────────────────────────────────────────────────────────

export type DemoPhase =
    | 'IDLE'
    | 'OVERVIEW'
    | 'SEARCH'
    | 'FOCUS'
    | 'THREADS'
    | 'NEIGHBORS'
    | 'TRAIL'
    | 'DIVE'
    | 'FILTER'
    | 'MAP'
    | 'RETURN'
    | 'COMPLETE'
    | 'CANCELLED'

export interface DemoStoreState {
    phase: DemoPhase
    startTime: number
    lastPhaseChangeAt: number
}

// ── Constants ────────────────────────────────────────────────────────────────

export const DEMO_TIMING = {
    OVERVIEW_MS: 4000,
    SEARCH_MS: 5000,
    FOCUS_MS: 4000,
    THREADS_MS: 3000,
    NEIGHBORS_MS: 4000,
    TRAIL_MS: 5000,
    DIVE_MS: 4000,
    FILTER_MS: 4000,
    MAP_MS: 5000,
    RETURN_MS: 3000
} as const

export const DEMO_START_DELAY_MS = 1500
export const DEMO_TOTAL_DURATION_MS =
    DEMO_TIMING.OVERVIEW_MS +
    DEMO_TIMING.SEARCH_MS +
    DEMO_TIMING.FOCUS_MS +
    DEMO_TIMING.THREADS_MS +
    DEMO_TIMING.NEIGHBORS_MS +
    DEMO_TIMING.TRAIL_MS +
    DEMO_TIMING.DIVE_MS +
    DEMO_TIMING.FILTER_MS +
    DEMO_TIMING.MAP_MS +
    DEMO_TIMING.RETURN_MS
export const DEMO_LIFETIME_KEY = 'moco_mycelium_demo_v1'
export const DEMO_SESSION_KEY = 'moco_mycelium_demo_session_v1'
export const MAX_START_RETRIES = 3
const SHOWCASE_POOL: readonly number[] = [50, 707, 1525, 2908, 3899, 4102, 6684, 7938]
const timers = new Map<ReturnType<typeof setTimeout>, number>()

// ── Initial State ────────────────────────────────────────────────────────────

const INITIAL_DEMO: DemoStoreState = {
    phase: 'IDLE',
    startTime: 0,
    lastPhaseChangeAt: 0
}

// ── Store ────────────────────────────────────────────────────────────────────

/**
 * Why a plain `writable` instead of `toStore(getter, setter)`:
 *   `toStore` replaces the writable's notifying `set` with the user's custom
 *   setter. In Svelte runtime this works because the render_effect re-reads the
 *   getter after mutations and calls the underlying writable's `set`. But in
 *   jsdom/vitest there is no render_effect, so `store.update()` writes to
 *   appState but subscribers never wake up — `get(store)` returns stale values.
 *
 *   A plain `writable` + `withDemoNotify()` wrapper fixes both: runtime
 *   subscribers are notified by the writable's own `.set()`, and test
 *   environments get synchronous notification too.
 */
const _demoWritable = writable<DemoStoreState>({ ...INITIAL_DEMO })

/** Atomic start guard — prevents stacked retry loops from causing double-starts.
 *  Set synchronously when startDemo() is called; checked before any timer fires. */
let _startGuardClaimed = false

/**
 * Push mutations to both `_demoWritable` and `appState`.
 * The writable notifies subscribers; the appState sync keeps the kernel
 * in sync for legacy readers and the engine bridge.
 */
function withDemoNotify(updater: (_s: DemoStoreState) => DemoStoreState): void {
    const current = get(_demoWritable)
    const to = updater(current)
    _demoWritable.set(to)
    appState.demoPhase = to.phase
}

/**
 * Demo store: callable as `demo()` for direct state access,
 * and satisfies `Readable<DemoStoreState>` + `.update()`/`.set()` for store consumers.
 */
export type DemoStoreApi = (() => DemoStoreState) &
    Readable<DemoStoreState> & {
        update(_fn: (_s: DemoStoreState) => DemoStoreState): void
        set(_value: DemoStoreState): void
    }

function _createDemoStore(): DemoStoreApi {
    const fn = (() => get(_demoWritable)) as unknown as DemoStoreApi

    fn.subscribe = _demoWritable.subscribe
    fn.update = (updater: (_s: DemoStoreState) => DemoStoreState) => withDemoNotify(updater)
    fn.set = (value: DemoStoreState) => {
        _demoWritable.set(value)
        appState.demoPhase = value.phase
    }

    return fn
}

/** Single reactive instance of the micro-demo state. */
export const demoStore: DemoStoreApi = _createDemoStore()
/** Backwards-compatible alias. */
export const demoState: DemoStoreApi = demoStore

// ── Derived Getters ──────────────────────────────────────────────────────────

export const demoPhase = () => appState.demoPhase as DemoPhase
export const isDemoRunning = () => isDemoActive()
export const demoNodeIndex = () => null
export const isDemoActive = () => {
    const phase = appState.demoPhase
    return phase !== 'IDLE' && phase !== 'COMPLETE' && phase !== 'CANCELLED'
}

// ── Helper Actions ───────────────────────────────────────────────────────────

export function setDemoPhase(phase: DemoPhase): void {
    withDemoNotify((s) => ({ ...s, phase }))
}

export function startDemo(): boolean {
    // Atomic guard: prevent stacked retry loops from causing double-starts.
    // If a prior attempt (or an in-flight retry) already claimed the guard,
    // bail out synchronously before any timer fires.
    if (_startGuardClaimed) return false
    _startGuardClaimed = true

    // Set the per-session guard immediately so a race between this call and
    // any other start path (URL param, button click, auto-start) sees the
    // same barrier.
    if (typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem(DEMO_SESSION_KEY, '1')
    }

    withDemoNotify((s) => ({ ...s, phase: 'OVERVIEW', startTime: performance.now() }))
    return true
}

export function cancelDemo(): boolean {
    const phase = appState.demoPhase
    // Mirror the legacy choreography guard: terminal states are already settled.
    if (phase === 'IDLE' || phase === 'COMPLETE' || phase === 'CANCELLED') return false
    withDemoNotify((s) => ({ ...s, phase: 'CANCELLED' }))
    return true
}

export function transitionDemo(nextPhase: DemoPhase): void {
    setDemoPhase(nextPhase)
}

export function setDemoTimer(id: ReturnType<typeof setTimeout>): void {
    if (id !== null && id !== undefined) timers.set(id, Date.now())
}

export function trackDemoTimer(id: ReturnType<typeof setTimeout>): ReturnType<typeof setTimeout> {
    timers.set(id, Date.now())
    return id
}

export function scheduleDemoTimer(callback: () => void, delay: number): ReturnType<typeof setTimeout> {
    // eslint-disable-next-line no-restricted-syntax -- one-shot timer scoped to local promise / effect cleanup
    const id = setTimeout(() => {
        timers.delete(id)
        callback()
    }, delay)
    timers.set(id, Date.now())
    return id
}

export function clearDemoTimer(id: ReturnType<typeof setTimeout>): void {
    if (id !== null && id !== undefined) {
        clearTimeout(id)
        timers.delete(id)
    }
}

export function cancelAllDemoTimers(): void {
    for (const id of timers.keys()) clearTimeout(id)
    timers.clear()
}

export function getActiveDemoTimerCount(): number {
    return timers.size
}

/**
 * Generic point shape — accepts both BusinessRecord (canonical) and Point
 * (appState cache). The only fields the function reads are `name` and `status`.
 */
type DemoNodeCandidate = { name?: string | null; status?: string | null }

export function findDemoNode(records?: readonly BusinessRecord[]): number | null {
    const points: readonly DemoNodeCandidate[] = records ?? appState.points ?? getBusinessRecords()
    if (!points) return null

    const showcasePool = SHOWCASE_POOL
    for (const idx of showcasePool) {
        const point = points[idx]
        if (!point) continue
        if (point.status === 'disqualified') continue
        const name = ((point.name as string) || '').trim()
        if (!name || name.length < 3) continue
        return idx
    }

    if (!points.length) return null
    for (let i = 0; i < points.length; i++) {
        const point = points[i]
        if (!point) continue
        if (point.status === 'disqualified') continue
        const name = ((point.name as string) || '').trim()
        if (!name || name.length < 3) continue
        return i
    }

    return null
}

export function shouldRunDemo(force = false): boolean {
    const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams()
    const forceDemo = force || params.get('demo') === 'force'
    if (forceDemo) return true
    if (params.get('nodemo') === '1') return false
    if (hasDemoBeenSeen()) return false
    if (isDemoSuppressedThisSession()) return false
    // Restore legacy guard (dropped during the choreography.ts → demo.svelte.ts migration):
    // reduced-motion users must not receive the animation-driven tour. The camera glide is
    // suppressed under prefers-reduced-motion, which produces a frozen, confusing sequence
    // of phase labels with no visible movement. These users instead get the fallback
    // onboarding hint scheduled in DemoChoreography.svelte onMount. See audit 2026-06-26.
    if (!guardReducedMotion()) return false
    return true
}

export function hasDemoBeenSeen(): boolean {
    if (typeof localStorage === 'undefined') return false
    const raw = localStorage.getItem(DEMO_LIFETIME_KEY)
    if (!raw) return false
    try {
        const parsed = JSON.parse(raw) as { seen?: boolean } | number | string | boolean
        if (parsed === true || parsed === 1) return true
        if (typeof parsed === 'object' && parsed !== null) return parsed.seen === true
        return raw === '1' || raw === 'true'
    } catch {
        return raw === '1' || raw === 'true'
    }
}

export function isDemoSuppressedThisSession(): boolean {
    if (typeof sessionStorage === 'undefined') return false
    return sessionStorage.getItem(DEMO_SESSION_KEY) !== null
}

export function markDemoCompleted(): void {
    setDemoPhase('COMPLETE')
    try {
        localStorage.setItem(
            DEMO_LIFETIME_KEY,
            JSON.stringify({
                seen: true,
                seenAt: new Date().toISOString(),
                version: 1
            })
        )
    } catch {
        // Storage may be unavailable in private browsing or test sandboxes.
    }
}

export function markDemoSessionSkipped(_reason = 'user-input'): void {
    if (typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem(DEMO_SESSION_KEY, '1')
    }
}

export function resetDemo(): void {
    _startGuardClaimed = false
    _demoWritable.set({ ...INITIAL_DEMO })
    appState.demoPhase = INITIAL_DEMO.phase
}
