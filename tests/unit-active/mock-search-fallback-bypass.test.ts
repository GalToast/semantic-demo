/**
 * mock-search-fallback-bypass.test.ts — Time-bounded `api_unreachable` flag
 *
 * Verifies PR-M: the previously-permanent sticky bypass flag now expires
 * after API_BYPASS_STICKY_MS (60s) and clears on the next successful API
 * response, so transient dev-server restarts don't lock the tab into
 * mock-catalog mode for the rest of the session.
 *
 * Surface coverage:
 *   1. markApiUnreachable writes a JSON record with setAt + reason
 *   2. readApiUnreachable returns the record while fresh
 *   3. readApiUnreachable returns null after expiry
 *   4. readApiUnreachable returns null for the legacy '1' format (backward compat)
 *   5. readApiUnreachable returns null and self-cleans unparseable garbage
 *   6. shouldBypassApiSearch returns true after markApiUnreachable
 *   7. shouldBypassApiSearch returns false after clearApiUnreachable
 *   8. shouldBypassApiSearch honours ?staticDev=0 (forces live, never bypass)
 *   9. shouldBypassApiSearch honours ?offline=1 (and stores as url-param reason)
 *  10. shouldBypassApiSearch respects API_BYPASS_STICKY_MS expiry boundary
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

import {
    markApiUnreachable,
    clearApiUnreachable,
    readApiUnreachable,
    shouldBypassApiSearch,
    API_BYPASS_STICKY_MS
} from '../../src/lib/search/mock-search-fallback'

// helper to set the URL search string in JSDOM
function setUrlSearch(search: string): void {
    const url = new URL(window.location.href)
    url.search = search
    window.history.replaceState({}, '', url.toString())
}

describe('mock-search-fallback bypass (PR-M time-bounded flag)', () => {
    beforeEach(() => {
        clearApiUnreachable()
        setUrlSearch('')
    })

    afterEach(() => {
        clearApiUnreachable()
        setUrlSearch('')
        vi.useRealTimers()
    })

    it('writes a JSON record with setAt + reason on markApiUnreachable', () => {
        const before = Date.now()
        markApiUnreachable('Semantic search returned raw PHP source.')
        const after = Date.now()

        const raw = window.sessionStorage.getItem('api_unreachable')
        expect(raw).not.toBeNull()
        expect(raw).not.toBe('1') // legacy format must not return

        const parsed = JSON.parse(raw!) as { setAt: number; reason: string }
        expect(parsed.setAt).toBeGreaterThanOrEqual(before)
        expect(parsed.setAt).toBeLessThanOrEqual(after)
        expect(parsed.reason).toBe('Semantic search returned raw PHP source.')
    })

    it('readApiUnreachable returns the record while fresh', () => {
        markApiUnreachable('test')
        const record = readApiUnreachable()
        expect(record).not.toBeNull()
        expect(record!.reason).toBe('test')
        expect(typeof record!.setAt).toBe('number')
    })

    it('readApiUnreachable returns null after API_BYPASS_STICKY_MS', () => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date('2026-06-30T12:00:00Z'))
        markApiUnreachable('will-expire')

        // Advance just before the boundary — still fresh
        vi.setSystemTime(new Date('2026-06-30T12:00:00Z').getTime() + API_BYPASS_STICKY_MS - 1)
        expect(readApiUnreachable()).not.toBeNull()

        // Advance past the boundary — expired
        vi.setSystemTime(new Date('2026-06-30T12:00:00Z').getTime() + API_BYPASS_STICKY_MS + 1)
        expect(readApiUnreachable()).toBeNull()
    })

    it('readApiUnreachable returns null for the legacy "1" format (backward compat)', () => {
        // Pre-PR-M sessions may have sessionStorage with the literal '1'.
        // Treat as expired so the next markApiUnreachable writes a fresh
        // timestamped record rather than leaving the tab permanently locked.
        window.sessionStorage.setItem('api_unreachable', '1')
        expect(readApiUnreachable()).toBeNull()
    })

    it('readApiUnreachable returns null and self-cleans unparseable garbage', () => {
        window.sessionStorage.setItem('api_unreachable', 'not-json-{')
        expect(readApiUnreachable()).toBeNull()
        expect(window.sessionStorage.getItem('api_unreachable')).toBeNull()
    })

    it('readApiUnreachable returns null when the stored record is missing required fields', () => {
        window.sessionStorage.setItem('api_unreachable', JSON.stringify({ foo: 'bar' }))
        expect(readApiUnreachable()).toBeNull()
    })

    it('shouldBypassApiSearch returns true after markApiUnreachable', () => {
        markApiUnreachable('test')
        expect(shouldBypassApiSearch()).toBe(true)
    })

    it('shouldBypassApiSearch returns false after clearApiUnreachable', () => {
        markApiUnreachable('test')
        clearApiUnreachable()
        expect(shouldBypassApiSearch()).toBe(false)
    })

    it('shouldBypassApiSearch honours ?staticDev=0 (forces live, never bypass)', () => {
        markApiUnreachable('test')
        setUrlSearch('?staticDev=0')
        expect(shouldBypassApiSearch()).toBe(false)
    })

    it('shouldBypassApiSearch honours ?offline=1 (permanent bypass, no sticky flag)', () => {
        setUrlSearch('?offline=1')
        expect(shouldBypassApiSearch()).toBe(true)
        // URL params are an explicit, permanent bypass — they must NOT write
        // the transient 60s sticky flag (see mock-search-fallback.ts comment).
        const record = readApiUnreachable()
        expect(record).toBeNull()
    })

    it('shouldBypassApiSearch respects expiry on the next read after 60s', () => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date('2026-06-30T12:00:00Z'))
        markApiUnreachable('transient-down')
        expect(shouldBypassApiSearch()).toBe(true)

        // Simulate the dev restarting the backend
        vi.setSystemTime(new Date('2026-06-30T12:00:00Z').getTime() + API_BYPASS_STICKY_MS + 5000)
        expect(shouldBypassApiSearch()).toBe(false)
    })

    it('API_BYPASS_STICKY_MS is 60s (documented dev-loop budget)', () => {
        expect(API_BYPASS_STICKY_MS).toBe(60_000)
    })
})
