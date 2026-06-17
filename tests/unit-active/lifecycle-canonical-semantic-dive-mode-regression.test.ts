/**
 * lifecycle-canonical-semantic-dive-mode-regression.test.ts
 *
 * Locks the `setSemanticDiveMode` re-export in `@lib/orchestration/lifecycle`.
 *
 * W20-open-questions-investigation.md Q2 identified that `@lib/orchestration/lifecycle`
 * was missing `setSemanticDiveMode` (9/10 consumer symbols covered). The re-export
 * was subsequently added; this test prevents silent regression.
 *
 * The canonical chain is:
 *   focus.svelte.ts  →  stores/lifecycle.ts  →  orchestration/lifecycle.ts
 *
 * Pattern follows `lifecycle-bridge-canonical-regression.test.ts`.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// ── Source file paths ─────────────────────────────────────────────────────────

const ORCHESTRATION_LC = resolve(__dirname, '../../src/lib/orchestration/lifecycle.ts')
const STORES_LC = resolve(__dirname, '../../src/lib/stores/lifecycle.ts')
const FOCUS_STORE = resolve(__dirname, '../../src/lib/stores/focus.svelte.ts')

function read(p: string): string {
    return readFileSync(p, 'utf-8')
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('lifecycle canonical: setSemanticDiveMode re-export (Q2 forward-compat)', () => {
    it('orchestration/lifecycle re-exports setSemanticDiveMode from @lib/stores/lifecycle', () => {
        const src = read(ORCHESTRATION_LC)
        // Must appear in a re-export block targeting @lib/stores/lifecycle
        const blockMatch = src.match(
            /export\s*\{[^}]*setSemanticDiveMode[^}]*\}\s*from\s*['"]@lib\/stores\/lifecycle['"]/
        )
        expect(blockMatch, 'setSemanticDiveMode must be in an export block from @lib/stores/lifecycle').not.toBeNull()
    })

    it('stores/lifecycle re-exports setSemanticDiveMode from focus.svelte', () => {
        const src = read(STORES_LC)
        expect(src).toContain('export const setSemanticDiveMode')
        expect(src).toContain("from './focus.svelte'")
    })

    it('focus.svelte.ts is the original definition source', () => {
        const src = read(FOCUS_STORE)
        expect(src).toMatch(/^export\s+function\s+setSemanticDiveMode\b/m)
    })

    it('orchestration/lifecycle still exports setSemanticDiveModeProxy (no accidental removal)', () => {
        const src = read(ORCHESTRATION_LC)
        expect(src).toContain('export function setSemanticDiveModeProxy')
    })

    it('setSemanticDiveMode in orchestration/lifecycle comes from re-export, not local definition', () => {
        const src = read(ORCHESTRATION_LC)
        // Must NOT have a local function definition — it should only appear in the
        // export-from block and the import alias (setFocusDiveMode).
        const localDef = src.match(/^export\s+function\s+setSemanticDiveMode\b/m)
        expect(
            localDef,
            'setSemanticDiveMode must be a re-export, not a local definition in orchestration/lifecycle'
        ).toBeNull()
    })

    it('both orchestration/lifecycle and stores/lifecycle agree on the symbol', () => {
        // Count occurrences in each file"s export block
        const orchSrc = read(ORCHESTRATION_LC)
        const storesSrc = read(STORES_LC)

        const orchExport = orchSrc.includes('setSemanticDiveMode')
        const storesExport = storesSrc.includes('setSemanticDiveMode')

        expect(orchExport, 'orchestration/lifecycle must mention setSemanticDiveMode').toBe(true)
        expect(storesExport, 'stores/lifecycle must mention setSemanticDiveMode').toBe(true)
    })
})
