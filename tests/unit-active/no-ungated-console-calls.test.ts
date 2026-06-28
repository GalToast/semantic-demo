/**
 * no-ungated-console-calls — production console hygiene contract test
 *
 * Locks in the W47 production-console cleanup so the codebase cannot
 * regress. Every console.log / console.warn / console.error in src/
 * MUST be one of:
 *   - Same-line: `if (import.meta.env.DEV) console.X(...)`
 *   - Multi-line: `if (... && import.meta.env.DEV)` on a preceding line
 *     (within 8 lines, stopping at a closing brace at column 0)
 *   - Inside the body of a known dev-only utility function
 *     (`debugWarn`, `debugLog`, `debugError`)
 *   - Inside an HTML or block comment (not real runtime code)
 *
 * Anything else produces a failure with file + line so the regression
 * is pinpointed.
 *
 * Why this matters: the previous cleanup wave (commit `dc991f17`)
 * gated most production console calls but missed at least one — the
 * validation guard in `state/app.svelte.ts:625` was producing
 * production-log noise via `console.warn`. This test prevents the
 * next wave from missing the next one.
 */
import { describe, it, expect } from 'vitest'
// @ts-ignore
import { readdirSync, readFileSync, statSync } from 'node:fs'
// @ts-ignore
import { join, relative, sep, dirname } from 'node:path'
// @ts-ignore
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const PROJECT_ROOT = join(__dirname, '..', '..')
const SRC_ROOT = join(PROJECT_ROOT, 'src')

interface Finding {
    file: string
    line: number
    text: string
    reason: 'un-gated'
}

function walk(dir: string): string[] {
    const out: string[] = []
    for (const entry of readdirSync(dir)) {
        if (entry === 'node_modules' || entry.startsWith('.')) continue
        const full = join(dir, entry)
        if (statSync(full).isDirectory()) {
            out.push(...walk(full))
        } else if (/\.(ts|svelte)$/.test(entry) && !/\.(test|spec)\.(ts|js)$/.test(entry)) {
            out.push(full)
        }
    }
    return out
}

function isCommentLine(line: string): boolean {
    const trimmed = line.trim()
    return trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')
}

/**
 * For each console.* occurrence, determine if it's gated.
 *
 * Gating accepted:
 *   1. Same-line `if (import.meta.env.DEV) console.X(...)` pattern
 *   2. Multi-line `if (... && import.meta.env.DEV) { console.X(...) }`
 *      (the `if` opens on a preceding line within 8 lines, the `import.meta.env.DEV`
 *      guard appears in the condition, and we haven't crossed a closing brace)
 *   3. Inside the body of `debugWarn` / `debugLog` / `debugError`
 *   4. Inside an HTML or block comment (not runtime code)
 */
function checkGating(file: string): Finding[] {
    const lines = readFileSync(file, 'utf-8').split('\n')
    const findings: Finding[] = []

    // Track dev-util function entry. When we enter
    // `function debugXxx` or `export function debugXxx`, push the closing
    // line index onto the stack. Console calls before the closing line
    // are gated.
    const devUtilEndLines: number[] = []

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        const trimmed = line.trim()

        // Track dev-util function entry
        const devUtilMatch = trimmed.match(/^(export\s+)?function\s+(debugWarn|debugLog|debugError)\b/)
        if (devUtilMatch) {
            let braceDepth = 0
            let foundOpen = false
            for (let j = i; j < lines.length; j++) {
                for (const c of lines[j]) {
                    if (c === '{') {
                        braceDepth++
                        foundOpen = true
                    } else if (c === '}') {
                        braceDepth--
                        if (foundOpen && braceDepth === 0) {
                            devUtilEndLines.push(j)
                            break
                        }
                    }
                }
                if (foundOpen && braceDepth === 0) break
            }
        }

        // Find console.* calls
        const consoleMatch = line.match(/console\.(log|warn|error)\b/)
        if (!consoleMatch) continue

        // Skip single-line comments
        if (isCommentLine(line)) continue

        // Track HTML/Svelte comment blocks: skip console.* inside them.
        let openHtml = 0
        let closeHtml = 0
        let openBlock = 0
        let closeBlock = 0
        for (let j = 0; j < i; j++) {
            const prevLine = lines[j]
            openHtml += (prevLine.match(/<!--/g) || []).length
            closeHtml += (prevLine.match(/-->/g) || []).length
            openBlock += (prevLine.match(/\/\*/g) || []).length
            closeBlock += (prevLine.match(/\*\//g) || []).length
        }
        if (openHtml > closeHtml || openBlock > closeBlock) continue

        const inDevUtil = devUtilEndLines.some((endLine) => i <= endLine)

        // Dev-gate pattern: `import.meta.env.DEV` directly, or a module-level
        // constant derived from it (e.g. `const IS_DEV = import.meta.env.DEV`).
        const DEV_GATE = /(?:import\.meta\.env\.DEV|\bIS_DEV\b)/

        // 1. Same-line guard
        const sameLineGuard =
            /if\s*\(\s*(?:import\.meta\.env\.DEV|IS_DEV)\b/.test(line) && /console\.(log|warn|error)\b/.test(line)

        // 2. Multi-line guard
        let multiLineGuard = false
        if (!sameLineGuard) {
            for (let back = 1; back <= 8 && i - back >= 0; back++) {
                const prev = lines[i - back].trim()
                if (/if\s*\(/.test(prev) && DEV_GATE.test(prev)) {
                    multiLineGuard = true
                    break
                }
                // Continue walking through multi-line `if` headers
                if (/if\s*\($/.test(prev) || (/if\s*\(/.test(prev) && !/\)/.test(prev))) {
                    continue
                }
                if (/^\}/.test(prev)) break
            }
        }

        const gated = sameLineGuard || multiLineGuard || inDevUtil
        if (!gated) {
            findings.push({
                file: relative(PROJECT_ROOT, file).split(sep).join('/'),
                line: i + 1,
                text: line.trim().substring(0, 120),
                reason: 'un-gated'
            })
        }
    }
    return findings
}

describe('no-ungated-console-calls — production console hygiene (W47)', () => {
    const files = walk(SRC_ROOT)
    const allFindings: Finding[] = []

    for (const file of files) {
        allFindings.push(...checkGating(file))
    }

    it('has zero un-gated console.* calls in src/ (production paths)', () => {
        if (allFindings.length > 0) {
            const summary = allFindings.map((f) => `  L${f.line}: ${f.text}\n     ${f.file}`).join('\n\n')
            throw new Error(
                `Found ${allFindings.length} un-gated console.* call(s) in src/:\n\n${summary}\n\n` +
                    `Each console.* must be either:\n` +
                    `  - Wrapped in \`if (import.meta.env.DEV)\` (same-line or multi-line), or\n` +
                    `  - Inside the body of debugWarn / debugLog / debugError, or\n` +
                    `  - Inside an HTML or block comment (not runtime code), or\n` +
                    `  - Removed entirely.\n\n` +
                    `For dev-only visibility, prefer \`debugWarn\` from @lib/utils/diagnostic-adapter.`
            )
        }
        expect(allFindings).toHaveLength(0)
    })

    it('walks at least 100 source files (sanity check on the walker)', () => {
        expect(files.length).toBeGreaterThanOrEqual(100)
    })

    it('walks .ts and .svelte files only (not .js or .md)', () => {
        const exts = new Set(files.map((f) => f.split('.').pop()))
        for (const ext of exts) {
            expect(['ts', 'svelte']).toContain(ext)
        }
    })

    it('excludes test files from the scan', () => {
        const testFilesInScan = files.filter((f) => /\.(test|spec)\.(ts|js)$/.test(f))
        expect(testFilesInScan).toHaveLength(0)
    })
})
