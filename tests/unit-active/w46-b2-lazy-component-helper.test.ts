/**
 * @file w46-b2-lazy-component-helper.test.ts
 *
 * Structural contract tests for W46-B2a: lazy-component.svelte.ts helper
 * extraction. These verify the helper file exists, exports the expected
 * symbols, and matches the Svelte 5 rune conventions used elsewhere in the
 * codebase.
 *
 * Runtime behavior (actual load + component instantiation) is covered by
 * W46-B2b's App.svelte migration contract tests, since the consumer side is
 * where the helper is actually exercised end-to-end.
 */
import { describe, it, expect } from 'vitest'
// @ts-ignore
import { readFileSync } from 'node:fs'
// @ts-ignore
import { resolve } from 'node:path'

const HELPER_PATH = resolve(import.meta.dirname, '../../src/lib/utils/lazy-component.svelte.ts')
const src = readFileSync(HELPER_PATH, 'utf-8')

describe('W46-B2: lazy-component.svelte.ts helper exists with correct shape', () => {
    it('is a .svelte.ts file (required for $state rune compilation)', () => {
        expect(HELPER_PATH).toMatch(/lazy-component\.svelte\.ts$/)
    })

    it('exports createLazyComponent function', () => {
        expect(src).toMatch(/export\s+function\s+createLazyComponent\s*[<(]/)
    })

    it('exports scheduleIdleImport function', () => {
        expect(src).toMatch(/export\s+function\s+scheduleIdleImport\s*[<(]/)
    })

    it('exports LazyComponentOptions interface', () => {
        expect(src).toMatch(/export\s+interface\s+LazyComponentOptions\b/)
    })

    it('exports LazyComponentHandle interface', () => {
        expect(src).toMatch(/export\s+interface\s+LazyComponentHandle\b/)
    })
})

describe('W46-B2: createLazyComponent uses Svelte 5 runes correctly', () => {
    it('declares current as a $state<T | null>', () => {
        expect(src).toMatch(/let\s+current\s*=\s*\$state<T\s*\|\s*null>\(null\)/)
    })

    it('declares isPending as a $state boolean', () => {
        expect(src).toMatch(/let\s+isPending\s*=\s*\$state\(false\)/)
    })

    it('exposes current via a getter (preserves reactivity through handle boundary)', () => {
        expect(src).toMatch(/get\s+current\s*\(\s*\)\s*\{/)
    })

    it('exposes isPending via a getter', () => {
        expect(src).toMatch(/get\s+isPending\s*\(\s*\)\s*\{/)
    })

    it('ensure() guards against double-loading', () => {
        // Short-circuit when already loaded or loading
        expect(src).toMatch(/if\s*\(\s*current\s*!==\s*null\s*\|\|\s*isPending\s*\)\s*return/)
    })

    it('clearOnFalse option drops the cached component', () => {
        expect(src).toMatch(/clearOnFalse/)
    })

    it('logOnError option only logs in DEV mode', () => {
        expect(src).toMatch(/logOnError[\s\S]{0,200}?import\.meta\.env\.DEV/)
    })

    it('options.idle === false bypasses scheduleIdleImport', () => {
        expect(src).toMatch(/options\.idle\s*===\s*false\s*\?\s*doLoad\(\)/)
    })
})

describe('W46-B2: scheduleIdleImport handles all browser environments', () => {
    it('falls back to setTimeout when requestIdleCallback is unavailable', () => {
        expect(src).toContain("'requestIdleCallback' in window")
        expect(src).toContain('setTimeout(')
    })

    it('short-circuits in Playwright test environments', () => {
        expect(src).toContain('__PLAYWRIGHT__')
    })

    it('uses requestIdleCallback when available (with timeout fallback)', () => {
        expect(src).toMatch(/requestIdleCallback\([\s\S]{0,200}?timeout:\s*1500/)
    })
})

describe('W46-B2: error handling matches existing App.svelte patterns', () => {
    it('catches loader errors silently unless logOnError is set', () => {
        // .catch() chain present; log guarded by both options and DEV
        expect(src).toMatch(/\.catch\(/)
        expect(src).toMatch(/if\s*\(\s*options\.logOnError\s+&&\s+import\.meta\.env\.DEV\s*\)/)
    })

    it('clears isPending on both success and failure via .finally()', () => {
        expect(src).toMatch(/\.finally\(\(\)\s*=>\s*\{\s*isPending\s*=\s*false/)
    })
})
