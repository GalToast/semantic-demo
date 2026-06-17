/**
 * w20-wave4-readiness-regression.test.ts
 *
 * Readiness gate for W20 Wave 4 cleanup of the js/modules/ tree.
 *
 * Structure:
 * 1. Hard invariants (must always pass — regressions if they fail)
 *    - No deep-relative ../../src/lib/ imports in js/modules/
 *    - W20 canonical files exist and are wired correctly
 *    - 3 companion regression tests exist
 * 2. Wave 4 cleanup status (expected to fail until parallel session lands)
 *    - File deletions pending: lifecycle.ts, lifecycle-modes.ts, lifecycle-reset.ts
 *    - Import violations from deleted lifecycle.ts: 5 files still importing
 *    - Other cross-module ./ relative imports in journey-* files (6 violations)
 *
 * When ALL Wave 4 cleanup lands, the test passes. When some cleanup is pending,
 * the test reports exactly which files need deletion or import rewrites, so
 * devs know what's expected vs. what's a real regression.
 *
 * References:
 * - 83c9d94 (original test)
 * - fb1e9a7 (tightened test)
 * - docs/w21-charter-2026-06-17.md (Wave 21.1 charter)
 */
import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

// ── Project roots ────────────────────────────────────────────────────────────

const PROJECT_ROOT = resolve(import.meta.dirname, '../..')
const JS_MODULES = join(PROJECT_ROOT, 'js/modules')

// ── Wave 4 cleanup targets ───────────────────────────────────────────────────

/** Files that MUST be deleted by the parallel session's W20 arc */
const PENDING_DELETIONS = ['lifecycle.ts', 'lifecycle-modes.ts', 'lifecycle-reset.ts'] as const

/** Canonical files that MUST exist after Wave 4 (already wired) */
const MUST_EXIST_FILES = [
    join('src', 'lib', 'orchestration', 'composition-state.ts'),
    join('src', 'lib', 'orchestration', 'lifecycle.ts'),
    join('tests', 'unit-active', 'lifecycle-bridge-canonical-regression.test.ts'),
    join('tests', 'unit-active', 'lifecycle-canonical-semantic-dive-mode-regression.test.ts'),
    join('tests', 'unit-active', 'composition-state-canonical-regression.test.ts')
] as const

// ── Helpers ──────────────────────────────────────────────────────────────────

function relFromRoot(full: string): string {
    return relative(PROJECT_ROOT, full).replace(/\\/g, '/')
}

/**
 * Recursively collect .ts files under a directory, skipping node_modules/dist.
 */
function collectTsFiles(dir: string, files: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
        if (entry === 'node_modules' || entry === 'dist' || entry === '.git' || entry === 'tmp') continue
        const fullPath = join(dir, entry)
        try {
            const stat = require('node:fs').statSync(fullPath)
            if (stat.isDirectory()) {
                collectTsFiles(fullPath, files)
            } else if (/\.ts$/.test(entry)) {
                files.push(fullPath)
            }
        } catch {
            /* skip unreadable entries */
        }
    }
    return files
}

/**
 * Extract import source specifiers from a file's content.
 * Returns the raw string inside from '...' or import('...').
 */
function extractImportSources(content: string): string[] {
    const sources: string[] = []
    const importRe = /(?:from|import)\s*\(\s*['"]([^'"]+)['"]\s*\)|(?:from\s+['"]([^'"]+)['"])/g
    let m: RegExpExecArray | null
    while ((m = importRe.exec(content)) !== null) {
        const src = m[1] ?? m[2]
        if (src) sources.push(src)
    }
    return sources
}

/**
 * Check if an import source is a './' relative import that should be cleaned up.
 * Allowed: ./utils/*, ./components/*, ./journey-* (sibling journey modules).
 */
function isCrossModuleRelativeImport(source: string): boolean {
    if (!source.startsWith('./')) return false
    if (source.startsWith('./utils/')) return false
    if (source.startsWith('./components/')) return false
    if (source.startsWith('./journey-')) return false
    return true
}

// ══════════════════════════════════════════════════════════════════════════════
// TEST SUITE
// ══════════════════════════════════════════════════════════════════════════════

describe('W20 Wave 4 readiness: js/modules/ tree state lock', () => {
    // ── Section 1: Hard invariants (must always pass) ────────────────────────
    // These test things that SHOULD already be true. If they fail,
    // it's a regression, not pending cleanup.

    describe('1. Hard invariants (regression gate)', () => {
        it('no js/modules/ file imports from ../../src/lib/...', () => {
            const tsFiles = collectTsFiles(JS_MODULES)
            const violations: string[] = []

            for (const file of tsFiles) {
                const content = readFileSync(file, 'utf-8')
                const sources = extractImportSources(content)
                for (const src of sources) {
                    if (src.includes('../../src/lib/') || src.includes('../../src/lib')) {
                        violations.push(`${relFromRoot(file)} imports '${src}'`)
                    }
                }
            }

            expect(
                violations,
                `Found ${violations.length} deep-relative ../../src/lib/ import(s):\n${violations.join('\n')}`
            ).toHaveLength(0)
        })

        for (const relPath of MUST_EXIST_FILES) {
            it(`${relPath} exists`, () => {
                const fullPath = join(PROJECT_ROOT, relPath)
                expect(existsSync(fullPath), `${relPath} does not exist — W20 canonical not wired`).toBe(true)
            })
        }

        it('orchestration/composition-state exports applyCompositionState and derivePanelSurface', () => {
            const canonical = join(PROJECT_ROOT, 'src/lib/orchestration/composition-state.ts')
            const src = readFileSync(canonical, 'utf-8')
            expect(src).toContain('applyCompositionState')
            expect(src).toContain('derivePanelSurface')
        })

        it('orchestration/lifecycle re-exports from @lib/stores/lifecycle', () => {
            const canonical = join(PROJECT_ROOT, 'src/lib/orchestration/lifecycle.ts')
            const src = readFileSync(canonical, 'utf-8')
            expect(src).toMatch(/from ['"]@lib\/stores\/lifecycle['"]/)
        })

        it('lifecycle-bridge imports from @lib/orchestration/lifecycle (not legacy js/modules)', () => {
            const bridge = join(PROJECT_ROOT, 'src/lib/engine/lifecycle-bridge.ts')
            const src = readFileSync(bridge, 'utf-8')
            expect(src).toContain("from '@lib/orchestration/lifecycle'")
            expect(src).not.toContain("from '../../../js/modules/lifecycle'")
        })
    })

    // ── Section 2: Wave 4 cleanup status (informational) ────────────────────
    // These test pending cleanup items. They FAIL when cleanup is incomplete
    // and PASS when the parallel session lands. The test output tells you
    // exactly what's still pending — not just "test failed".

    describe('2. Wave 4 cleanup: file deletions pending', () => {
        const pending: string[] = []

        beforeAll(() => {
            for (const file of PENDING_DELETIONS) {
                const fullPath = join(JS_MODULES, file)
                if (existsSync(fullPath)) {
                    pending.push(file)
                }
            }
            if (pending.length > 0) {
                console.log(
                    `\n⚠ PENDING WAVE 4 CLEANUP — ${pending.length} file(s) still exist:\n` +
                        pending.map((f) => `  • js/modules/${f}`).join('\n') +
                        `\n\nThese should be deleted by the parallel session's W20 arc.\n` +
                        `Once deleted, these assertions will pass automatically.\n`
                )
            }
        })

        for (const file of PENDING_DELETIONS) {
            it(`${file} should be deleted`, () => {
                expect(
                    existsSync(join(JS_MODULES, file)),
                    `js/modules/${file} still exists — pending Wave 4 cleanup`
                ).toBe(false)
            })
        }
    })

    describe('3. Wave 4 cleanup: ./lifecycle.ts import violations', () => {
        const lifecycleImporters: string[] = []

        beforeAll(() => {
            const tsFiles = collectTsFiles(JS_MODULES)
            for (const file of tsFiles) {
                const content = readFileSync(file, 'utf-8')
                const sources = extractImportSources(content)
                for (const src of sources) {
                    if (src === './lifecycle.ts' || src === './lifecycle') {
                        lifecycleImporters.push(relFromRoot(file))
                    }
                }
            }
            if (lifecycleImporters.length > 0) {
                console.log(
                    `\n⚠ PENDING WAVE 4 CLEANUP — ${lifecycleImporters.length} file(s) still import from ./lifecycle.ts:\n` +
                        lifecycleImporters.map((f) => `  • ${f}`).join('\n') +
                        `\n\nThese imports must be rewritten to @lib/orchestration/lifecycle\n` +
                        `before js/modules/lifecycle.ts can be deleted.\n`
                )
            }
        })

        it('no js/modules/ file imports from ./lifecycle.ts (deleted)', () => {
            expect(
                lifecycleImporters,
                `Found ${lifecycleImporters.length} import(s) from deleted ./lifecycle.ts:\n` +
                    lifecycleImporters.join('\n')
            ).toHaveLength(0)
        })
    })

    describe('4. Wave 4 cleanup: cross-module ./ relative imports in journey-*', () => {
        const violations: string[] = []

        beforeAll(() => {
            const tsFiles = collectTsFiles(JS_MODULES)
            const journeyFiles = tsFiles.filter((f) => /journey-.*\.ts$/.test(f) && !f.includes('journey.ts'))

            for (const file of journeyFiles) {
                const content = readFileSync(file, 'utf-8')
                const sources = extractImportSources(content)
                for (const src of sources) {
                    if (isCrossModuleRelativeImport(src)) {
                        violations.push(`${relFromRoot(file)} imports '${src}'`)
                    }
                }
            }
            if (violations.length > 0) {
                console.log(
                    `\n⚠ CROSS-MODULE IMPORTS — ${violations.length} violation(s) in journey-* files:\n` +
                        violations.map((v) => `  • ${v}`).join('\n') +
                        `\n\nThese should use @lib/ aliases or ./utils/* shims.\n`
                )
            }
        })

        it('journey-* files have zero cross-module ./ relative imports', () => {
            expect(
                violations,
                `Found ${violations.length} cross-module import(s) in journey-* files:\n` + violations.join('\n')
            ).toHaveLength(0)
        })
    })
})
