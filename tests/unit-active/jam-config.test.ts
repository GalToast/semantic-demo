/**
 * Unit tests for jam-config: default endpoints resolve in the test
 * environment and trailing slashes are normalized.
 */
import { describe, it, expect } from 'vitest'
import { JAM_WS_URL, JAM_HTTP_URL } from '../../src/lib/audio/jam-config'

describe('jam-config', () => {
    it('defaults to the same-box jam WebSocket endpoint (trailing slash normalized)', () => {
        expect(JAM_WS_URL).toBe('ws://127.0.0.1:8083')
    })
    it('defaults to the same-box jam HTTP base without a trailing slash', () => {
        expect(JAM_HTTP_URL).toBe('http://127.0.0.1:8083')
        expect(JAM_HTTP_URL.endsWith('/')).toBe(false)
    })
    it('HTTP base safely accepts appended paths', () => {
        expect(`${JAM_HTTP_URL}/style`).toBe('http://127.0.0.1:8083/style')
    })
})
