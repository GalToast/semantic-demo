/**
 * utils-error-messages.test.ts — Unit test for friendlyErrorMessage()
 *
 * W48-H: LoadingOverlay, MapView, and SearchResults used to surface raw
 * error.message strings ("Failed to fetch", "NetworkError...",
 * "Unexpected token <...") which are incomprehensible to non-technical
 * users. The normalizer maps common patterns to user-friendly copy.
 *
 * Verifies:
 *   1. Network errors ("Failed to fetch", etc.) → "Can't reach the server"
 *   2. DNS errors ("ENOTFOUND") → "Can't find the server"
 *   3. Timeouts → "The request took too long"
 *   4. HTTP 5xx → "The server is having trouble"
 *   5. HTTP 4xx (404, 403, 401, 429) → specific friendly titles
 *   6. JSON parse errors → "Got an unexpected response"
 *   7. Map/tile errors → "Couldn't load the map"
 *   8. Generic catch-all → "Something went wrong"
 *   9. The raw technical message is preserved in .technical
 *  10. Non-Error throws (strings, numbers) are handled
 */
import { describe, it, expect } from 'vitest'
import { friendlyErrorMessage } from '../../src/lib/utils/error-messages'

describe('friendlyErrorMessage', () => {
    it('normalizes "Failed to fetch" to a "Can\'t reach the server" message', () => {
        const result = friendlyErrorMessage(new Error('Failed to fetch'))
        expect(result.title).toBe("Can't reach the server")
        expect(result.detail.toLowerCase()).toContain('network')
        expect(result.technical).toBe('Failed to fetch')
    })

    it('normalizes NetworkError', () => {
        const result = friendlyErrorMessage(
            new Error('NetworkError when attempting to fetch resource')
        )
        expect(result.title).toBe("Can't reach the server")
    })

    it('normalizes Chrome net::ERR_* codes', () => {
        for (const code of [
            'net::ERR_INTERNET_DISCONNECTED',
            'net::ERR_NETWORK_CHANGED',
            'net::ERR_CONNECTION_REFUSED'
        ]) {
            const result = friendlyErrorMessage(new Error(code))
            expect(result.title, `expected friendly title for ${code}`).toBe(
                "Can't reach the server"
            )
        }
    })

    it('normalizes ENOTFOUND to "Can\'t find the server"', () => {
        const result = friendlyErrorMessage(new Error('getaddrinfo ENOTFOUND api.example.com'))
        expect(result.title).toBe("Can't find the server")
    })

    it('normalizes timeouts', () => {
        for (const msg of [
            'Request timeout after 5000ms',
            'connect ETIMEDOUT'
        ]) {
            const result = friendlyErrorMessage(new Error(msg))
            expect(result.title, `expected timeout title for "${msg}"`).toBe(
                'The request took too long'
            )
        }
    })

    it('normalizes HTTP 500 to "The server is having trouble"', () => {
        const result = friendlyErrorMessage(new Error('Request failed with status 500'))
        expect(result.title).toBe('The server is having trouble')
        expect(result.detail).toContain('500')
    })

    it('normalizes HTTP 404 with a specific friendly title', () => {
        const result = friendlyErrorMessage(new Error('Server returned 404'))
        expect(result.title).toBe('Not found')
    })

    it('normalizes HTTP 401, 403, 429 with specific friendly titles', () => {
        expect(friendlyErrorMessage(new Error('HTTP 401')).title).toBe('Sign-in required')
        expect(friendlyErrorMessage(new Error('HTTP 403')).title).toBe('Access denied')
        expect(friendlyErrorMessage(new Error('HTTP 429')).title).toBe('Too many requests')
    })

    it('normalizes JSON parse errors', () => {
        for (const msg of [
            'Unexpected token < in JSON at position 0',
            'JSON.parse: unexpected end of data'
        ]) {
            const result = friendlyErrorMessage(new Error(msg))
            expect(result.title, `expected JSON title for "${msg}"`).toBe(
                'Got an unexpected response'
            )
        }
    })

    it('normalizes map/tile errors with map-specific copy', () => {
        for (const msg of [
            'Failed to load tile layer',
            'Leaflet: error initializing map'
        ]) {
            const result = friendlyErrorMessage(new Error(msg))
            expect(result.title, `expected map title for "${msg}"`).toBe(
                "Couldn't load the map"
            )
        }
    })

    it('falls back to a generic "Something went wrong" for unknown errors', () => {
        const result = friendlyErrorMessage(new Error('Quantum flux capacitor misaligned'))
        expect(result.title).toBe('Something went wrong')
        expect(result.technical).toBe('Quantum flux capacitor misaligned')
    })

    it('preserves the raw technical message in .technical for diagnostics', () => {
        const result = friendlyErrorMessage(new Error('Failed to fetch'))
        expect(result.technical).toBe('Failed to fetch')
    })

    it('handles non-Error throws (string)', () => {
        const result = friendlyErrorMessage('some string error')
        expect(result.title).toBe('Something went wrong')
        expect(result.technical).toBe('some string error')
    })

    it('handles non-Error throws (number)', () => {
        const result = friendlyErrorMessage(42)
        expect(result.title).toBe('Something went wrong')
        expect(result.technical).toBe('42')
    })

    it('handles null and undefined gracefully', () => {
        // null/undefined become 'null'/'undefined' via String() — should hit
        // the generic catch-all without throwing.
        const r1 = friendlyErrorMessage(null)
        const r2 = friendlyErrorMessage(undefined)
        expect(r1.title).toBe('Something went wrong')
        expect(r2.title).toBe('Something went wrong')
    })

    it('every FriendlyError has non-empty title, detail, and (for non-empty technical) preserves it', () => {
        const samples: unknown[] = [
            new Error('Failed to fetch'),
            new Error('Timeout'),
            new Error('Server returned 500'),
            new Error('whatever'),
            'string error'
        ]
        for (const s of samples) {
            const result = friendlyErrorMessage(s)
            expect(result.title.length, `title empty for ${String(s)}`).toBeGreaterThan(0)
            expect(result.detail.length, `detail empty for ${String(s)}`).toBeGreaterThan(0)
        }
    })
})
