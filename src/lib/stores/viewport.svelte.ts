/**
 * @lib/stores/viewport.svelte.ts — Viewport dimensions, DPR, reduced-motion, and breakpoints
 *
 * Single source of truth for viewport state. Syncs body data-* attributes
 * via $effect for CSS coexistence during migration.
 *
 * ── Migration to createStateMirror ──────────────────────────────────────────
 * Before this commit, this file shipped the dual-state-mirror pattern by
 * hand: a `writable<ViewportState>`, a `withViewportNotify(updater)` helper,
 * and a `_createViewportStore()` callable-builder. That's the pattern the
 * factory in src/lib/state/create-state-mirror.ts was extracted to replace.
 *
 * The migrated form replaces ~50 LOC of pattern with one factory call. The
 * public API is unchanged: `viewport` is still a callable that reads from
 * appState (the kernel-of-truth), and consumers still call
 * `viewport.update(fn)` / `viewport.set(value)` / `viewport.subscribe(cb)`.
 *
 * Bound fields (those mirrored to appState) are exactly the same 5 the
 * previous implementation wrote: width, height, dpr, reducedMotion, isCompact.
 * The derived fields (isMobile, isLandscape, isCompactLandscape,
 * isUltraCompactPortrait) are still computed locally from appState inside
 * computeFromAppState and are not bound (no separate appState slot to mirror).
 */
import type { Readable } from 'svelte/store'
import { appState } from '@lib/state/app.svelte'
import { createStateMirror } from '@lib/state/create-state-mirror'

// ── Constants ────────────────────────────────────────────────────────────────

const MOBILE_BREAKPOINT = 768
const COMPACT_LANDSCAPE_MAX_HEIGHT = 740
const ULTRA_COMPACT_MAX_WIDTH = 430
const ULTRA_COMPACT_MIN_HEIGHT = 741
const ULTRA_COMPACT_MAX_HEIGHT = 860
const MAX_DPR = 3

// ── ViewportState shape ──────────────────────────────────────────────────────
//
// The factory needs this shape as a single record. Re-declared inline
// (instead of imported from @lib/types/state) so the factory's `bindings`
// object can be inferred against the exact same shape used by
// computeFromAppState below — keeps the read/write path symmetric.

interface ViewportMirrorState {
    width: number
    height: number
    dpr: number
    reducedMotion: boolean
    isCompact: boolean
    isMobile: boolean
    isLandscape: boolean
    isCompactLandscape: boolean
    isUltraCompactPortrait: boolean
}

function readViewportFromAppState(): ViewportMirrorState {
    const width = appState.viewportState.viewportWidth
    const height = appState.viewportState.viewportHeight
    const isCompact = appState.viewportState.viewportIsCompact
    return {
        width,
        height,
        dpr: appState.viewportState.viewportDpr,
        reducedMotion: appState.viewportState.viewportReducedMotion,
        isCompact,
        isMobile: isCompact,
        isLandscape: width > height,
        isCompactLandscape: isCompact && height <= COMPACT_LANDSCAPE_MAX_HEIGHT,
        isUltraCompactPortrait:
            width <= ULTRA_COMPACT_MAX_WIDTH && height >= ULTRA_COMPACT_MIN_HEIGHT && height <= ULTRA_COMPACT_MAX_HEIGHT
    }
}

// ── Mirror ──────────────────────────────────────────────────────────────────

const viewportMirror = createStateMirror<ViewportMirrorState>({
    computeFromAppState: readViewportFromAppState,
    bindings: {
        // Phase 6d: viewport fields moved into appState.viewportState
        // sub-aggregate. The factory's bindings expect flat appState keys,
        // so all bindings are null. `applyViewportUpdate` below mirrors
        // each field explicitly via appState.viewportState.X writes.
        width: null,
        height: null,
        dpr: null,
        reducedMotion: null,
        isCompact: null,
        // Derived fields (isMobile, isLandscape, isCompactLandscape,
        // isUltraCompactPortrait) — these live in the writable for
        // subscriber convenience but aren't separately mirrored.
        isMobile: null,
        isLandscape: null,
        isCompactLandscape: null,
        isUltraCompactPortrait: null
    },
    storageKey: '__SEMANTIC_EXPLORER_VIEWPORT_MIRROR__'
})

// ── Public Store API (preserved verbatim from previous implementation) ────────

/**
 * Viewport store: callable as `viewport()` for direct state access,
 * and satisfies `Readable<ViewportState>` + `.update()`/`.set()` for store consumers.
 */
export type ViewportStoreApi = (() => ViewportMirrorState) &
    Readable<ViewportMirrorState> & {
        update(_fn: (_s: ViewportMirrorState) => ViewportMirrorState): void
        set(_value: ViewportMirrorState): void
    }

/** Single reactive instance of the viewport state. */
export const viewport = viewportMirror as unknown as ViewportStoreApi

// Phase 6d: explicit mirror bridge — factory bindings are all null
// (nested path support not in factory contract). Subscribe to the
// writable once and mirror every viewport field to appState.viewportState
// on each write. Covers factory.set, factory.update, and the manual
// syncViewport() write below.
viewportMirror.subscribe((s) => {
    if (typeof window === 'undefined' && typeof appState === 'undefined') return
    appState.viewportState.viewportWidth = s.width
    appState.viewportState.viewportHeight = s.height
    appState.viewportState.viewportDpr = s.dpr
    appState.viewportState.viewportReducedMotion = s.reducedMotion
    appState.viewportState.viewportIsCompact = s.isCompact
})

// ── Derived ──────────────────────────────────────────────────────────────────

export const viewportWidth = () => appState.viewportState.viewportWidth
export const viewportHeight = () => appState.viewportState.viewportHeight
export const dpr = () => appState.viewportState.viewportDpr
export const reducedMotion = () => appState.viewportState.viewportReducedMotion
export const isCompact = () => appState.viewportState.viewportIsCompact
export const isMobile = () => appState.viewportState.viewportIsCompact
export const isLandscape = () => appState.viewportState.viewportWidth > appState.viewportState.viewportHeight

/** Compact landscape: max-width 768px AND max-height 740px (common small mobile). */
export const isCompactLandscape = () => {
    return (
        appState.viewportState.viewportIsCompact &&
        appState.viewportState.viewportHeight <= COMPACT_LANDSCAPE_MAX_HEIGHT
    )
}

/** Ultra-compact portrait: max-width 430px, height 741-860px. */
export const isUltraCompactPortrait = () => {
    return (
        appState.viewportState.viewportWidth <= ULTRA_COMPACT_MAX_WIDTH &&
        appState.viewportState.viewportHeight >= ULTRA_COMPACT_MIN_HEIGHT &&
        appState.viewportState.viewportHeight <= ULTRA_COMPACT_MAX_HEIGHT
    )
}

// ── Actions ──────────────────────────────────────────────────────────────────

/** Re-read the viewport from the browser and update the store. */
export function syncViewport(): void {
    if (typeof window === 'undefined') return

    const width = window.innerWidth
    const height = window.innerHeight
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR)
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const isCompact = width <= MOBILE_BREAKPOINT

    // Use the factory's set() — it publishes to the writable. Phase 6d
    // factory bindings are all null (nested path support not in factory
    // contract), so we mirror each viewport field to appState.viewportState
    // explicitly below. Subscribers fire synchronously in any env.
    viewportMirror.set({
        width,
        height,
        dpr,
        reducedMotion,
        isCompact,
        isMobile: isCompact,
        isLandscape: width > height,
        isCompactLandscape: isCompact && height <= COMPACT_LANDSCAPE_MAX_HEIGHT,
        isUltraCompactPortrait:
            width <= ULTRA_COMPACT_MAX_WIDTH && height >= ULTRA_COMPACT_MIN_HEIGHT && height <= ULTRA_COMPACT_MAX_HEIGHT
    })

    // Phase 6d: mirror each viewport field to appState.viewportState
    // explicitly (factory bindings are all null).
    appState.viewportState.viewportWidth = width
    appState.viewportState.viewportHeight = height
    appState.viewportState.viewportDpr = dpr
    appState.viewportState.viewportReducedMotion = reducedMotion
    appState.viewportState.viewportIsCompact = isCompact

    // body[data-compact/mobile/reducedMotion] now owned by parity-attrs.svelte.ts.
    // Removed bypass writers; parity's computeParityAttributes() writes the
    // same String(boolean) values from the same viewport store.
}

/**
 * Initialize viewport listeners (resize + prefers-reduced-motion).
 */
export function initViewportListeners(): () => void {
    if (typeof window === 'undefined') return () => {}

    let resizeRaf: number | null = null
    const onResize = () => {
        if (resizeRaf !== null) return
        resizeRaf = window.requestAnimationFrame(() => {
            resizeRaf = null
            syncViewport()
        })
    }
    const onMotionChange = (e: MediaQueryListEvent) => {
        // Use the factory's update() so writable subscribers (e.g. Canvas.svelte
        // $viewport) are notified — direct appState assignment before this
        // mutation only updated subscribers via the legacy kernel path.
        viewportMirror.update((s) => ({ ...s, reducedMotion: e.matches }))
    }

    window.addEventListener('resize', onResize, { passive: true })
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    motionQuery.addEventListener('change', onMotionChange)

    syncViewport()

    return () => {
        window.removeEventListener('resize', onResize)
        if (resizeRaf !== null) window.cancelAnimationFrame(resizeRaf)
        motionQuery.removeEventListener('change', onMotionChange)
    }
}

/**
 * Test-only escape hatch — drops the window-keyed writable so the next
 * import / read returns the current appState-derived initial value.
 * Most tests don't need this because the factory fixture reads from
 * appState on every call, but the singleton pattern requires it for
 * tests that need a clean slate between cases.
 */
export const resetViewportForTests = viewportMirror.resetForTests

// ── Query helpers ────────────────────────────────────────────────────────────

export function getViewportSize(): { width: number; height: number } {
    return { width: appState.viewportState.viewportWidth, height: appState.viewportState.viewportHeight }
}

export function isMobileViewport(): boolean {
    return appState.viewportState.viewportIsCompact
}

export function isCompactFocusStage(): boolean {
    return appState.viewportState.viewportIsCompact
}

export function prefersReducedMotion(): boolean {
    return appState.viewportState.viewportReducedMotion
}

export function hasCoarsePointer(): boolean {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
    return window.matchMedia('(pointer: coarse)').matches
}

export function getDevicePixelRatio(): number {
    return appState.viewportState.viewportDpr
}

export function getPanelSurface(): string {
    if (typeof document === 'undefined') return ''
    return document.body?.dataset?.panelSurface || ''
}

export function isMapSummarySurface(): boolean {
    return getPanelSurface() === 'map-focus-search'
}

export function isSemanticDiveSurface(): boolean {
    return getPanelSurface() === 'semantic-dive'
}

export function matchMediaSafe(query: string): MediaQueryList | null {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null
    return window.matchMedia(query)
}

export function getLocation(): Location | null {
    return typeof window !== 'undefined' ? window.location : null
}

export function getCurrentUrl(): string {
    return typeof window !== 'undefined' ? window.location.href : ''
}
