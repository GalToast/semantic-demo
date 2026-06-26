/**
 * global-bindings.ts
 * Canonical location (ported from — W15).
 * Global keyboard, focus, popstate, and visibility bindings.
 */

import { appState as _state } from '@lib/state/app.svelte'
const state = _state
import { handleGalaxyKeydown, initKeyboardResetOwnership, initKeyboardShortcutsHint } from '@lib/keyboard/keyboard-help'
import { returnToOverview, resetExplorationFocus } from '@lib/orchestration/lifecycle'
import { handleSemanticLaneWindowFocus, handleSemanticLaneVisibilityChange } from '@lib/ui/semantic-lane-bindings'
import { applyUrlState } from '@lib/orchestration/url-state'
import { handleError } from '@lib/utils/error-handler'

export let _globalEventController: AbortController = new AbortController()

export function disposeEventListeners(): void {
    _globalEventController.abort()
    _globalEventController = new AbortController()
    state.registeredEvents.clear()
    state.eventListenersInitialized = false
}

export function bindGlobalEvents(): void {
    if (!state.registeredEvents.has('global-interaction')) {
        state.registeredEvents.add('global-interaction')
        const opts: AddEventListenerOptions = { signal: _globalEventController.signal }
        document.addEventListener(
            'keydown',
            (e: KeyboardEvent) => {
                const button = e.target instanceof HTMLButtonElement ? e.target : null
                if (button && !button.disabled && (e.key === ' ' || e.code === 'Space')) {
                    e.preventDefault()
                    e.stopPropagation()
                    button.click()
                }
            },
            { capture: true, signal: _globalEventController.signal }
        )
        window.addEventListener(
            'keydown',
            (e: KeyboardEvent) => {
                handleGalaxyKeydown(e)
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
        window.addEventListener(
            'popstate',
            (e: PopStateEvent) => {
                if (typeof applyUrlState === 'function')
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
        document.addEventListener(
            'visibilitychange',
            () => {
                if (typeof handleSemanticLaneVisibilityChange === 'function') handleSemanticLaneVisibilityChange()
            },
            opts
        )
        initKeyboardResetOwnership({
            returnToOverview,
            resetExplorationFocus
        })
        initKeyboardShortcutsHint()
    }
}
