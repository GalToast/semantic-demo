/**
 * @lib/demo/choreography.ts — Micro-demo orchestration facade
 *
 * Port of the legacy micro-demo-choreography.js module. The timed camera/UI
 * choreography still lives behind the engine bridge (engine/demo-choreography.ts)
 * — the Svelte 5 port pending (W47 audit tier 2 #2.2); this public surface
 * is the load-bearing contract every demo consumer depends on.
 *
 * Thin facade: eligibility guards, showcase pool selection, retry loop,
 * and choreography delegation. Uses the demoStore for canonical demo
 * state (get(demoPhase)).
 *
 * Re-entrancy design (W47 fix):
 *   The `_startGuardClaimed` flag is owned by the public `startMicroDemo()`
 *   entry. `_startMicroDemo()` does the actual work and does NOT re-check
 *   the guard, so the retry setTimeout can re-enter the work loop without
 *   bouncing off the public guard. The guard is released only at terminal
 *   exit (success, no-conditions, no-node, out-of-retries) via
 *   `_releaseStartGuard()`. The retry path intentionally leaves the guard
 *   claimed so a concurrent UI click sees "start in progress" rather than
 *   starting a parallel attempt. The previous design released the guard
 *   inside the setTimeout callback BEFORE the recursive call, which opened
 *   a 1-2ms race window for a UI click to grab the freed guard and start
 *   a second demo in parallel.
 */
// ── Legacy Choreography Bridge ──────────────────────────────────────────────
import { debugWarn } from '@lib/utils/debug'
import {
    isAppReadyForDemo,
    guardNotSeen,
    guardReducedMotion,
    guardWebGL,
    guardUrlParam,
    notifyDemoUnableToStart,
    SESSION_STORAGE_KEY
} from './guards'
import { seededUnit } from '@lib/utils/seeded-random'
import { demoPhase, isDemoActive, startDemo, cancelDemo } from '@lib/stores/demo.svelte.ts'
import { setDemoNodeIndex, runDemo, cancelChoreography as _cancelChoreographyLegacy } from '../engine/demo-choreography'
import { appState } from '@lib/state/app.svelte'

// ── Choreography Delegation ────────────────────────────────────────────────
// The timed camera/UI choreography runs in engine/demo-choreography.ts
// (static imports resolved by Vite at bundle time; no lazy loading needed).

// ── Constants ───────────────────────────────────────────────────────────────

const DEMO_START_DELAY_MS = 25000
const MAX_START_RETRIES = 100

const SHOWCASE_POOL: readonly number[] = [50, 707, 1525, 2908, 3899, 4102, 6684, 7938]

// ── Fisher-Yates Shuffle (deterministic) ────────────────────────────────────

function _fisherYatesShuffle(array: readonly number[], seed = 0xdead): number[] {
    const arr = [...array]
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(seededUnit(i, seed) * (i + 1))
        const tmp = arr[i]!
        arr[i] = arr[j]!
        arr[j] = tmp
    }
    return arr
}

const _shuffledPool = _fisherYatesShuffle(SHOWCASE_POOL)

// ── Retry State ─────────────────────────────────────────────────────────────

let _startRetryTimer: number | null = null
let _startRetryDeadline = 0
let _startRetryCount = 0
let _startGuardClaimed = false

function _clearRetryTimer(): void {
    if (_startRetryTimer !== null) {
        window.clearTimeout(_startRetryTimer)
        _startRetryTimer = null
    }
    _startRetryDeadline = 0
}

/**
 * Release the re-entry guard and clear all retry state. Called at every
 * terminal exit from the start sequence: success, no-conditions terminal,
 * no-node terminal, out-of-retries terminal, and the catch around
 * `runDemo(cancelMicroDemo)`. The retry path intentionally does NOT
 * call this — its setTimeout re-enters _startMicroDemo() directly while
 * keeping the guard claimed.
 */
function _releaseStartGuard(): void {
    _startGuardClaimed = false
    _startRetryDeadline = 0
    _clearRetryTimer()
}

function _getDemoNode(): number | null {
    const points = appState.points as Array<Record<string, unknown>> | undefined
    if (!points) return null

    for (const idx of _shuffledPool) {
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

// ── Public API ──────────────────────────────────────────────────────────────

// M12: LEGACY 6-phase entry — zero callers since DemoChoreography.svelte
// replaced it with the 10-phase store (demo.svelte.ts). Kept as a thin
// forward so the module remains importable but marked deprecated so new
// code doesn't resurrect the split-brain demo.
/** @deprecated Use src/lib/stores/demo.svelte.ts (10-phase) — micro-demo is legacy */
export function initMicroDemo(): void {
    debugWarn('[demo] initMicroDemo() is deprecated — use DemoChoreography.svelte 10-phase')
    const params = new URLSearchParams(window.location.search)
    const forceDemo = params.get('demo') === 'force'

    if (!forceDemo) {
        if (!guardNotSeen()) {
            debugWarn('[demo] blocked — already seen')
            return
        }
        if (!guardReducedMotion()) {
            debugWarn('[demo] blocked — reduced motion')
            return
        }
        if (!guardWebGL()) {
            debugWarn('[demo] blocked — no WebGL / software renderer')
            return
        }
        if (!guardUrlParam()) {
            debugWarn('[demo] blocked — nodemo URL param')
            return
        }
    }
    startMicroDemo()
}

export function shouldRunMicroDemo(): boolean {
    const params = new URLSearchParams(window.location.search)
    const forceDemo = params.get('demo') === 'force'

    if (!forceDemo) {
        try {
            const raw = sessionStorage.getItem(SESSION_STORAGE_KEY)
            if (raw) return false
        } catch {
            /* sessionStorage unavailable */
        }
    }
    if (!isAppReadyForDemo()) return false
    return true
}

/**
 * Public entry. Owns the re-entry guard. A concurrent call (e.g., a UI
 * click while a retry loop is pending) sees the claimed guard and returns
 * early — there is already a start attempt in progress.
 */
export function startMicroDemo(): void {
    // Phase check first: if a demo is already running or completed this
    // session, don't even claim the guard.
    const phase = demoPhase()
    if (phase !== 'IDLE') {
        debugWarn('[demo] already active or completed')
        return
    }

    // Re-entry guard: the FIRST public entry claims it; subsequent entries
    // (including the retry loop's recursive call, which goes to
    // _startMicroDemo() directly to bypass this check) see it as claimed.
    if (_startGuardClaimed) return
    _startGuardClaimed = true

    void _startMicroDemo()
}

/**
 * Internal work function. Does NOT re-check the guard (the public
 * `startMicroDemo()` owns it). The retry setTimeout calls this directly
 * so the guard stays claimed across the 150ms wait, which prevents a
 * concurrent UI click from starting a parallel demo.
 */
async function _startMicroDemo(): Promise<void> {
    const params = new URLSearchParams(window.location.search)
    const forceDemo = params.get('demo') === 'force'

    if (!forceDemo) {
        try {
            const raw = sessionStorage.getItem(SESSION_STORAGE_KEY)
            if (raw) {
                _releaseStartGuard()
                return
            }
        } catch {
            /* sessionStorage unavailable */
        }
        if (!guardNotSeen()) {
            _releaseStartGuard()
            return
        }
    }

    if (!isAppReadyForDemo()) {
        const now = performance.now()
        if (!_startRetryDeadline) {
            _startRetryDeadline = now + DEMO_START_DELAY_MS
            _startRetryCount = 0
        }
        if (now < _startRetryDeadline && _startRetryCount < MAX_START_RETRIES) {
            _startRetryCount++
            // Retry path: schedule the next attempt WITHOUT releasing the guard.
            // The recursive call goes to _startMicroDemo() directly, bypassing
            // the public re-entry guard. The guard stays claimed until the
            // function exits via a terminal path (success, no-conditions,
            // no-node, or out-of-retries).
            _startRetryTimer = window.setTimeout(() => {
                _startRetryTimer = null
                void _startMicroDemo()
            }, 150)
            return
        }
        // Out of retries: terminal. Release the guard so a future call can start.
        try {
            sessionStorage.setItem(SESSION_STORAGE_KEY, 'skipped-no-conditions')
        } catch {
            /* ignore */
        }
        notifyDemoUnableToStart()
        _releaseStartGuard()
        return
    }

    const node = _getDemoNode()
    if (node === null) {
        try {
            sessionStorage.setItem(SESSION_STORAGE_KEY, 'skipped-no-node')
        } catch {
            /* ignore */
        }
        notifyDemoUnableToStart()
        _releaseStartGuard()
        return
    }

    try {
        sessionStorage.setItem(SESSION_STORAGE_KEY, new Date().toISOString())
    } catch {
        /* ignore */
    }

    // Update store
    startDemo()

    // Delegate to legacy choreography module via engine bridge. Wrap in
    // try/catch so a synchronous throw from the legacy module doesn't leak
    // the guard (which would block all future start attempts).
    setDemoNodeIndex(node)
    try {
        runDemo(cancelMicroDemo)
    } catch (err) {
        debugWarn('[demo] runDemo threw:', err)
    }

    _releaseStartGuard()
}

// M13 cross-system: keep micro-demo's own guard in sync with the
// canonical 10-phase store. Cancel/completion must release BOTH guards.
export function cancelMicroDemo(reason = 'user-input'): void {
    _cancelChoreographyLegacy(reason)
    _releaseStartGuard()
    cancelDemo()
}

export function isMicroDemoRunning(): boolean {
    return isDemoActive()
}
