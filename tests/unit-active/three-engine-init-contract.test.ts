/**
 * three-engine initThreeJS() contract test
 * Ensures initThreeJS is exported and has the expected signature.
 */
import { describe, it, expect } from 'vitest'
import { initThreeJS } from '../../src/lib/engine/three-engine'

describe('initThreeJS contract', () => {
    it('is exported as an async function', () => {
        expect(typeof initThreeJS).toBe('function')
        // Async functions have a different prototype than regular functions
        expect(initThreeJS.constructor.name).toBe('AsyncFunction')
    })

    it('returns a Promise that rejects when #canvas-container is missing', async () => {
        // No canvas-container in the test environment; should throw
        await expect(initThreeJS()).rejects.toThrow('canvas-container')
    })
})
