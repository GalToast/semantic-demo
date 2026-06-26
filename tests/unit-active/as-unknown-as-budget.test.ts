import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { Dirent } from 'node:fs'

const srcRoot = resolve(import.meta.dirname, '../../src')

/**
 * Count all ` as unknown as X` double-cast patterns:
 *   `appState.foo as unknown as SomeTyped`
 *   `point as unknown as BusinessRecord[]`
 *   `window as unknown as { __FOO__?: ... }`
 *   `(mod as unknown as ModuleShape)` (lazy-import wrapper)
 *
 * The double-cast is the standard TS escape hatch when assigning through
 * `unknown` to erases structural-only incompatibilities (e.g. an interface
 * with `[key: string]: unknown` blocking subtype assignment). It is
 * cheap to write and invisible without a budget; in our codebase many of
 * these casts are surfacing real type holes (the source type lies) or
 * are redundant (both sides already have the same type). Either way the
 * cast hides a tiny decision from the next reader.
 *
 * Comments are stripped first so docstring references like
 * "// `appState as any` cast" don't count.
 */
function countUnknownAsOccurrences(src: string): number {
    const re = / as unknown as\b/g
    return (src.match(re) || []).length
}

/** Strip both block (`/* ... */ ;`) and line (` // ...`) comments. */
function stripComments(src: string): string {
    return src.replace(/\/[\/*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
}

function walk(dir: string, callback: (path: string) => void): void {
    for (const entry of readdirSync(dir, { withFileTypes: true }) as unknown as Dirent[]) {
        const fullPath = join(dir, entry.name)
        if (entry.isDirectory()) {
            walk(fullPath, callback)
        } else if ((entry.name.endsWith('.ts') || entry.name.endsWith('.svelte')) && !entry.name.endsWith('.d.ts')) {
            callback(fullPath)
        }
    }
}

interface AuditResult {
    totalCount: number
    fileCount: number
    topFiles: { path: string; count: number }[]
}

function runAudit(): AuditResult {
    let totalCount = 0
    const fileCounts = new Map<string, number>()

    walk(srcRoot, (filePath) => {
        const src = readFileSync(filePath, 'utf-8')
        const stripped = stripComments(src)
        const count = countUnknownAsOccurrences(stripped)
        if (count > 0) {
            totalCount += count
            fileCounts.set(filePath, count)
        }
    })

    const topFiles = [...fileCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([path, count]) => ({ path: path.replace(srcRoot + '/', ''), count }))

    return {
        totalCount,
        fileCount: fileCounts.size,
        topFiles
    }
}

describe('Global as-unknown-as budget', () => {
    const audit = runAudit()

    /**
     * Budget history (lowered as tightening commits ship):
     *   2026-06-25 baseline: 141
     *
     * The budget must be lowered by the next tightening commit. Any
     * increase must be justified in docs/typing-contract.md and committed
     * alongside the relaxation.
     *
     * See the recursive categorization study in the W48 budget work for
     * the major patterns:
     *   - Lazy-import wrappers  (~8)   → mechanical drop to `as ModuleShape`
     *   - typeof-circular       (~5)   → casts through `typeof X` that match LHS
     *   - window-bridge shape   (~36)  → window.d.ts has typed globals; drop cast
     *   - typed-name narrowing  (~80)  → tighten source types to remove the
     *                                   structural-incompatibility cause
     *   - object-shape          (~12)  → object literals, window/legacy braces
     */
    const BASELINE = 141

    it('does not exceed the 2026-06-25 baseline of 141 casts', () => {
        expect(
            audit.totalCount,
            `Global as-unknown-as count increased to ${audit.totalCount}. ` +
                `Budget: ${BASELINE}. See docs/typing-contract.md for how to fix or justify.`
        ).toBeLessThanOrEqual(BASELINE)
    })

    it('lists the top 10 offenders when the budget is exceeded', () => {
        const formatted = audit.topFiles.map((f) => `  ${f.count.toString().padStart(3)}  ${f.path}`).join('\n')
        console.log(`\nTop 10 as-unknown-as offenders:\n${formatted}`)
        expect(true).toBe(true)
    })
})
