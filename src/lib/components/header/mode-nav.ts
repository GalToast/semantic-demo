/**
 * @lib/components/header/mode-nav.ts
 *
 * Pure-logic helpers for the Header mode-chip rail. Extracted from
 * Header.svelte in PR-D2 so keyboard-navigation, active-mode detection,
 * and selection-locking can be unit-tested without mounting the Svelte
 * component.
 *
 * Every function in this module is **pure** — they read state from
 * parameters and return new values. Side effects (URL state updates,
 * nav transition dispatch) are channeled through an injected context
 * object in `selectMode` so test code can pass a recording stub.
 *
 * Reuse candidates: CompassRail.svelte and mode-bindings.ts both
 * implement overlapping selection-lock + mode-dispatch semantics and
 * could consume these helpers in a follow-up (PR-D3).
 */

import type { NavMode } from '@lib/types/state'
import type { ModeOption } from './mode-constants'
import { modes } from './mode-constants'
import { isModeLocked } from '@lib/navigation/mode-affordances'

/** Side-effecting collaborators passed into `selectMode`. Types are
 * kept deliberately loose so test code can substitute recordings with
 * simpler signatures. */
export interface SelectModeContext {
    navActions: { RETURN_OVERVIEW: unknown; SET_VIEW: unknown; SET_SURFACE: unknown }
    dispatchNavTransition: (action: unknown, payload?: Record<string, unknown>) => unknown
    updateUrlState: (...args: unknown[]) => void
    debugWarn: (...args: unknown[]) => void
}

// Re-export from the shared navigation module so existing imports of these
// symbols from `@lib/components/header/mode-nav` keep working without
// changing every Header call site. The `mode-affordances` module is the
// canonical home (PR-D3 split it out so mode-bindings can share too).
export { isModeLocked, SELECTION_DEPENDENT_MODES } from '@lib/navigation/mode-affordances'

/** A mode is "active" when navState reflects it (mode or view, depending on kind). */
export function isActive(modeId: NavMode | 'map', activeMode: NavMode, activeView: string): boolean {
    if (modeId === 'map') return activeView === 'map'
    return activeMode === modeId
}

/**
 * Compute the array index in the chip rail that currently reflects the
 * navState. Returns 0 (Overview) as a safe default when nothing matches.
 */
export function getActiveIndexForMode(activeMode: NavMode, activeView: string): number {
    const idx = modes.findIndex((m) => {
        if (m.id === 'map') return activeView === 'map'
        return activeMode === m.id
    })
    return idx >= 0 ? idx : 0
}

/** Description text for the active mode (used for the header-description label). */
export function getActiveDescription(activeMode: NavMode, activeView: string): string {
    const active = modes.find((m) => isActive(m.id, activeMode, activeView))
    return active?.description ?? ''
}

/**
 * Roving-tabindex helper: find the next/previous non-locked chip index,
 * wrapping around. Lifted verbatim from the prior inline implementation
 * in Header.svelte so the ARIA contract is preserved.
 */
export function nextEnabledIndex(
    from: number,
    dir: 1 | -1,
    isLocked: (id: ModeOption['id']) => boolean
): number {
    const n = modes.length
    for (let step = 1; step <= n; step += 1) {
        const candidate = ((from + dir * step) % n + n) % n
        const m = modes[candidate]
        if (m && !isLocked(m.id)) return candidate
    }
    return from
}

/**
 * Roving-tabindex keyboard handler. Pure: returns the next index to focus,
 * or null to let the native button behaviour handle Enter/Space.
 *
 * The caller is responsible for the actual DOM focus call (since that
 * needs a `.focus()` on the rendered chip).
 */
export type ModeKeydownResult = { kind: 'focus'; index: number } | { kind: 'noop' }

export function computeModeKeydown(
    key: KeyboardEvent['key'],
    activeIndex: number,
    isLocked: (id: ModeOption['id']) => boolean
): ModeKeydownResult {
    const firstEnabled = modes.findIndex((m) => !isLocked(m.id))
    if (firstEnabled < 0) return { kind: 'noop' }
    const lastEnabled = (() => {
        for (let i = modes.length - 1; i >= 0; i -= 1) {
            const m = modes[i]
            if (m && !isLocked(m.id)) return i
        }
        return activeIndex
    })()

    let newIndex: number
    switch (key) {
        case 'ArrowRight':
        case 'ArrowDown':
            newIndex = nextEnabledIndex(activeIndex, 1, isLocked)
            break
        case 'ArrowLeft':
        case 'ArrowUp':
            newIndex = nextEnabledIndex(activeIndex, -1, isLocked)
            break
        case 'Home':
            newIndex = firstEnabled
            break
        case 'End':
            newIndex = lastEnabled
            break
        default:
            return { kind: 'noop' } // Enter / Space / non-arrow keys
    }
    return { kind: 'focus', index: newIndex }
}

/**
 * Map a click target's `data-mode` attribute back to the index in the
 * `modes` array. Pure: no side effects, no DOM reads.
 */
export function indexForModeId(modeId: string | null | undefined): number {
    if (!modeId) return -1
    return modes.findIndex((m) => m.id === modeId)
}

/**
 * Action dispatch for clicking a mode chip. Lifted from Header.svelte
 * `selectMode` — the actual nav transitions and URL sync are routed
 * through the injected context. Returns the chip's index (so callers
 * can update roving tabindex) or -1 if the mode is locked.
 */
export function selectMode(
    modeId: NavMode | 'map',
    hasSelection: boolean,
    ctx: SelectModeContext
): number {
    if (isModeLocked(modeId, hasSelection)) return -1

    const { navActions } = ctx
    if (modeId === 'overview') {
        ctx.dispatchNavTransition(navActions.RETURN_OVERVIEW)
    } else if (modeId === 'search') {
        ctx.dispatchNavTransition(navActions.SET_SURFACE, { surface: 'search' })
    } else if (modeId === 'focus') {
        ctx.dispatchNavTransition(navActions.SET_SURFACE, { surface: 'focus' })
    } else if (modeId === 'inside') {
        ctx.dispatchNavTransition(navActions.SET_SURFACE, { surface: 'inside' })
    } else if (modeId === 'trail') {
        ctx.dispatchNavTransition(navActions.SET_SURFACE, { surface: 'trail' })
    } else if (modeId === 'map') {
        // Map is a view-level switch (galaxy ↔ map), not just a surface change.
        // SET_VIEW updates currentView; SET_SURFACE preserves the map-family
        // surface for downstream panels that still read navState.surface.
        ctx.dispatchNavTransition(navActions.SET_VIEW, { view: 'map' })
        ctx.dispatchNavTransition(navActions.SET_SURFACE, { surface: 'map' })
    }

    // Sync URL after mode change so the browser bar reflects the new state.
    try {
        ctx.updateUrlState({}, { reason: 'mode-switch' })
    } catch (e) {
        ctx.debugWarn('Header.selectMode: URL update failed', e)
    }

    return indexForModeId(modeId)
}
