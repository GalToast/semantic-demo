/**
 * @lib/stores/demo.svelte.ts — Micro-demo state machine store (Svelte 5 runes)
 *
 * ── Migration to createStateMirror ──────────────────────────────────────────
 * Before this commit, this file shipped the dual-state-mirror pattern by
 * hand: a `writable<DemoStoreState>`, a `withDemoNotify(updater)` helper,
 * and a `_createDemoStore()` callable-builder. That's the pattern the
 * factory in src/lib/state/create-state-mirror.ts was extracted to replace.
 *
 * The migrated form replaces ~60 LOC of pattern with one factory call. The
 * public API is unchanged: `demoStore` is still a callable that reads from
 * appState (the kernel-of-truth), and consumers still call
 * `demoStore.update(fn)` / `demoStore.set(value)` / `demoStore.subscribe(cb)`.
 *
 * Bound fields: only `phase` is mirrored to `appState.demoPhase` — that's the
 * only field the legacy/kernel bridge reads. `startTime` and `lastPhaseChangeAt`
 * are store-local (no appState slot), so they're not bound.
 */
import type { Readable } from 'svelte/store'
import { appState } from '@lib/state/app.svelte.ts'
import { createStateMirror } from '@lib/state/create-state-mirror'
import type { BusinessRecord } from '@lib/types/business'
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

/** Atomic start guard — prevents stacked retry loops from causing double-starts.
 *  Set synchronously when startDemo() is called; checked before any timer fires. */
let _startGuardClaimed = false

// ── Initial State ────────────────────────────────────────────────────────────

const INITIAL_DEMO: DemoStoreState = {
    phase: 'IDLE',
    startTime: 0,
    lastPhaseChangeAt: 0
}

// ── Mirror ──────────────────────────────────────────────────────────────────

const demoMirror = createStateMirror<DemoStoreState>({
    computeFromAppState: () => ({
        phase: appState.demoPhase as DemoPhase,
        startTime: 0,
        lastPhaseChangeAt: 0
    }),
    bindings: {
        // Only `phase` is mirrored to appState — startTime/lastPhaseChangeAt
        // are store-local (no appState slot to mirror to).
        phase: 'demoPhase',
        startTime: null,
        lastPhaseChangeAt: null
    },
    storageKey: '__SEMANTIC_EXPLORER_DEMO_MIRROR__'
})

// ── Public Store API (preserved verbatim from previous implementation) ────────

/**
 * Demo store: callable as `demoStore()` for direct state access,
 * and satisfies `Readable<DemoStoreState>` + `.update()`/`.set()` for store consumers.
 */
export type DemoStoreApi = (() => DemoStoreState) &
    Readable<DemoStoreState> & {
        update(_fn: (_s: DemoStoreState) => DemoStoreState): void
        set(_value: DemoStoreState): void
    }

/** Single reactive instance of the micro-demo state. */
export const demoStore: DemoStoreApi = demoMirror as unknown as DemoStoreApi
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
    demoMirror.update((s) => ({ ...s, phase }))
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

    demoMirror.update((s) => ({ ...s, phase: 'OVERVIEW', startTime: performance.now() }))
    return true
}

export function cancelDemo(): boolean {
    const phase = appState.demoPhase
    // Mirror the legacy choreography guard: terminal states are already settled.
    if (phase === 'IDLE' || phase === 'COMPLETE' || phase === 'CANCELLED') return false
    demoMirror.update((s) => ({ ...s, phase: 'CANCELLED' }))
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

function isDeepLinkParams(params: URLSearchParams): boolean {
    // Mirrors src/main.ts parseUrlParams().isDeepLink — keep in sync.
    // ?story= intentionally NOT a deep-link (prompts fire post-splash).
    const queryLen = params.get('q')?.trim().length ?? 0
    return params.has('anchor') || params.has('record') || params.get('view') === 'map' || queryLen >= 2
}

export function shouldRunDemo(force = false): boolean {
    const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams()
    const forceDemo = force || params.get('demo') === 'force'
    // Force always wins — allows ?demo=force&record=519 debugging.
    if (forceDemo) return true
    if (params.get('nodemo') === '1') return false
    // H5 fix (Jul-10 bugsweep): first-time visitor on a deep-link (?record=N,
    // ?anchor=N, ?view=map, ?q=coffee) must NOT get the 10-phase tour fighting
    // the intended focus/search/map state. isDeepLink check sits here so the
    // auto-demo is suppressed for share-links.
    if (isDeepLinkParams(params)) return false
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

/** Exported for contract tests — do not use in app code; prefer shouldRunDemo(). */
export const __shouldRunDemo_testOnly_isDeepLinkParams = isDeepLinkParams

export function hasDemoBeenSeen(): boolean {
    if (typeof localStorage === 'undefined') return false
    // Guard the read: localStorage can throw even when `typeof localStorage`
    // is defined — Safari private mode, sandboxed iframes, and cookies-disabled
    // contexts all throw on access. The write path (markDemoCompleted) already
    // wraps setItem in try-catch; this mirrors it so first-visit demo
    // eligibility doesn't crash in storage-restricted contexts.
    let raw: string | null
    try {
        raw = localStorage.getItem(DEMO_LIFETIME_KEY)
    } catch {
        return false
    }
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
    // Guard the read: see hasDemoBeenSeen — sessionStorage can throw even
    // when defined (Safari private mode, sandboxed iframes). On the
    // shouldRunDemo critical path, treat a thrown read as "not suppressed"
    // rather than crashing first-visit eligibility.
    try {
        return sessionStorage.getItem(DEMO_SESSION_KEY) !== null
    } catch {
        return false
    }
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
    if (typeof sessionStorage === 'undefined') return
    // Guard the write: see hasDemoBeenSeen — sessionStorage can throw even
    // when defined (Safari private mode, sandboxed iframes).
    try {
        sessionStorage.setItem(DEMO_SESSION_KEY, '1')
    } catch {
        /* storage unavailable — skip is in-memory only for this session */
    }
}

export function resetDemo(): void {
    _startGuardClaimed = false
    demoMirror.set({ ...INITIAL_DEMO })
}

// ── Test escape hatch ────────────────────────────────────────────────────────

/**
 * Test-only escape hatch — drops the window-keyed writable so the next
 * import / read returns the current appState-derived initial value.
 */
export const resetDemoForTests = demoMirror.resetForTests
