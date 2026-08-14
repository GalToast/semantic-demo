/**
 * data-worker-payload-validation.test.ts — Regression pin for farm audit 2026-08-14
 *
 * Bug: worker trusted `payload as { url: string }` blind casts and fed any
 * string into fetch() (open fetch proxy for file:/data:/javascript: and
 * malformed payloads threw mid-handler). Fix adds runtime validation:
 *   - LOAD_RECORDS / LOAD_LEAD_ENRICHMENT require an http(s) `url` string
 *   - LOAD_THREADS requires an `urls` array of http(s) strings
 * Validators live in the pure module data-worker-payload.ts (no Worker globals).
 */
import { describe, it, expect } from 'vitest'
import { isFetchableUrl, requireRecordUrl, requireThreadPayload } from '../../src/lib/workers/data-worker-payload'

describe('isFetchableUrl', () => {
    it('accepts http(s) urls', () => {
        expect(isFetchableUrl('https://example.com/data.dat')).toBe(true)
        expect(isFetchableUrl('http://127.0.0.1:8795/api/data.dat')).toBe(true)
    })

    it('rejects non-http schemes (open fetch proxy guard)', () => {
        expect(isFetchableUrl('file:///etc/passwd')).toBe(false)
        expect(isFetchableUrl('data:text/plain;base64,eA==')).toBe(false)
        expect(isFetchableUrl('javascript:alert(1)')).toBe(false)
        expect(isFetchableUrl('ftp://x/y')).toBe(false)
    })

    it('rejects non-strings / empty', () => {
        expect(isFetchableUrl(undefined)).toBe(false)
        expect(isFetchableUrl(null)).toBe(false)
        expect(isFetchableUrl(42)).toBe(false)
        expect(isFetchableUrl('')).toBe(false)
        expect(isFetchableUrl('not a url')).toBe(false)
    })
})

describe('requireRecordUrl', () => {
    it('returns the url for valid payloads', () => {
        expect(requireRecordUrl({ url: 'https://example.com/x' }, 'LOAD_RECORDS')).toBe('https://example.com/x')
    })

    it('throws on missing url', () => {
        expect(() => requireRecordUrl({}, 'LOAD_RECORDS')).toThrow(/http\(s\)/)
        expect(() => requireRecordUrl(null, 'LOAD_RECORDS')).toThrow(/http\(s\)/)
        expect(() => requireRecordUrl({ url: undefined }, 'LOAD_RECORDS')).toThrow(/http\(s\)/)
    })

    it('throws on non-http url (file/data/js/ftp)', () => {
        expect(() => requireRecordUrl({ url: 'file:///etc/passwd' }, 'LOAD_RECORDS')).toThrow(/http\(s\)/)
        expect(() => requireRecordUrl({ url: 'data:text/plain;base64,eA==' }, 'LOAD_RECORDS')).toThrow(/http\(s\)/)
        expect(() => requireRecordUrl({ url: 'javascript:alert(1)' }, 'LOAD_LEAD_ENRICHMENT')).toThrow(/http\(s\)/)
    })
})

describe('requireThreadPayload', () => {
    it('accepts valid urls + optional configs', () => {
        const out = requireThreadPayload({ urls: ['https://a.com'], attemptConfigs: ['fast', { cache: 'no-store' }] })
        expect(out.urls).toEqual(['https://a.com'])
        expect(out.attemptConfigs).toEqual(['fast', { cache: 'no-store' }])
    })

    it('tolerates missing attemptConfigs (defaults to [])', () => {
        expect(requireThreadPayload({ urls: ['https://a.com'] }).attemptConfigs).toEqual([])
    })

    it('throws on non-array urls', () => {
        expect(() => requireThreadPayload({ urls: 'nope' })).toThrow(/urls/)
        expect(() => requireThreadPayload({})).toThrow(/urls/)
        expect(() => requireThreadPayload(null)).toThrow(/urls/)
    })

    it('throws on an empty urls array', () => {
        expect(() => requireThreadPayload({ urls: [] })).toThrow(/non-empty/)
    })

    it('throws if any url is non-http', () => {
        expect(() => requireThreadPayload({ urls: ['https://ok.com', 'ftp://bad'] })).toThrow(/urls/)
    })

    it('throws on malformed attemptConfigs entries', () => {
        expect(() => requireThreadPayload({ urls: ['https://a.com'], attemptConfigs: [42] })).toThrow(/attemptConfigs/)
        expect(() => requireThreadPayload({ urls: ['https://a.com'], attemptConfigs: [null] })).toThrow(
            /attemptConfigs/
        )
    })
})
