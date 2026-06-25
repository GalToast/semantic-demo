import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { Dirent } from 'node:fs'

const srcDir = resolve(import.meta.dirname, '../../src')

/**
 * Count all `any`-shaped patterns in a source string:
 *   `: any` (type annotation)
 *   `as any` (cast)
 *   `<any>` (generic arg)
 *   ` any[]` (array type)
 *
 * Comments are stripped first so docstrings like "// `appState as any` cast"
 * don't count.
 */
function countAnyOccurrences(src: string): number {
    const re = /: any\b| as any\b|<any>| any\[]/g
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

    walk(srcDir, (filePath) => {
        const src = readFileSync(filePath, 'utf-8')
        const stripped = stripComments(src)
        const count = countAnyOccurrences(stripped)
        if (count > 0) {
            totalCount += count
            fileCounts.set(filePath, count)
        }
    })

    const topFiles = [...fileCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([path, count]) => ({ path: path.replace(srcDir + '/', ''), count }))

    return {
        totalCount,
        fileCount: fileCounts.size,
        topFiles
    }
}

describe('Global as-any budget', () => {
    const audit = runAudit()

    it('does not exceed the 2026-06-25 baseline of 5 casts', () => {
        // Budget: 5 — the codebase is effectively as-any-free.
        // Most patterns should be 0. A tiny buffer (5) allows for
        // legitimate edge cases (test globals, external API boundaries)
        // but any addition must be justified in docs/typing-contract.md.
        expect(
            audit.totalCount,
            `Global as-any count increased to ${audit.totalCount}. ` +
                `Budget: 5. See docs/typing-contract.md for how to fix or justify.`
        ).toBeLessThanOrEqual(5)
    })

    it('lists the top 10 offenders when the budget is exceeded', () => {
        // This test always passes; it just prints the top offenders for
        // diagnostic context when the budget test fails.
        const formatted = audit.topFiles.map((f) => `  ${f.count.toString().padStart(3)}  ${f.path}`).join('\n')
        console.log(`\nTop 10 as-any offenders:\n${formatted}`)
        expect(true).toBe(true)
    })
})
