import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

import { Z_LAYERS } from '../../src/lib/z-index'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..', '..')

const read = (rel: string) => readFileSync(path.resolve(root, rel), 'utf8')

/**
 * t1 — --z-loading z-index drift regression.
 *
 * Canonical source of truth:
 *   - src/lib/z-index.ts      -> Z_LAYERS.loading === 9999
 *   - src/lib/css/z-layers.css -> --z-loading: 9999
 *
 * Three other sources previously drifted to 3000. This test pins them all to
 * 9999 so a future re-drift fails loudly instead of silently dropping the
 * loading overlay below other stacking contexts.
 */
describe('t1 --z-loading token canonical value (9999)', () => {
    it('src/lib/z-index.ts exposes Z_LAYERS.loading === 9999', () => {
        expect(Z_LAYERS.loading).toBe(9999)
    })

    it('css/base.css declares --z-loading: 9999 (not 3000)', () => {
        const css = read('css/base.css')
        expect(css).toMatch(/--z-loading:\s*9999\s*;/)
        expect(css).not.toMatch(/--z-loading:\s*3000\s*;/)
    })

    it('src/app.html declares --z-loading: 9999 (not 3000)', () => {
        const html = read('src/app.html')
        expect(html).toMatch(/--z-loading:\s*9999\s*;/)
        expect(html).not.toMatch(/--z-loading:\s*3000\s*;/)
    })

    it('src/index.html declares --z-loading: 9999 (not 3000)', () => {
        const html = read('src/index.html')
        expect(html).toMatch(/--z-loading:\s*9999\s*;/)
        expect(html).not.toMatch(/--z-loading:\s*3000\s*;/)
    })
})
