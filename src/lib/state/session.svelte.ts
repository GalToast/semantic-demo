/**
 * @lib/state/session.svelte.ts — Per-session random seed (W47-B)
 *
 * Generated once per browser session and persisted in `localStorage` so the
 * user's "Discover" snippet stays stable across page reloads. Different
 * sessions (a different browser, a different profile, or `localStorage`
 * cleared) get a different seed → a different discovery snippet.
 *
 * Before this module existed, the discovery note in
 * `journey/compass-state.ts:229` was hardcoded to seed `42`. Every user
 * saw the same "Discover: {business}" snippet — a constant sample, not a
 * discovery. The word "discover" implied per-user surprise; the
 * implementation guaranteed the opposite.
 *
 * SSR-safe: returns 42 (the historical constant) when `window` is
 * undefined. Module-level so the seed is generated exactly once per
 * module load (which equals once per session for browser contexts).
 *
 * Exposed via `sessionSeed.value` (getter) so the value is read-only
 * from outside the module and matches the engineReady pattern.
 */

const SESSION_SEED_KEY = 'semantic-explorer.session-seed'

function getOrCreateSessionSeed(): number {
    if (typeof window === 'undefined') return 42
    try {
        const stored = window.localStorage?.getItem(SESSION_SEED_KEY)
        if (stored != null) {
            const parsed = Number(stored)
            if (Number.isFinite(parsed) && parsed > 0) return parsed
        }
        const fresh = Math.floor(Math.random() * 0x7fffffff) || 1
        window.localStorage?.setItem(SESSION_SEED_KEY, String(fresh))
        return fresh
    } catch {
        // localStorage disabled (sandboxed iframe, private mode with strict
        // settings, etc.) — fall back to the historical constant so the
        // module still loads and the app still works.
        return 42
    }
}

const _sessionSeed = $state(getOrCreateSessionSeed())

export const sessionSeed = {
    /** Current per-session seed. Stable across reloads; varies per session. */
    get value(): number {
        return _sessionSeed
    }
}

// Diagnostic exposure for journey tests (tests/widget-journey.spec.js
// Test 13). The test verifies that two separate browser contexts produce
// different session seeds. This is a side-channel read of `_sessionSeed`
// — not part of the production API. Production code should import
// `sessionSeed.value` from this module directly.
if (typeof window !== 'undefined') {
    window.__semanticExplorerSessionSeed = _sessionSeed
}
