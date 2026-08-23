/**
 * url-mode-dormant-carveout.test.ts
 *
 * Regression: myceliumMode starts as 'dormant' (initial renderer state,
 * navigation-state.ts). The URL writer and share-copy treated anything
 * !== 'default' as intent-worthy, so the FIRST updateUrlState of any boot
 * that hadn't transitioned yet baked mode=dormant into the URL — where it
 * rode along every subsequent pushState (bug-catalog #4 "mode=dormant
 * persists"). Both writers must carve out 'dormant' exactly like 'default',
 * matching hasRestorableUrlState's existing dormant ignore in url-params.ts.
 *
 * Run: npx vitest run tests/unit-active/url-mode-dormant-carveout.test.ts
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const WRITER = resolve(__dirname, '../../src/lib/orchestration/url-writer.ts')
const SHARE = resolve(__dirname, '../../src/lib/orchestration/share-copy.ts')
const PARAMS = resolve(__dirname, '../../src/lib/orchestration/url-params.ts')

describe('mode=dormant never persists into URLs or share links', () => {
    it('url-writer skips dormant like default', () => {
        const src = readFileSync(WRITER, 'utf-8')
        expect(src).toMatch(/myceliumMode !== 'default' && \$nav\.myceliumMode !== 'dormant'/)
    })

    it('share-copy skips dormant like default', () => {
        const src = readFileSync(SHARE, 'utf-8')
        expect(src).toMatch(/myceliumMode !== 'default' && \$nav\.myceliumMode !== 'dormant'/)
    })

    it('hasRestorableUrlState keeps ignoring dormant (restore side)', () => {
        const src = readFileSync(PARAMS, 'utf-8')
        expect(src).toMatch(/key === 'mode' && params\.get\(key\) === 'dormant'/)
    })
})
