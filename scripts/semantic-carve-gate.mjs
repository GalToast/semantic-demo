#!/usr/bin/env node
/**
 * semantic-threads carve fold-gate (main-lane, regenerated 2026-08-12)
 *
 * Verifies the semantic-threads normalize carve satisfies the split-plan
 * invariant BEFORE the main lane folds it:
 *   1. normalize fns exist in the sibling module.
 *   2. F1 pin resolves: EITHER hub re-exports the cached normalizer OR the
 *      worker-lifecycle test repointed to the sibling.
 *   3. F1 module-level cache state lives in the sibling WITH the fn.
 *   4. 0 `any` in the sibling.
 *   5. Hub baseline export surface preserved (allow the moved fn if pin-repointed).
 */
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const argv = process.argv.slice(2)
const opt = (name, dflt) => {
    const i = argv.indexOf(name)
    return i >= 0 ? argv[i + 1] : dflt
}
const BASELINE = opt('--baseline', 'upstream/master')
const HUB = resolve('src/lib/engine/semantic-threads.ts')
const SIBLING = resolve('src/lib/engine/semantic-threads-normalize.ts')
const TEST = resolve('tests/unit-active/semantic-threads-worker-lifecycle.test.ts')
const rel = (p) => (p.startsWith(process.cwd()) ? p.slice(process.cwd().length + 1).replaceAll('\\', '/') : p)

let fail = false
const check = (label, ok, detail = '') => {
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`)
    if (!ok) fail = true
}

const sib = readFileSync(SIBLING, 'utf-8')
const hub = readFileSync(HUB, 'utf-8')

for (const fn of ['normalizeLeadId', 'normalizeSemanticNeighborEntries']) {
    check(`sibling defines ${fn}`, new RegExp(`function\\s+${fn}\\b`).test(sib))
}
check('sibling has cached normalizer', /normalizeSemanticNeighborEntriesCached/.test(sib))

const hubReexports =
    /export\s*\{[^}]*normalizeSemanticNeighborEntriesCached[^}]*\}\s*from\s*['"]\.\/semantic-threads-normalize['"]/.test(
        hub
    )
const pinSibling = /import\s*\(\s*['"]\.\.\/src\/lib\/engine\/semantic-threads-normalize['"]/.test(
    readFileSync(TEST, 'utf-8')
)
check(
    'F1 pin satisfied (hub re-export OR test repoint)',
    hubReexports || pinSibling,
    hubReexports ? 'hub-re-export' : pinSibling ? 'test-repoint' : 'NEITHER'
)

const f1state = /(lastNormalizedKey|lastNormalizedOutput|_lastNormalized)/
check('F1 module-level cache state in sibling', f1state.test(sib))
check('hub single-ownership (no F1 re-declare)', !f1state.test(hub) || /semantic-threads-normalize/.test(hub))

check('sibling 0 any', !/\bany\b/.test(sib))

const baseline = execSync(`git show ${BASELINE}:${rel(HUB)}`, { encoding: 'utf-8', cwd: resolve('.') })
const names = (s) => {
    const out = new Set(
        [
            ...s.matchAll(
                /^export\s+(?:async\s+)?(?:function|const|class|type|interface|let|enum)\s+([A-Za-z_$][\w$]*)/gm
            )
        ].map((m) => m[1])
    )
    for (const m of s.matchAll(/^export\s*\{([^}]*)\}\s*from/gm)) {
        for (const item of m[1].split(',')) {
            const part = item.trim()
            if (!part) continue
            const as = part.match(/(\w+)\s+as\s+(\w+)/)
            out.add(as ? as[2] : part)
        }
    }
    return out
}
const base = names(baseline)
const now = names(hub)
const missing = [...base].filter((n) => !now.has(n))
const allowed = pinSibling ? ['normalizeSemanticNeighborEntriesCached'] : []
const real = missing.filter((n) => !allowed.includes(n))
check(
    'hub baseline exports preserved',
    real.length === 0,
    real.length ? `MISSING: ${real.join(', ')}` : `(${base.size} -> ${now.size})`
)

console.log(fail ? '\nFOLD BLOCKER — carve fails contract' : '\nCARVE FOLD-GATE: PASS — ready to fold')
process.exitCode = fail ? 1 : 0
