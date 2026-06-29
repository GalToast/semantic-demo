/**
 * @lib/orchestration/url-params.ts — URL / location parameter helpers
 *
 * Extracted from url-state.ts so tests can inject mocked URL search params
 * and DOM surface state without relying on jsdom's incomplete history
 * implementation or global document access.
 */

import { get } from 'svelte/store'
import { navStore } from '@lib/stores/navigation.svelte.ts'

export function getSearchParams(): URLSearchParams {
    if (typeof window === 'undefined') return new URLSearchParams()
    return new URLSearchParams(window.location.search || '')
}

export function getLocationHref(): string {
    if (typeof window === 'undefined') return ''
    return window.location.href
}

export function getLocationPathname(): string {
    if (typeof window === 'undefined') return '/'
    return window.location.pathname || '/'
}

export function isDomForcedFocusSearchSurface(): boolean {
    if (typeof document === 'undefined' || !document.body) return false
    const nav = get(navStore)
    return (
        document.body.dataset.focusSearchForced === 'true' ||
        (nav.surface === 'focus-search' && document.body.dataset.journeyPhase === 'search')
    )
}
