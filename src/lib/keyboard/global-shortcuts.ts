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
import { initKeyboardShortcutsHint, showKeyboardShortcutsHint } from './keyboard-help'
import { updateUrlState } from '@lib/orchestration/url-state'

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
        const isFormField =
            tag === 'input' || tag === 'textarea' || tag === 'select' || target?.isContentEditable === true

        // Ctrl/Cmd+1-6: mode switching (A2-4). Fires before all other
        // handlers so shortcuts are never masked by component-level
        // listeners that also handle keydown.
        if ((e.ctrlKey || e.metaKey) && /^[1-6]$/.test(e.key)) {
            if (isFormField) return
            e.preventDefault()
            switch (e.key) {
                case '1':
                    dispatchNavTransition(NAV_TRANSITION_ACTIONS.RETURN_OVERVIEW)
                    break
                case '2':
                    dispatchNavTransition(NAV_TRANSITION_ACTIONS.SET_SURFACE, { surface: 'search' })
                    break
                case '3':
                    // surface enum is currently loose; `trail` is
                    // intentionally narrow-typed as `any` here until
                    // the navigation surface union is tightened.
                    dispatchNavTransition(NAV_TRANSITION_ACTIONS.SET_SURFACE, { surface: 'trail' })
                    break
                case '4':
                    dispatchNavTransition(NAV_TRANSITION_ACTIONS.SET_SURFACE, { surface: 'focus' })
                    break
                case '5':
                    dispatchNavTransition(NAV_TRANSITION_ACTIONS.SET_SURFACE, { surface: 'inside' })
                    break
                case '6':
                    dispatchNavTransition(NAV_TRANSITION_ACTIONS.SET_VIEW, { view: 'map' })
                    dispatchNavTransition(NAV_TRANSITION_ACTIONS.SET_SURFACE, { surface: 'map' })
                    break
            }
            return
        }

        // `/` focuses the search input (P1).
        if (e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey && !isFormField) {
            e.preventDefault()
            document.getElementById('search-input')?.focus()
            return
        }

        // `?` or Shift+/ opens the keyboard shortcuts overlay (A2-7).
        // Was missing from the Svelte port — Round 2/3 QA flagged it.
        if ((e.key === '?' || (e.key === '/' && e.shiftKey)) && !e.metaKey && !e.ctrlKey && !e.altKey && !isFormField) {
            e.preventDefault()
            initKeyboardShortcutsHint()
            showKeyboardShortcutsHint()
            return
        }

        // `w` toggles weather widget visibility.
        if (e.key === 'w' && !e.metaKey && !e.ctrlKey && !e.altKey && !isFormField) {
            e.preventDefault()
            options.toggleWeather()
            return
        }

        // `m` toggles audio mute (optional — caller may omit it).
        if (e.key === 'm' && !e.metaKey && !e.ctrlKey && !e.altKey && !isFormField) {
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
            e.preventDefault()
            const searchInput = document.getElementById('search-input') as HTMLInputElement | null
            if (searchInput) {
                searchInput.value = ''
                searchInput.dispatchEvent(new Event('input', { bubbles: true }))
            }
            const { mode, surface } = navStore()
            if (mode !== 'overview' || surface !== 'idle') {
                dispatchNavTransition(NAV_TRANSITION_ACTIONS.RETURN_OVERVIEW)
                // A2-7: after returning to overview, sync the URL to
                // reflect the galaxy view so the back button works
                // correctly.
                updateUrlState({}, { reason: 'return-overview' })
            }
        }
    }

    window.addEventListener('keydown', handleGlobalKeydown)
    return () => window.removeEventListener('keydown', handleGlobalKeydown)
}
