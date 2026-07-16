/**
 * z-index-consistency.test.ts — Guard z-index token hygiene.
 *
 * TWO CHECKS:
 *
 * 1. Undefined var(--z-*) tokens: every `var(--z-NAME)` used must be declared
 *    in a :root somewhere in src/ or css/. The UI sweep (W48) found real bugs
 *    where an undeclared token silently fell back to a wrong value.
 *
 * 2. Literal z-index values: any bare `z-index: <number>` (not using a token)
 *    is flagged unless the value is in the INTENTIONAL_ALLOWLIST. This catches
 *    pre-existing hardening gaps where a literal bypasses the token system.
 *    Vendor files and the dead src/app.html template are excluded.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import { resolve, extname } from 'path'

const ROOT = resolve(__dirname, '../..')

/**
 * Intentional literal z-index values that bypass the token system.
 * -1: Placeholder2D behind-canvas layer
 *  0: canvas base layer
 *  1: base/content layer (Placeholder2D overlay, SearchResults sticky btn)
 *  9999: loading/skip-link intentional top
 * 10000: canvas-hover-preview overlay (above loading veil)
 */
const INTENTIONAL_ALLOWLIST = new Set([-1, 0, 1, 9999, 10000])

/** Files to skip in the literal-scan (dead template, vendor code). */
const SKIP_PATHS = ['src/app.html', 'src/public/vendor']

function shouldSkip(filePath: string): boolean {
    const rel = filePath.replace(ROOT, '').replace(/\\/g, '/')
    return SKIP_PATHS.some((p) => rel.includes(p))
}

function walk(dir: string): string[] {
    const out: string[] = []
    for (const e of readdirSync(dir)) {
        const p = resolve(dir, e)
        const s = statSync(p)
        if (s.isDirectory()) {
            if (e === 'node_modules' || e === '.git' || e === 'dist') continue
            out.push(...walk(p))
        } else {
            const ext = extname(p).toLowerCase()
            if (['.ts', '.js', '.svelte', '.css', '.html'].includes(ext)) out.push(p)
        }
    }
    return out
}

function collectDeclared(): Set<string> {
    const declared = new Set<string>()
    for (const f of walk(resolve(ROOT, 'src')).concat(walk(resolve(ROOT, 'css')))) {
        const txt = readFileSync(f, 'utf8')
        for (const m of txt.matchAll(/--z-[a-z0-9-]+/gi)) declared.add(m[0].toLowerCase())
    }
    return declared
}

function collectUsed(): Map<string, string[]> {
    const used = new Map<string, string[]>()
    const files = walk(resolve(ROOT, 'src')).concat(walk(resolve(ROOT, 'css')))
    for (const f of files) {
        const txt = readFileSync(f, 'utf8')
        for (const m of txt.matchAll(/var\((--z-[a-z0-9-]+)\s*(,[^)]*)?\)/gi)) {
            const name = m[1].toLowerCase()
            if (!used.has(name)) used.set(name, [])
            used.get(name)!.push(f.replace(ROOT, ''))
        }
    }
    return used
}

type LiteralHit = { file: string; line: number; value: number; raw: string }

/**
 * Scan for bare `z-index: <number>` that does NOT use var(--z-*).
 * Returns hits whose numeric value is NOT in the allowlist.
 */
function collectLiteralBypasses(): LiteralHit[] {
    const hits: LiteralHit[] = []
    const files = walk(resolve(ROOT, 'src')).concat(walk(resolve(ROOT, 'css')))
    // Matches `z-index: <optional-negative><digits>` but NOT inside var(...).
    // We match line-by-line and skip lines containing var(--z-).
    const lineRe = /z-index:\s*(-?\d+)/gi
    for (const f of files) {
        if (shouldSkip(f)) continue
        const lines = readFileSync(f, 'utf8').split('\n')
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i]
            // Skip comment-only lines
            const trimmed = line.trim()
            if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue
            // Skip lines that use the token system
            if (/var\(--z-/i.test(line)) continue
            // Skip non-numeric values like `z-index: auto`
            for (const m of line.matchAll(lineRe)) {
                const val = parseInt(m[1], 10)
                if (!INTENTIONAL_ALLOWLIST.has(val)) {
                    hits.push({
                        file: f.replace(ROOT, ''),
                        line: i + 1,
                        value: val,
                        raw: trimmed
                    })
                }
            }
        }
    }
    return hits
}

describe('z-index token consistency', () => {
    const declared = collectDeclared()
    const used = collectUsed()

    it('every var(--z-*) used is declared in a :root (no undefined tokens)', () => {
        const undefinedUsed: string[] = []
        for (const name of used.keys()) {
            if (!declared.has(name)) undefinedUsed.push(`${name}  <-  ${used.get(name)!.join(', ')}`)
        }
        if (undefinedUsed.length) {
            throw new Error(
                'Undefined --z-* tokens are used (they silently fall back to a wrong value):\n' +
                    undefinedUsed.map((u) => '  - ' + u).join('\n')
            )
        }
        expect(undefinedUsed).toEqual([])
    })

    it('literal z-index values are in the intentional allowlist (no unscoped literals)', () => {
        const bypasses = collectLiteralBypasses()
        if (bypasses.length) {
            const details = bypasses
                .map((h) => `  ${h.file}:${h.line}  z-index: ${h.value}`)
                .join('\n')
            throw new Error(
                `Found ${bypasses.length} literal z-index value(s) not in the allowlist ` +
                    `[${[...INTENTIONAL_ALLOWLIST].join(', ')}]. ` +
                    'Migrate them to var(--z-*) tokens.\n' + details
            )
        }
        expect(bypasses).toEqual([])
    })
})
