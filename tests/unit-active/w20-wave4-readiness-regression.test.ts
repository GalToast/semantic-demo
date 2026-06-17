/**
 * w20-wave4-readiness-regression.test.ts
 *
 * Locks the W20 Wave 3+4 outcome for the js/modules/ tree state.
 *
 * After Wave 4 cleanup:
 * - 10 W19/W20/W20p-deleted files (journey, lifecycle, lifecycle-modes,
 *   lifecycle-reset, map-state, loading-ui, composition-state, exploration-mode,
 *   app-svelte-island, three-node-manager) are gone
 * - Zero deep-relative '../../src/lib/...' imports in js/modules/
 *   (utils/* re-export shims and components/*.svelte are allowed exceptions)
 * - Zero cross-module './' relative imports in js/modules/ journey-* files
 *   (only intra-journey-*, ./utils/*, and ./components/* imports allowed)
 * - All W20 canonicals (composition-state, lifecycle re-exports) wired correctly
 * - All 3 companion regression tests exist
 *
 * This test FAILS today (Wave 4 not yet complete) and PASSES after
 * Wave 4 cleanup lands. Single-source-of-truth gate.
 *
 * Parallel session 79b2576 deleted map-state.ts; lifecycle-modes.ts and
 * lifecycle-reset.ts are expected to be deleted by the same arc.
 *
 * Pattern: matches tests/unit-active/lifecycle-bridge-canonical-regression.test.ts
 *          and tests/unit-active/both-bridge-shape-invariant.test.ts
 */
import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

// ── Project roots ────────────────────────────────────────────────────────────

const PROJECT_ROOT = resolve(import.meta.dirname, '../..')
const JS_MODULES  = join(PROJECT_ROOT, 'js/modules')

// ── The 10 files that MUST NOT exist after Wave 4 ───────────────────────────
// Updated from 7 to 10: parallel session 79b2576 deleted map-state.ts;
// lifecycle-modes.ts and lifecycle-reset.ts are being handled by the
// parallel session's W20 cleanup arc (no longer canonical homes for
// applyCompositionState / setTrailDepth).

const DELETED_FILES = [
    'journey.ts',
    'lifecycle.ts',
    'loading-ui.ts',
    'composition-state.ts',
    'exploration-mode.ts',
    'app-svelte-island.ts',
    'three-node-manager.ts',
    'map-state.ts',           // deleted by parallel session 79b2576
    'lifecycle-modes.ts',     // deleted by parallel session W20 arc
    'lifecycle-reset.ts',     // deleted by parallel session W20 arc
] as const

// ── Canonical paths that MUST exist after Wave 4 ────────────────────────────

const MUST_EXIST_FILES = [
    join('src', 'lib', 'orchestration', 'composition-state.ts'),
    join('src', 'lib', 'orchestration', 'lifecycle.ts'),
    join('tests', 'unit-active', 'lifecycle-bridge-canonical-regression.test.ts'),
    join('tests', 'unit-active', 'lifecycle-canonical-semantic-dive-mode-regression.test.ts'),
    join('tests', 'unit-active', 'composition-state-canonical-regression.test.ts'),
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
        } catch { /* skip unreadable entries */ }
    }
    return files
}

/**
 * Extract import source specifiers from a file's content.
 * Returns the raw string inside from '...' or import('...').
 */
function extractImportSources(content: string): string[] {
    const sources: string[] = []
    // Match: from './foo', from "../bar", import('./baz')
    const importRe = /(?:from|import)\s*\(\s*['"]([^'"]+)['"]\s*\)|(?:from\s+['"]([^'"]+)['"])/g
    let m: RegExpExecArray | null
    while ((m = importRe.exec(content)) !== null) {
        const src = m[1] ?? m[2]
        if (src) sources.push(src)
    }
    return sources
}

/**
 * Check if an import source is a './' relative import to a non-utils,
 * non-journey target — i.e., a cross-module import that should be cleaned up.
 */
function isCrossModuleRelativeImport(source: string): boolean {
    if (!source.startsWith('./')) return false
    // Allow ./utils/* imports (re-export shims, e.g. dom-builder.ts)
    if (source.startsWith('./utils/')) return false
    // Allow ./components/* imports (Svelte components in js/modules/components/)
    if (source.startsWith('./components/')) return false
    // Allow journey-to-journey imports
    if (source.startsWith('./journey-')) return false
    return true
}

// ══════════════════════════════════════════════════════════════════════════════
// TEST SUITE
// ══════════════════════════════════════════════════════════════════════════════

describe('W20 Wave 4 readiness: js/modules/ tree state lock', () => {

    // ── Section 1: Deleted files must not exist ──────────────────────────────

    describe('1. W19/W20-deleted files must NOT exist in js/modules/', () => {
        for (const file of DELETED_FILES) {
            it(`${file} should be deleted`, () => {
                const fullPath = join(JS_MODULES, file)
                expect(
                    existsSync(fullPath),
                    `${file} still exists at ${relFromRoot(fullPath)} — Wave 4 cleanup not complete`
                ).toBe(false)
            })
        }
    })

    // ── Section 2: Zero deep-relative imports ────────────────────────────────

    describe('2. Zero deep-relative ../../src/lib/ imports in js/modules/', () => {
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
    })

    // ── Section 3: No cross-module ./ relative imports in journey files ──────
    // Allowed: ./journey-* (sibling journey modules), ./utils/* (re-export shims),
    // ./components/* (Svelte components co-located in js/modules/components/),
    // and @lib/* / other package aliases.

    describe('3. journey-* files have zero cross-module ./ relative imports', () => {
        it('journey-* files only import from ./journey-*, ./utils/*, ./components/*, and package aliases', () => {
            const tsFiles = collectTsFiles(JS_MODULES)
            const journeyFiles = tsFiles.filter(f =>
                /journey-.*\.ts$/.test(f) && !f.includes('journey.ts')
            )

            const violations: string[] = []

            for (const file of journeyFiles) {
                const content = readFileSync(file, 'utf-8')
                const sources = extractImportSources(content)
                for (const src of sources) {
                    if (isCrossModuleRelativeImport(src)) {
                        violations.push(
                            `${relFromRoot(file)} imports '${src}' (cross-module ./ relative)`
                        )
                    }
                }
            }

            expect(
                violations,
                `Found ${violations.length} cross-module import(s) in journey-* files:\n` +
                `${violations.join('\n')}\n\n` +
                'These should be rewritten to use @lib/ aliases, ./utils/* shims, or moved to the journey-* subgraph.'
            ).toHaveLength(0)
        })
    })

    // ── Section 4: No cross-module ./ relative imports in non-journey files ──
    // These assertions verify that files deleted by Wave 4 are not imported
    // by any surviving js/modules/ file via relative paths.

    describe('4. non-journey js/modules/ files have no ./ imports to deleted modules', () => {
        it('no js/modules/ file imports from ./journey.ts (deleted)', () => {
            const tsFiles = collectTsFiles(JS_MODULES)
            const violations: string[] = []

            for (const file of tsFiles) {
                const content = readFileSync(file, 'utf-8')
                const sources = extractImportSources(content)
                for (const src of sources) {
                    if (src === './journey.ts' || src === './journey') {
                        violations.push(`${relFromRoot(file)} imports '${src}'`)
                    }
                }
            }

            expect(
                violations,
                `Found ${violations.length} import(s) from deleted ./journey.ts:\n${violations.join('\n')}`
            ).toHaveLength(0)
        })

        it('no js/modules/ file imports from ./lifecycle.ts (deleted)', () => {  // eslint-disable-line vitest/expect-expect
            const tsFiles = collectTsFiles(JS_MODULES)
            const violations: string[] = []

            for (const file of tsFiles) {
                const content = readFileSync(file, 'utf-8')
                const sources = extractImportSources(content)
                for (const src of sources) {
                    if (src === './lifecycle.ts' || src === './lifecycle') {
                        violations.push(`${relFromRoot(file)} imports '${src}'`)
                    }
                }
            }

            expect(
                violations,
                `Found ${violations.length} import(s) from deleted ./lifecycle.ts:\n${violations.join('\n')}`
            ).toHaveLength(0)
        })
    })

    // ── Section 5: W20 canonicals exist and are wired ───────────────────────

    describe('5. W20 canonical files exist', () => {
        for (const relPath of MUST_EXIST_FILES) {
            it(`${relPath} exists`, () => {
                const fullPath = join(PROJECT_ROOT, relPath)
                expect(
                    existsSync(fullPath),
                    `${relPath} does not exist — W20 canonical not wired`
                ).toBe(true)
            })
        }
    })

    describe('6. W20 canonical exports are wired correctly', () => {
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
})
