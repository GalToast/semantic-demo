/**
 * prod-root-align.test.ts — Unit tests for scripts/prod-root-align.mjs
 *
 * Covers:
 *   (A) Happy-path: index.html + case-study.html present → ROOT-MAP written.
 *   (B) Rename: a misnamed landing page gets renamed to case-study.html.
 *   (C) Legacy aliases: vector-explorer-* files are documented, not moved.
 *   (D) No root confusion: '/' serves the app, '/case-study' serves landing.
 *   (E) Missing app: throws with a clear message.
 *   (F) Idempotency: re-running on an already-aligned dist is a no-op.
 */

import { describe, it, expect } from 'vitest'
import {
    mkdirSync,
    rmSync,
    writeFileSync,
    readFileSync,
    existsSync
} from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { alignProdRoot } from '../../scripts/prod-root-align.mjs'

const FIXTURE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../tmp/perf9/prod-root-align-fixture')

/**
 * Build a minimal fixture dist at fixturePath with the given HTML files.
 */
function buildFixture(fixturePath, files) {
    rmSync(fixturePath, { recursive: true, force: true })
    mkdirSync(fixturePath, { recursive: true })
    for (const [name, content] of Object.entries(files)) {
        writeFileSync(join(fixturePath, name), content, 'utf-8')
    }
}

/**
 * Read and parse ROOT-MAP.json from a fixture dist.
 */
function readRootMap(fixturePath) {
    const raw = readFileSync(join(fixturePath, 'ROOT-MAP.json'), 'utf-8')
    return JSON.parse(raw)
}

describe('prod-root-align', () => {
    afterEach(() => {
        // Clean up fixture after each test so tests are isolated.
        if (existsSync(FIXTURE_ROOT)) {
            rmSync(FIXTURE_ROOT, { recursive: true, force: true })
        }
    })

    it('(A) happy-path: app at root, landing at case-study, ROOT-MAP written', () => {
        const fixture = join(FIXTURE_ROOT, 'a-happy')
        buildFixture(fixture, {
            'index.html': '<!doctype html><html><head><title>App</title></head><body>SPA</body></html>',
            'case-study.html': '<!doctype html><html><head><title>Landing</title></head><body>Case Study</body></html>'
        })

        const result = alignProdRoot(fixture)

        expect(result.rootApp).toBe(true)
        expect(result.landingPath).toBe('case-study.html')
        expect(result.aliases).toEqual([])

        const map = readRootMap(fixture)
        expect(map).toEqual({
            rootApp: true,
            landingPath: 'case-study.html',
            aliases: []
        })

        // Verify the files still exist.
        expect(existsSync(join(fixture, 'index.html'))).toBe(true)
        expect(existsSync(join(fixture, 'case-study.html'))).toBe(true)
    })

    it('(B) rename: misnamed landing page gets renamed to case-study.html', () => {
        const fixture = join(FIXTURE_ROOT, 'b-rename')
        buildFixture(fixture, {
            'index.html': '<!doctype html><html><head><title>App</title></head><body>SPA</body></html>',
            'landing.html': '<!doctype html><html><head><title>Landing</title></head><body>Old Name</body></html>'
        })

        const result = alignProdRoot(fixture)

        expect(result.landingPath).toBe('case-study.html')
        expect(existsSync(join(fixture, 'case-study.html'))).toBe(true)
        expect(existsSync(join(fixture, 'landing.html'))).toBe(false)
    })

    it('(C) legacy aliases: vector-explorer-* files documented, not moved', () => {
        const fixture = join(FIXTURE_ROOT, 'c-aliases')
        buildFixture(fixture, {
            'index.html': '<!doctype html><html><head><title>App</title></head><body>SPA</body></html>',
            'case-study.html': '<!doctype html><html><head><title>Landing</title></head><body>Case Study</body></html>',
            'vector-explorer-pandora.css': '/* legacy CSS alias */',
            'vector-explorer-old.html': '<!doctype html><html><head><title>Old Alias</title></head><body>Legacy</body></html>'
        })

        const result = alignProdRoot(fixture)

        const map = readRootMap(fixture)
        expect(map.aliases).toHaveLength(2)
        expect(map.aliases.map((a) => a.file)).toContain('vector-explorer-pandora.css')
        expect(map.aliases.map((a) => a.file)).toContain('vector-explorer-old.html')

        // Legacy files must still exist on disk — script does NOT delete them.
        expect(existsSync(join(fixture, 'vector-explorer-pandora.css'))).toBe(true)
        expect(existsSync(join(fixture, 'vector-explorer-old.html'))).toBe(true)
    })

    it('(D) no root confusion: app is the only root HTML, landing is separate', () => {
        const fixture = join(FIXTURE_ROOT, 'd-no-confusion')
        buildFixture(fixture, {
            'index.html': '<!doctype html><html><head><title>App</title></head><body>SPA</body></html>',
            'case-study.html': '<!doctype html><html><head><title>Landing</title></head><body>Case Study</body></html>'
        })

        alignProdRoot(fixture)

        const map = readRootMap(fixture)
        // Root is unambiguous: rootApp flag is true, landing path is explicit.
        expect(map.rootApp).toBe(true)
        expect(map.landingPath).toBe('case-study.html')
        // There is no 'case-study' ambiguity at root — index.html owns '/'.
        expect(map.aliases.every((a) => !a.file.startsWith('case-study'))).toBe(true)
    })

    it('(E) missing app: throws with clear message', () => {
        const fixture = join(FIXTURE_ROOT, 'e-missing-app')
        buildFixture(fixture, {
            'case-study.html': '<!doctype html><html><body>Landing</body></html>'
        })

        expect(() => alignProdRoot(fixture)).toThrow('index.html (the app) not found')
    })

    it('(F) idempotency: re-running on already-aligned dist is a no-op', () => {
        const fixture = join(FIXTURE_ROOT, 'f-idempotent')
        buildFixture(fixture, {
            'index.html': '<!doctype html><html><head><title>App</title></head><body>SPA</body></html>',
            'case-study.html': '<!doctype html><html><head><title>Landing</title></head><body>Case Study</body></html>'
        })

        // First run.
        const r1 = alignProdRoot(fixture)
        const map1 = readRootMap(fixture)

        // Second run — should produce identical results.
        const r2 = alignProdRoot(fixture)
        const map2 = readRootMap(fixture)

        expect(r2.rootApp).toEqual(r1.rootApp)
        expect(r2.landingPath).toEqual(r1.landingPath)
        expect(r2.aliases).toEqual(r1.aliases)
        expect(map2).toEqual(map1)
    })
})
