/**
 * codebase-wide — no empty catch blocks lock-in test (W47)
 *
 * Locks in the W47 empty-catch audit completion.
 *
 * Before the audit, 17 sites in 7 files had `catch (_) {}` style
 * silent-swallow catches. After the audit, all 17 are replaced with
 * `catch (error) { debugWarn('[module] context:', error) }` — making
 * silent failures visible in dev mode via the diagnostic-adapter.
 *
 * Files touched:
 *   - src/lib/engine/three-engine.ts: 4 sites
 *   - src/lib/engine/lifecycle.ts: 5 sites
 *   - src/lib/engine/camera-choreography/framing-utils.ts: 1 site
 *   - src/lib/journey/selected-card.ts: 1 site
 *   - src/lib/search/orchestration.ts: 1 site
 *   - src/lib/search-engine.ts: 4 sites
 *   - src/lib/ui/tooltip.ts: 1 site
 *
 * Pattern mirrors tests/unit-active/no-innerhtml-codebase-wide.test.ts
 * (Bite XSS-Audit) and tests/unit-active/no-ungated-console-calls.test.ts
 * (Bite A). Self-enforcing structural contract test.
 *
 * What this test does:
 *   1. Walks all .ts and .svelte files in src/
 *   2. Strips comments (allows "no empty catch" discussion in comments)
 *   3. Asserts no catch block has an empty body (after comment strip)
 *
 * What this test allows:
 *   - Empty body in `catch { ... }` of a multi-statement function where
 *     the function body happens to be a single block (false positive
 *     avoidance via per-catch-pair matching, not brace-counting)
 *   - Comments discussing the no-empty-catch policy
 *   - `try { ... } catch (error) { debugWarn(...) }` — the post-audit pattern
 */
import { describe, it, expect } from 'vitest'
// @ts-ignore
import { readFileSync } from 'node:fs'
// @ts-ignore
import { readdirSync, statSync } from 'node:fs'
// @ts-ignore
import { join } from 'node:path'

const SRC_ROOT = join(__dirname, '../../src')

function walk(dir: string, out: string[] = []): string[] {
    let entries: string[]
    try {
        entries = readdirSync(dir)
    } catch {
        return out
    }
    for (const entry of entries) {
        const full = join(dir, entry)
        let st
        try {
            st = statSync(full)
        } catch {
            continue
        }
        if (st.isDirectory()) {
            walk(full, out)
        } else if (entry.endsWith('.ts') || entry.endsWith('.svelte')) {
            out.push(full)
        }
    }
    return out
}

function stripComments(src: string): string {
    return src
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '')
        .replace(/<!--[\s\S]*?-->/g, '')
}

interface EmptyCatchSite {
    file: string
    line: number
    preview: string
}

describe('codebase-wide — no empty catch blocks', () => {
    const files = walk(SRC_ROOT)
    const offenders: EmptyCatchSite[] = []

    for (const file of files) {
        const src = readFileSync(file, 'utf-8')
        const stripped = stripComments(src)
        // Match catch (...) { ... } where body is empty after comment strip
        // Greedy match up to next \n\s*} (closing brace at indentation 0)
        const re = /catch\s*\(([^)]*)\)\s*\{([\s\S]*?)\n\s*\}/g
        let m: RegExpExecArray | null
        while ((m = re.exec(stripped)) !== null) {
            const paramDecl = m[1].trim()
            const body = m[2]
            const bodyClean = body.replace(/\s+/g, '').trim()
            if (bodyClean === '' || bodyClean === '{}') {
                const lineNum = stripped.substring(0, m.index).split('\n').length
                offenders.push({
                    file,
                    line: lineNum,
                    preview: `catch(${paramDecl}) {}`
                })
            }
        }
    }

    it('zero empty catch blocks in src/', () => {
        if (offenders.length > 0) {
            const summary = offenders
                .map((o) => `  ${o.file.replace(SRC_ROOT + '\\', '')}:${o.line} (${o.preview})`)
                .join('\n')
            throw new Error(
                `Found ${offenders.length} empty catch blocks in src/:\n${summary}\n\n` +
                    `Empty catch blocks silently swallow errors. Use \`debugWarn('[module] context:', error)\` ` +
                    `from '@lib/utils/diagnostic-adapter' to make failures visible in dev mode. ` +
                    `See the W47 empty-catch audit for the established pattern.`
            )
        }
        expect(offenders.length).toBe(0)
    })

    it('audit covers .ts and .svelte files only (sanity)', () => {
        const tsFiles = files.filter((f) => f.endsWith('.ts'))
        const svelteFiles = files.filter((f) => f.endsWith('.svelte'))
        expect(tsFiles.length).toBeGreaterThan(10)
        expect(svelteFiles.length).toBeGreaterThan(0)
    })
})