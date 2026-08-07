/**
 * @lib/keyboard/global-shortcuts.ts
 *
 * Global keydown handler for app-wide keyboard shortcuts.
 *
 * Extracted from App.svelte's $effect block (W46-B3) so the keyboard
 * concern has a single source of truth and App.svelte stays focused on
 * composition + layout.
 *
 * Shortcuts handled:
 *   Ctrl/Cmd + 1-6 — mode switching (overview, search, trail, focus,
 *                     inside, map)
 *   `/`             — focus the search input
 *   `?` / Shift + `/` — open the keyboard shortcuts overlay
 *   `w`             — toggle weather widget visibility
 *   `m`             — toggle audio mute (optional)
 *   `Escape`        — return to overview + clear search input
 *
 * Form-field guard: shortcuts are suppressed when focus is inside an
 * input/textarea/select/contentEditable element so they don't hijack typing.
 *
 * Call from app-shell onMount; call the returned cleanup from
 * onMount's return-cleanup so the listener is removed on unmount.
 */

import { dispatchNavTransition, NAV_TRANSITION_ACTIONS, navStore } from '@lib/stores/navigation.svelte.ts'
import { setJourneyPhase } from '@lib/stores/journey.svelte.ts'
import { initKeyboardShortcutsHint, showKeyboardShortcutsHint } from './keyboard-help'
import { updateUrlState } from '@lib/orchestration/url-state'
import { isModeLocked } from '@lib/navigation/mode-affordances'
import { showExperienceToast } from '@lib/orchestration/toast'
import { setSearchQuery } from '@lib/stores/search.svelte.ts'
import { executeJourneyCompassAction } from '@lib/orchestration/compass-controller'
import { JOURNEY_ACTIONS } from '@lib/journey/compass-state'
import type { NavMode } from '@lib/types/state'

/**
 * Maps Ctrl/Cmd+1-6 to the nav mode each shortcut targets. Used by the
 * HIGH-1 (ocw_ui_fix_2026-07-07) selection-lock guard so the keyboard path
 * consults isModeLocked() exactly like the Header chips and CompassRail,
 * instead of dispatching the surface transition unconditionally.
 */
const KEY_TO_MODE: Record<string, NavMode | 'map'> = {
    '1': 'overview',
    '2': 'search',
    '3': 'trail',
    '4': 'focus',
    '5': 'inside',
    '6': 'map'
}

export interface GlobalShortcutsOptions {
    /**
     * Called when the user presses `w`. Should toggle the weather widget's
     * visibility in the app shell. Kept as a callback (not direct state
     * mutation) so this module has no Svelte state dependency and stays
     * framework-agnostic — the host wires it to whatever $state (or
     * other store) drives weather visibility.
     */
    toggleWeather: () => void
    /**
     * Called when the user presses `m`. Should toggle audio mute.
     * Optional — callers that don't wire audio can omit it.
     */
    toggleAudioMute?: () => void
}

/**
 * Install the global keydown listener. Returns a cleanup function that
 * removes the listener — call from onMount's return-cleanup so the
 * listener is removed when the app shell unmounts.
 */
export function setupGlobalShortcuts(options: GlobalShortcutsOptions): () => void {
    function handleGlobalKeydown(e: KeyboardEvent): void {
        const target = e.target as HTMLElement | null
        const tag = target?.tagName?.toLowerCase()
        // W7ks1-F1 fix: split predicate into a narrow `isTextInputField`
        // and a widened `isFormField`. Ctrl/Cmd+1-6 mode-switching + Escape
        // return-to-overview use the narrow form so focused buttons/anchors
        // do NOT block these navigation shortcuts (regression introduced in
        // commit 4c5f84a4 — it widened `isFormField` to include button+a, but
        // unintentionally also blocked Ctrl+1-6 mode-switch AND Escape
        // return-to-overview whenever focus sat on the chip-rail buttons the
        // user had just clicked).
        const isTextInputField =
            tag === 'input' || tag === 'textarea' || tag === 'select' || target?.isContentEditable === true
        // Single-char shortcuts (`/`, `?`, `w`, `m`) still suppress on focused
        // buttons/anchors — pressing `/` while focus sits on the help button
        // could otherwise interleave with browser-quick-find overlays.
        const isFormField = isTextInputField || tag === 'button' || tag === 'a'

        // Guard against IME composition keystrokes corrupting the composed text.
        if (e.isComposing) return

        // Ctrl/Cmd+1-6: mode switching (A2-4). Fires before all other
        // handlers so shortcuts are never masked by component-level
        // listeners that also handle keydown.
        if ((e.ctrlKey || e.metaKey) && /^[1-6]$/.test(e.key)) {
            // W7ks1-F1: narrow form — Ctrl/Cmd+1-6 fires from focused buttons/anchors.
            if (isTextInputField) return
            e.preventDefault()
            const modeId = KEY_TO_MODE[e.key]
            if (!modeId) return
            const hasSelection = navStore().focusedIndex != null
            // HIGH-1 (ocw_ui_fix_2026-07-07): enforce the same selection lock
            // the Header chips and CompassRail use, so a user with no focused
            // business can't enter a selection-dependent mode (focus / inside /
            // trail) via the keyboard. Mirrors the selectMode() guard without
            // depending on the Header module (which is edited concurrently).
            if (isModeLocked(modeId, hasSelection)) {
                showExperienceToast('Mode locked', 'Select a business first to use this view.')
                return
            }
            // Keep journeyStore().phase in lockstep with the mode. This must run
            // before the switch because Ctrl+5's ENTER_INSIDE mirror reads it.
            setJourneyPhase(modeId === 'map' ? 'overview' : modeId)

            switch (e.key) {
                case '1':
                    dispatchNavTransition(NAV_TRANSITION_ACTIONS.RETURN_OVERVIEW)
                    updateUrlState({}, { reason: 'keyboard-shortcut-1' })
                    break
                case '2':
                    dispatchNavTransition(NAV_TRANSITION_ACTIONS.SET_SURFACE, { surface: 'search' })
                    updateUrlState({ surface: 'search' }, { reason: 'keyboard-shortcut-2' })
                    break
                case '3':
                    // surface enum is currently loose; `trail` is
                    // intentionally narrow-typed as `any` here until
                    // the navigation surface union is tightened.
                    dispatchNavTransition(NAV_TRANSITION_ACTIONS.SET_SURFACE, { surface: 'trail' })
                    updateUrlState({ surface: 'trail' }, { reason: 'keyboard-shortcut-3' })
                    break
                case '4':
                    dispatchNavTransition(NAV_TRANSITION_ACTIONS.SET_SURFACE, { surface: 'focus' })
                    updateUrlState({ surface: 'focus' }, { reason: 'keyboard-shortcut-4' })
                    break
                case '5':
                    dispatchNavTransition(NAV_TRANSITION_ACTIONS.SET_SURFACE, { surface: 'inside' })
                    updateUrlState({ surface: 'inside' }, { reason: 'keyboard-shortcut-5' })
                    // KH-INSIDE-SHORTCUT-FIX (2026-07-29): Ctrl+5 must also
                    // activate the semantic-dive surface, matching the Header
                    // chip click path (Header.svelte L64). Without this call
                    // setSemanticDiveMode(true) + journeySetTrailDepth(2) are
                    // never reached and the inside/pocket view stays inert.
                    executeJourneyCompassAction(JOURNEY_ACTIONS.ENTER_INSIDE)
                    break
                case '6':
                    dispatchNavTransition(NAV_TRANSITION_ACTIONS.SET_VIEW, { view: 'map' })
                    dispatchNavTransition(NAV_TRANSITION_ACTIONS.SET_SURFACE, { surface: 'map' })
                    updateUrlState({ view: 'map', surface: 'map' }, { reason: 'keyboard-shortcut-6' })
                    break
            }

            return
        }

        // `/` focuses the search input (P1).
        if (e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey && !isFormField && !e.repeat) {
            e.preventDefault()
            document.getElementById('search-input')?.focus()
            return
        }

        // `?` or Shift+/ opens the keyboard shortcuts overlay (A2-7).
        // Was missing from the Svelte port — Round 2/3 QA flagged it.
        if (
            (e.key === '?' || (e.key === '/' && e.shiftKey)) &&
            !e.metaKey &&
            !e.ctrlKey &&
            !e.altKey &&
            !isFormField &&
            !e.repeat
        ) {
            e.preventDefault()
            initKeyboardShortcutsHint()
            showKeyboardShortcutsHint()
            return
        }

        // `w` toggles weather widget visibility.
        if (e.key === 'w' && !e.metaKey && !e.ctrlKey && !e.altKey && !isFormField && !e.repeat) {
            e.preventDefault()
            options.toggleWeather()
            return
        }

        // `m` toggles audio mute (optional — caller may omit it).
        if (e.key === 'm' && !e.metaKey && !e.ctrlKey && !e.altKey && !isFormField && !e.repeat) {
            if (options.toggleAudioMute) {
                e.preventDefault()
                options.toggleAudioMute()
                return
            }
        }

        // `Escape`: A2-4 always returns to Overview from any non-idle
        // mode. Clear search input as a side effect. preventDefault()
        // preserves app-side return-to-overview — without it, the
        // browser's default back-nav fires AFTER the handler and
        // overwrites the page to about:blank (Visual QA Round 3 finding).
        if (e.key === 'Escape') {
            // W7ks1-F1: narrow form — Escape return-to-overview fires from
            // focused buttons/anchors (regression fix).
            if (isTextInputField) return
            // W47-c: If a <dialog open> is on screen, let the browser's
            // native cancel handler close it. Without this early return,
            // our preventDefault() below would suppress the dialog's
            // built-in Escape handler, leaving the modal stuck (audited
            // against the help-dialog in src/components/Header.svelte).
            const openDialog = document.querySelector('dialog[open]')
            if (openDialog) {
                return
            }
            e.preventDefault()
            // H-4 (bugsweep): clear the search query through the store, not
            // direct DOM mutation, so the Svelte $state and the DOM stay in sync.
            setSearchQuery('')
            updateUrlState({ q: null, offset: null }, { reason: 'escape-clear' })
            const { mode, surface } = navStore()
            if (mode !== 'overview' || surface !== 'idle') {
                dispatchNavTransition(NAV_TRANSITION_ACTIONS.RETURN_OVERVIEW)
                // Escape-from-map stale URL fix: the escape-clear write above runs
                // BEFORE the view flips (currentView is still 'map'), so it leaves
                // view=map in the URL; RETURN_OVERVIEW flips currentView to galaxy
                // but does not write the URL. Re-sync after the flip so the URL
                // drops ?view=map (mirrors MapView.returnToOverview's post-dispatch
                // updateUrlState; found by the F5.4 journey test — reloading with a
                // stale view=map booted users back into map).
                updateUrlState({}, { reason: 'escape-return-overview' })
            }
        }
    }

    window.addEventListener('keydown', handleGlobalKeydown)
    return () => window.removeEventListener('keydown', handleGlobalKeydown)
}
