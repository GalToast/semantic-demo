/**
 * @lib/ui/loading.ts — Loading overlay phases
 *
 * Port of:
 *
 * Manages the loading overlay lifecycle: phase transitions, progress updates,
 * deferred hydration, weather init, and error state display.
 * Keeps navStore and data-store loading phase state aligned.
 */

import { setLoadingPhase as setNavLoadingPhase } from '@lib/stores/navigation.svelte.ts'
import { setLoadingPhase as setDataLoadingPhase } from '@lib/data-store'
import { loadSemanticThreads } from '@lib/semantic-threads'
import { isWeatherInitialized, setWeatherInitialized } from '@lib/stores/weather.svelte'

import type { LoadingPhase, LoadingPhaseMeta } from '@lib/types/state'
import { debugWarn, debugError } from '@lib/utils/debug'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface LoadingOverrides {
    note?: string
    foot?: string
    progress?: number
}

// ── Configuration ─────────────────────────────────────────────────────────────

const LOADING_MIN_VISIBLE_MS = 1320

const LOADING_PHASE_META: Record<string, LoadingPhaseMeta> = {
    records: { progress: 0.2, note: 'Gathering records...', foot: 'County records are arriving first.' },
    scene: { progress: 0.48, note: 'Raising the cloud...', foot: 'Shaping the scene.' },
    restore: { progress: 0.76, note: 'Restoring view...', foot: 'Restoring last known path.' },
    launch: { progress: 1, note: 'Awake.', foot: 'Threads are live.' }
}

const PHASE_ORDER: readonly string[] = ['records', 'scene', 'restore', 'launch']

const SCENE_READY_EVENT = 'semantic:scene-ready'

// ── Internal State ────────────────────────────────────────────────────────────

let _hideToken = 0
let _loadingOverlayStartedAt = 0

let _loadingHideTimer: ReturnType<typeof setTimeout> | null = null
let _deferredHydrationStarted = false

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Set the loading overlay to a specific phase with optional text overrides.
 *
 * Updates:
 * - The navStore loadingPhaseKey
 * - Body data attributes for CSS state machine
 * - Overlay DOM (note, foot, progress bar)
 * - Phase chip active/complete states
 */
export function setLoadingPhase(phaseKey: string, overrides: LoadingOverrides = {}): void {
    _hideToken++
    _loadingOverlayStartedAt = performance.now()

    // Update the store
    setNavLoadingPhase(phaseKey)
    setDataLoadingPhase((PHASE_ORDER.includes(phaseKey) ? phaseKey : 'records') as LoadingPhase)

    // Update body data attributes
    if (typeof document !== 'undefined' && document.body) {
        document.body.dataset.loadingOverlay = 'active'
        delete document.body.dataset.sceneReady
    }

    // Get phase metadata
    const phase: LoadingPhaseMeta = LOADING_PHASE_META[phaseKey] ?? LOADING_PHASE_META.records!

    // Update overlay DOM
    const overlay = document.getElementById('loading-overlay')
    if (overlay) {
        overlay.hidden = false
        overlay.inert = false
        overlay.removeAttribute('aria-hidden')
        overlay.classList.remove('hidden', 'launching')
        overlay.dataset.loadingPhase = phaseKey
        overlay.dataset.loadingState = 'active'
    }

    const noteEl = document.getElementById('loading-note')
    const footEl = document.getElementById('loading-foot')
    const progressBar = document.getElementById('loading-progress-bar')

    if (noteEl) noteEl.textContent = overrides.note || phase.note
    if (footEl) footEl.textContent = overrides.foot || phase.foot
    if (progressBar) {
        const progress = overrides.progress ?? phase.progress
        progressBar.style.width = `${Math.round(progress * 100)}%`
    }

    // Update phase chips
    _updatePhaseChips(phaseKey)
}

/**
 * Hide the loading overlay with a minimum visible duration gate
 * and a smooth launch transition.
 */
export async function hideLoadingOverlay(): Promise<void> {
    const overlay = document.getElementById('loading-overlay')
    if (!overlay) return

    // Wait for minimum visible duration
    const elapsed = performance.now() - _loadingOverlayStartedAt
    const remaining = Math.max(0, LOADING_MIN_VISIBLE_MS - elapsed)
    if (remaining > 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, remaining))
    }

    // Transition: launching → hidden
    overlay.dataset.loadingState = 'launching'
    overlay.classList.add('launching')
    await new Promise<void>((resolve) => setTimeout(resolve, 180))

    overlay.classList.add('hidden')
    overlay.dataset.loadingState = 'hidden'
    overlay.setAttribute('aria-hidden', 'true')
    overlay.inert = true
    overlay.hidden = true

    // Update body data attributes
    if (typeof document !== 'undefined' && document.body) {
        document.body.dataset.loadingOverlay = 'hidden'
        document.body.dataset.sceneReady = 'true'
    }

    // Dispatch scene ready event
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(SCENE_READY_EVENT))
    }
}

/**
 * Start deferred hydration — runs non-critical initialization
 * (semantic threads, mycelium, filters, weather) during idle time.
 */
export function startDeferredHydration(): void {
    if (_deferredHydrationStarted) return
    _deferredHydrationStarted = true

    const run = async (): Promise<void> => {
        try {
            // Load semantic thread neighbor data (async, may retry internally)
            const threadsPromise = loadSemanticThreads({ reason: 'svelte-deferred-hydration' }).catch(
                (err: unknown) => {
                    debugWarn('[Loading] deferred semantic threads load failed:', err)
                }
            )

            // Apply current filter state to legacy point visibility (sync)
            // Filter state is already synced via the Svelte store; the legacy
            // rendering layer reads point.visible during the next frame.
            await threadsPromise

            // Create mycelium thread geometry (sync, requires pointsMesh + nodePositions)
            try {
                const { createMycelium } = await import('@lib/engine/thread-manager')
                createMycelium()
            } catch (threadErr) {
                debugWarn('[Loading] deferred mycelium creation failed:', threadErr)
            }
        } catch (err) {
            debugError('[Loading] deferred hydration failed:', err)
        }

        scheduleWeatherHydration()
    }

    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
        ;(window as { requestIdleCallback: (cb: () => void, opts?: { timeout: number }) => void }).requestIdleCallback(
            run,
            { timeout: 250 }
        )
    } else {
        setTimeout(run, 80)
    }
}

/**
 * Schedule weather initialization during idle time.
 */
export function scheduleWeatherHydration(): void {
    if (isWeatherInitialized()) return

    const start = async (): Promise<void> => {
        try {
            const { initWeather } = await import('@lib/utils/weather')
            initWeather()
            setWeatherInitialized(true)
        } catch (err) {
            debugWarn('[Loading] weather initialization failed:', err)
        }
    }

    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
        ;(window as { requestIdleCallback: (cb: () => void, opts?: { timeout: number }) => void }).requestIdleCallback(
            start,
            { timeout: 500 }
        )
    } else {
        setTimeout(start, 300)
    }
}

/**
 * Display the loading overlay in an error state with a user-facing message.
 */
export function applyLoadingErrorState(error: Error): void {
    const overlay = document.getElementById('loading-overlay')
    if (!overlay) return

    // Build error UI via DOM API (no innerHTML) to avoid XSS surface
    overlay.textContent = ''
    const shell = document.createElement('div')
    shell.className = 'loading-shell'
    shell.setAttribute('role', 'alert')

    const kicker = document.createElement('div')
    kicker.className = 'loading-kicker'
    kicker.textContent = 'Graph unavailable'

    const title = document.createElement('div')
    title.className = 'loading-title'
    title.textContent = 'Failed to load county records'

    const note = document.createElement('div')
    note.className = 'loading-note'
    note.textContent = 'The Semantic Explorer is offline or blocked right now. Refresh after the connection recovers.'

    const foot = document.createElement('div')
    foot.className = 'loading-foot'
    foot.textContent = error?.message || 'Initialization failed'

    shell.append(kicker, title, note, foot)
    overlay.appendChild(shell)
    overlay.hidden = false
    overlay.inert = false
    overlay.removeAttribute('aria-hidden')
    overlay.classList.remove('hidden', 'launching')
    overlay.dataset.loadingState = 'error'
}

// ── Terrain Prelude ───────────────────────────────────────────────────────────

/**
 * Show the terrain prelude overlay (map-prelude transition phase).
 */
export function showTerrainPreludeOverlay(): void {
    setLoadingPhase('restore', {
        note: 'Preparing terrain...',
        foot: 'Synchronizing semantic space to geographic map.'
    })
}

/**
 * Hide the terrain prelude overlay.
 */
export function hideTerrainPreludeOverlay(): void {
    hideLoadingOverlay()
}

// ── Internal Helpers ──────────────────────────────────────────────────────────

function _updatePhaseChips(activePhase: string): void {
    if (typeof document === 'undefined') return

    document.querySelectorAll<HTMLElement>('.loading-phase-chip[data-loading-phase]').forEach((chip) => {
        const chipPhase = chip.getAttribute('data-loading-phase')
        if (!chipPhase) return

        const activeIndex = PHASE_ORDER.indexOf(activePhase)
        const chipPhaseIndex = PHASE_ORDER.indexOf(chipPhase)

        chip.classList.toggle('is-active', chipPhase === activePhase)
        chip.classList.toggle('is-complete', chipPhaseIndex > -1 && activeIndex > chipPhaseIndex)
    })
}

/**
 * Cancel any pending loading-overlay hide. Used by the engine teardown path
 * when `deinit()` runs while the launch transition is queued.
 */
export function cancelLoadingHide(): void {
    if (_loadingHideTimer !== null) {
        clearTimeout(_loadingHideTimer)
        _loadingHideTimer = null
    }
    _hideToken += 1
}
