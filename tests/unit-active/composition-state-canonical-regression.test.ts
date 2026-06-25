/**
 * composition-state-canonical-regression.test.ts
 *
 * Locks the `@lib/orchestration/composition-state` canonical re-export.
 *
 * The canonical was created in commit 7b67cfc (parallel session) and
 * completed in 5f69f27 (main lane). It re-exports `applyCompositionState`
 * and `derivePanelSurface` from `@lib/stores/lifecycle`.
 *
 * This prevents a future parallel-session WIP reset from silently
 * removing the canonical or breaking the re-export chain.
 *
 * Pattern follows `lifecycle-bridge-canonical-regression.test.ts` and
 * `lifecycle-canonical-semantic-dive-mode-regression.test.ts`.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// ── Source file paths ─────────────────────────────────────────────────────────

const CANONICAL = resolve(__dirname, '../../src/lib/orchestration/composition-state.ts')
const STORES_LC = resolve(__dirname, '../../src/lib/stores/lifecycle.ts')

function read(p: string): string {
    return readFileSync(p, 'utf-8')
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('@lib/orchestration/composition-state canonical (7b67cfc / 5f69f27)', () => {
    it('canonical file exists and exports applyCompositionState + derivePanelSurface', () => {
        const src = read(CANONICAL)
        expect(src).toContain('applyCompositionState')
        expect(src).toContain('derivePanelSurface')
    })

 it('canonical re-exports from @lib/stores/lifecycle (not from js/modules/)', () => {
        const src = read(CANONICAL)
        expect(src).toContain("from '@lib/stores/lifecycle'")
 // The canonical must NOT import from js/modules/ (relative or absolute).
        // Note: a docstring mentioning 'js/modules' is fine — only an actual
 // import path is forbidden. Match `from '...'` pattern.
        expect(src).not.toMatch(/from\s+['"][^'"]*js\/modules/)
    })

    it('source-of-truth (@lib/stores/lifecycle) exports both functions', () => {
        const src = read(STORES_LC)
        expect(src).toMatch(/^export\s+function\s+applyCompositionState\b/m)
        expect(src).toMatch(/^export\s+function\s+derivePanelSurface\b/m)
    })

    it('canonical uses bare specifier (no .ts extension in import path)', () => {
        const src = read(CANONICAL)
        // Must NOT have '@lib/stores/lifecycle.ts' — ESM specifier form
        expect(src).not.toContain("from '@lib/stores/lifecycle.ts'")
        // Must have the bare form
        expect(src).toContain("from '@lib/stores/lifecycle'")
    })

    it('applyCompositionState() takes 0 args, derivePanelSurface(opts) takes 1 arg', () => {
        const src = read(STORES_LC)
        // applyCompositionState is a zero-arg function
        expect(src).toMatch(/export\s+function\s+applyCompositionState\s*\(\s*\)/)
        // derivePanelSurface takes a single opts argument
        expect(src).toMatch(/export\s+function\s+derivePanelSurface\s*\(\s*opts\s*:/)
    })

    it('canonical is a pure re-export (no local definitions of the two symbols)', () => {
        const src = read(CANONICAL)
        // Must NOT have a local function definition — only re-export
        expect(src).not.toMatch(/^export\s+function\s+applyCompositionState\b/m)
        expect(src).not.toMatch(/^export\s+function\s+derivePanelSurface\b/m)
    })
})
