#!/usr/bin/env node
/**
 * verify-syntax.mjs — fail-fast PARSE pre-check for the verification gate.
 *
 * WHY: a single parse-error (stray brace, truncated edit) in any src/ or tests/
 * file silently cascades into dozens of "failed test files" (the 61-file wall
 * we hit 2026-08-11 from one dangling '}' at semantic-threads.ts:424). Any
 * dev who sees "61 failed" assumes a real regression. This script runs BEFORE
 * the heavy suites and answers the cheap question first: "does every TS file
 * PARSE?" — in a few seconds, no type-checking, no build, no network.
 *
 * Uses:
 *   typescript.createSourceFile + parseDiagnostics — fastest pure-syntax signal.
 *   $state runes parse fine as TS call-syntax (no transform needed).
 *
 * Exit: 0 = all files parse; 1 = first parse error printed as file:line + count.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, extname } from 'node:path'
import ts from 'typescript'

const ROOTS = ['src', 'tests', 'scripts']
const EXTS = new Set(['.ts', '.mts', '.cts'])
const SKIP_DIRS = new Set(['node_modules', 'dist', 'dist2', '.git', 'fixtures', 'data', '__snapshots__'])
const CWD = process.cwd()

function walk(dir, out = []) {
    let entries
    try {
        entries = readdirSync(dir, { withFileTypes: true })
    } catch {
        return out
    }
    for (const e of entries) {
        const p = join(dir, e.name)
        if (e.isDirectory()) {
            if (!SKIP_DIRS.has(e.name) && !e.name.endsWith('.worker')) walk(p, out)
        } else if (EXTS.has(extname(e.name))) {
            out.push(p)
        }
    }
    return out
}

const all = ROOTS.flatMap((r) => walk(join(CWD, r)))
const diagnostics = []
let checked = 0

for (const file of all) {
    const text = readFileSync(file, 'utf8')
    const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true)
    for (const d of sf.parseDiagnostics) {
        const { line, character } = sf.getLineAndCharacterOfPosition(d.start ?? 0)
        diagnostics.push(
            `${relative(CWD, file)}:${line + 1}:${character + 1} — ${ts.flattenDiagnosticMessageText(d.messageText, '\n')}`
        )
    }
    checked++
}

if (diagnostics.length) {
    console.error(
        `✗ PARSE FAIL — ${all.length} files checked, ${diagnostics.length} parse error(s) in ${
            all.filter((f) => {
                const t = readFileSync(f, 'utf8')
                const sf = ts.createSourceFile(f, t, ts.ScriptTarget.Latest, true)
                return sf.parseDiagnostics.length > 0
            }).length
        } file(s):`
    )
    console.error(diagnostics.slice(0, 10).join('\n'))
    if (diagnostics.length > 10) console.error(`  … and ${diagnostics.length - 10} more`)
    process.exit(1)
}
console.log(`✓ syntax OK — ${checked} TS files parse clean (${new Date().toISOString()})`)
