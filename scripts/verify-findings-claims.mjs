#!/usr/bin/env node
/**
 * verify-findings-claims.mjs — second-evidence witness for the campaign register.
 *
 * tmp/prod-readiness-findings.md is the ledger of "what we found and shipped".
 * 2026-08-23 audit-of-the-audit caught a WRONG fact in it (F6 claimed qwen3 was
 * git-tracked; it was never tracked). Policy: before citing any entry, re-derive
 * its key facts from disk via this witness. CI-runnable:
 *
 *   node scripts/verify-findings-claims.mjs
 *
 * Exit 0 = every checked claim matches disk truth; 1 = drift (read the FAIL lines).
 * NOTE: this checks the ARTIFACTS the register cites — not the register's prose.
 */
import { existsSync, readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(resolve(ROOT, p), 'utf8')

const results = []
function check(label, ok, detail = '') {
    results.push({ label, ok, detail })
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  → ' + detail : ''}`)
}
function failCount() {
    return results.filter((r) => !r.ok).length
}

// F1 — TDB fixture-ensure exists + is hooked into vitest globalSetup
check('F1: tdb1-fixture-ensure.mjs exists', existsSync(resolve(ROOT, 'scripts', 'tdb1-fixture-ensure.mjs')))
const vitestCfg = read('vitest.config.js')
check('F1: vitest globalSetup uses tdb1-fixture-ensure', /tdb1-fixture-ensure/.test(vitestCfg))

// F2 — commit-purity exemption for eea3c242 present
check(
    'F2: commit-purity EXEMPTED_SHAS holds eea3c242...',
    /eea3c242/.test(read('tests/unit-active/commit-purity-invariant.test.ts'))
)

// F5 — budget baseline blessed state (gate re-arm landed 2026-08-23)
const budgetTxt = read('scripts/qa-budget.mjs')
check('F5: qa-budget write requires --note (re-arm policy)', /--baseline write requires --note/.test(budgetTxt))
check('F5: 2026-08-22 baseline exists', existsSync(resolve(ROOT, 'docs', 'budget-baseline-2026-08-22.json')))

// F6 — qwen3 moved to gitignored fixture, gone from public/data
const gi = read('.gitignore')
check('F6: qwen3 .npy still gitignored', /public\/data\/qwen3_embeddings\.npy/.test(gi))
check('F6: qwen3 no longer in public/data', !existsSync(resolve(ROOT, 'public', 'data', 'qwen3_embeddings.npy')))
check('F6: fixture preserved at tmp/fixtures', existsSync(resolve(ROOT, 'tmp', 'fixtures', 'qwen3_embeddings.npy')))

// P1 — flat FilesMatch compression rules in deployed .htaccess
const ht = read('.htaccess')
check('P1: .htaccess ships FilesMatch twin negotiation', /<FilesMatch/.test(ht) && /br|gz/.test(ht))

// P4 — decision doc + twins in the build tree
check(
    'P4: data-asset-distribution decision doc exists',
    existsSync(resolve(ROOT, 'docs', 'ops', 'data-asset-distribution-decision.md'))
)
const dataDir = resolve(ROOT, 'dist', 'svelte', 'data')
// DURABLE check (2026-08-23): the plain .dat is build-DELETED by the
// compression gate's closeBundle, so it only exists transiently after
// `npm run serve`. What's durable is the MECHANISM: the decompress helper
// exists, `npm run serve` wires it, and the .br twin ships in dist. Testing
// the transient plain would fail in CI after every build - a mis-specified
// claim, not a real regression.
const pkgJson = read('package.json')
check('P4: decompress-data-twins helper exists', existsSync(resolve(ROOT, 'scripts', 'decompress-data-twins.mjs')))
check('P4: npm run serve wires the decompress helper', /"serve"[\s\S]*?decompress-data-twins/.test(pkgJson))
check('P4: dist/svelte/data has .br twin', existsSync(resolve(dataDir, 'semantic_threads.dat.br')))

// P6 — legacy URL redirect present (origin-verified 2026-08-23)
check(
    'P6: legacy 308 redirect in .htaccess',
    /Redirect 308 \/semantic-demo\/vector-explorer-polished\.html \/semantic-demo\/index\.html/.test(ht)
)

// P7 — honest pill copy + guard test present
check('P7: rail-status pill is honest (no "Demo data")', !/Demo data/.test(read('src/lib/rail/rail-status.ts')))
check(
    'P7: friendly-copy guard test exists',
    existsSync(resolve(ROOT, 'tests', 'unit-active', 'thread-lens-friendly-copy.test.ts'))
)

// Manifest purge (018c2d2a) — foreign paths gone, portable basenames
const manifest = JSON.parse(read('public/data/semantic_space_layout_manifest.json'))
check('Manifest: no index_dir shipped', !('index_dir' in manifest))
check('Manifest: portable data_path', manifest.data_path === 'data.dat')

// P5 — semantic lane supervisor knobs exist
check(
    'P5: semantic lane restart cooldown exists',
    /SEMANTIC_LANE_RESTART_COOLDOWN_SECONDS/.test(read('api/config.php'))
)

console.log(`\nWITNESS: ${failCount()} of ${results.length} checks drifted from disk truth`)
process.exit(failCount() === 0 ? 0 : 1)
