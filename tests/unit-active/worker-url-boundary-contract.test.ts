/**
 * worker-url-boundary-contract.test.ts — Pin the Vite worker-URL import boundary.
 *
 * Verifies the active runtime boundary module (src/lib/workers/data-worker-url.ts)
 * satisfies its contract:
 *   - exports a non-empty string workerUrl
 *   - default export === named export
 *   - workerUrl references the data-worker by name in the actual observable shape
 *   - the worker source file exists on disk
 *
 * This test does NOT mock the boundary module. It asserts the real module
 * behavior in the current Vitest environment (jsdom + Vite transform).
 */

import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

// Resolve the worker source file relative to the project root.
const workerSourcePath = path.resolve('src/lib/workers/data-worker.ts')

describe('worker-url-boundary-contract', () => {
    it('exports a non-empty string workerUrl', async () => {
        const { workerUrl } = await import('@lib/workers/data-worker-url')
        expect(workerUrl).toBeTypeOf('string')
        expect(workerUrl.length).toBeGreaterThan(0)
    })

    it('default export equals named export', async () => {
        const mod = await import('@lib/workers/data-worker-url')
        expect(mod.default).toBe(mod.workerUrl)
    })

    it('workerUrl contains data-worker in its observable form', async () => {
        const { workerUrl } = await import('@lib/workers/data-worker-url')
        // In Vitest/jsdom the dynamic ?worker&url import may resolve to a
        // Vite-hashed URL or fall back to './assets/data-worker.js'. Either
        // observable shape must reference the data-worker by name.
        expect(workerUrl).toContain('data-worker')
    })

    it('worker source file exists on disk', () => {
        expect(fs.existsSync(workerSourcePath)).toBe(true)
    })
})
