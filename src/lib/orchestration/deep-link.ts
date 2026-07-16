/**
 * @lib/orchestration/deep-link.ts — session-stable deep-link classification.
 *
 * W47-UI bug #2: the first-visit Help dialog must NOT auto-open over a shared
 * deep-link target (the product's primary distribution path — a visitor
 * following a shared ?anchor=N / ?record=N / ?view=map / ?q≥2 link should land
 * on the exact business the link promised, not onboarding copy). HelpDialog.svelte
 * reads {@link isDeepLink} to skip auto-onboarding on those loads.
 *
 * Single source of truth: `isDeepLinkParams` in @lib/orchestration/responsive-renderer
 * (also used by main.ts parseUrlParams and demo.svelte.ts shouldRunDemo). This
 * module just snapshots it once at boot — deep-link status does not change during
 * a session, so no reactivity ($state) is needed.
 */

import { isDeepLinkParams } from '@lib/orchestration/responsive-renderer'

/**
 * True when the initial page load targeted a shared deep-link.
 * Resolved once at module evaluation from the current URL.
 */
export const isDeepLink: boolean = (() => {
    if (typeof window === 'undefined' || !window.location) return false
    return isDeepLinkParams(new URLSearchParams(window.location.search))
})()
