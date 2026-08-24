/**
 * @lib/stores/engine-ready.svelte.ts — Engine readiness gate (W6-T1)
 *
 * Flipped to true by first user gesture; consumed by Canvas.svelte
 * and Splash.svelte. Uses Svelte 5 $state rune for fine-grained
 * reactivity without a full writable store.
 *
 * @example
 *   import { engineReady } from '@lib/stores/engine-ready.svelte';
 *   if (engineReady.value) { /* engine can init *\/ }
 *   engineReady.signalReady();
 */

import { setRenderKind } from '@lib/orchestration/parity-attrs.svelte'

// ── State ────────────────────────────────────────────────────────────────────

const READY_SESSION_KEY = 'semantic-explorer.engineReady'
// W51-UX-6: persist the ready flag across HMR remounts so dev sessions
// don't re-show the splash dialog after every Vite save. The flag is
// session-scoped so a fresh browser tab still sees the splash (intentional
// first-visit behavior). Production builds read this exactly once at
// module init; subsequent user gestures go through signalReady() which
// stays idempotent.
function readPersistedReady(): boolean {
    if (typeof sessionStorage === 'undefined') return false
    try {
        return sessionStorage.getItem(READY_SESSION_KEY) === '1'
    } catch {
        return false
    }
}

let _value = $state(readPersistedReady())
const _subscribers = new Set<(_v: boolean) => void>()

function signalReady(): void {
    if (_value) return
    _value = true
    // W46-F1: once the engine is ready the mobile 2D placeholder is no longer
    // shown, so flip the body data attribute to 'webgl'. This unblocks the
    // legend (and any other CSS gated on render-kind) after the user enters
    // the 3D scene.
    //
    // W51 fix (2026-08-24): an EXPLICIT ?placeholder=1 URL pin beats the
    // readiness flip. Automated boots (contract-boot / webdriver auto-signal)
    // fire signalReady during mount, and the unconditional flip here made the
    // pinned placeholder2d class unobservable — every CI run timed out in
    // widget-journey W51-mobile-h1 while local D3D11 runs passed. Real users
    // never carry the param, so production behavior is unchanged.
    let placeholderPinned = false
    try {
        if (typeof window !== 'undefined') {
            placeholderPinned = new URLSearchParams(window.location.search).get('placeholder') === '1'
        }
    } catch {
        /* no window (SSR) — nothing to guard */
    }
    if (!placeholderPinned) {
        setRenderKind('webgl')
    }
    // W51-UX-6: persist the ready flag so HMR remounts don't re-fire the splash.
    if (typeof sessionStorage !== 'undefined') {
        try {
            sessionStorage.setItem(READY_SESSION_KEY, '1')
        } catch {
            // sessionStorage may throw in sandboxed contexts (e.g. private
            // mode in some browsers). The ready flag still works for the
            // current mount; we just lose the HMR-survival benefit.
        }
    }
    for (const fn of _subscribers) {
        fn(_value)
    }
}

/** Read-only accessor for the ready flag. */
function getReady(): boolean {
    return _value
}

export const engineReady = {
    /** Subscribe-compatible accessor — reads the current $state value. */
    get value(): boolean {
        return _value
    },
    /** Set to true once (idempotent). Triggers reactive subscriptions. */
    signalReady,
    /** Named getter for compatibility with $store patterns. */
    getReady,
    /** Store-compatible subscription. Immediately invokes with current value and re-invokes on change. */
    subscribe(fn: (_v: boolean) => void) {
        fn(_value)
        _subscribers.add(fn)
        return () => {
            _subscribers.delete(fn)
        }
    }
}
