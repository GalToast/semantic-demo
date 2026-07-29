/**
 * global-bindings.ts
 * App-lifetime window-state bindings: popstate (browser history restore),
 * window focus, and tab visibilitychange. Registered through a shared
 * AbortController and torn down by disposeEventListeners() during engine
 * teardown.
 *
 * Keyboard shortcuts are owned by `setupGlobalShortcuts`
 * (src/lib/keyboard/global-shortcuts.ts), wired from AppBoot. The legacy
 * `bindGlobalEvents()` bundled keyboard + popstate + visibility together;
 * when keyboard handling migrated to setupGlobalShortcuts the single caller
 * was removed, which also dropped the popstate/focus/visibility wiring — a
 * regression that left browser back/forward unable to restore the prior
 * view. `setupWindowStateBindings()` restores that wiring separately
 * (intent preserved, keyboard concern split out).
 */

import { appState as _state } from '@lib/state/app.svelte'
const state = _state
import { handleSemanticLaneWindowFocus, handleSemanticLaneVisibilityChange } from '@lib/ui/semantic-lane-bindings'
import { applyUrlState } from '@lib/orchestration/url-state'
import { handleError } from '@lib/utils/error-handler'

import { disposeSuggestionBindings } from '@lib/ui/suggestion-bindings'

export let _globalEventController: AbortController = new AbortController()

export function disposeEventListeners(): void {
    _globalEventController.abort()
    _globalEventController = new AbortController()
    state.registeredEvents.clear()
    state.eventListenersInitialized = false
    disposeSuggestionBindings()
}

/**
 * Register the app-lifetime window-state listeners:
 *   - popstate        → applyUrlState({ fromHistory }) restores the prior
 *     view when the user uses the browser back/forward buttons. updateUrlState()
 *     guards on `restoringBrowserHistory` (set by applyUrlState during a
 *     fromHistory restore) so the popstate-driven restore does not re-push
 *     history — no loop.
 *   - focus           → warm the semantic lane when the window regains focus.
 *   - visibilitychange → warm the semantic lane when the tab becomes visible.
 *
 * Keyboard handling is NOT registered here; it lives in setupGlobalShortcuts.
 * Button Space/Enter activation is left to the browser default.
 *
 * Idempotent: gated by the 'window-state' registeredEvents key, so repeated
 * calls (e.g. across AppBoot $effect re-runs) do not stack listeners. Torn
 * down by disposeEventListeners() via the shared AbortController.
 */
export function setupWindowStateBindings(): void {
    if (state.registeredEvents.has('window-state')) return
    state.registeredEvents.add('window-state')
    const opts: AddEventListenerOptions = { signal: _globalEventController.signal }

    window.addEventListener(
        'popstate',
        (e: PopStateEvent) => {
            if (typeof applyUrlState !== 'function') return
            applyUrlState({ fromHistory: true, historyState: e.state }).catch(
                handleError({
                    context: 'url-state-popstate',
                    userFacing: true,
                    toastTitle: 'Navigation error',
                    toastMessage: 'Could not restore this view. Try using the mode chips instead.'
                })
            )
        },
        opts
    )

    window.addEventListener(
        'focus',
        () => {
            if (typeof handleSemanticLaneWindowFocus === 'function') handleSemanticLaneWindowFocus()
        },
        opts
    )

    document.addEventListener(
        'visibilitychange',
        () => {
            if (typeof handleSemanticLaneVisibilityChange === 'function') handleSemanticLaneVisibilityChange()
        },
        opts
    )
}
