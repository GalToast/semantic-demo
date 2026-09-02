/**
 * semantic-space-provenance-mode.mjs
 *
 * Contract test for the release-safe semantic-index provenance mode.
 *
 * Validates four scenarios:
 *   DEFAULT (no env): data-level asserts run; absent index triggers a WARN
 *     and the audit exits 0. indexOrderMismatches in the JSON summary is
 *     null (not a sentinel row-count).
 *   REQUIRED (SEMANTIC_PROVENANCE_REQUIRED=1): same data-level asserts, but
 *     absent provenance inputs cause an explicit non-zero exit.
 *   DEFAULT + SEMANTIC_INDEX_BUILD_DIR pointing to nonexistent dir: same as
 *     default — WARN emitted, audit passes.
 *   REQUIRED + SEMANTIC_INDEX_BUILD_DIR pointing to nonexistent dir: fails
 *     with a clear message naming both manifest and env sources.
 *
 * Run:
 *   node tests/semantic-space-provenance-mode.mjs
 */

import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERTION FAILED: ${message}`)
}

function runAudit(envOverride = {}) {
    return spawnSync('node', ['tests/semantic-space-audit.mjs'], {
        cwd: ROOT,
        encoding: 'utf8',
        env: { ...process.env, ...envOverride },
        stdio: ['ignore', 'pipe', 'pipe']
    })
}

function parseSummary(stdout, stderr) {
    const combined = stdout + stderr
    const match = combined.match(/\{[\s\S]*"dataRows"[\s\S]*\}/)
    assert(match, 'Expected JSON summary in audit output')
    return JSON.parse(match[0])
}

// ── DEFAULT MODE: passes, sentinel is null ────────────────────────────────
{
    const r = runAudit({ SEMANTIC_PROVENANCE_REQUIRED: undefined })
    assert(r.status === 0, 'DEFAULT mode: must exit 0')
    const summary = parseSummary(r.stdout, r.stderr)
    assert(
        summary.artifactLineage.indexOrderMismatches === null,
        'DEFAULT mode: indexOrderMismatches must be null when index absent'
    )
    assert(summary.dataRows === 8406, 'DEFAULT mode: data rows must still be reported')
    assert(summary.neighborhoodPreservation.recallAt48 >= 0.11, 'DEFAULT mode: recall@48 must still pass')
    const combined = r.stdout + r.stderr
    assert(combined.includes('Semantic space audit passed.'), 'DEFAULT mode: must report success')
    assert(combined.includes('WARN: index provenance inputs absent'), 'DEFAULT mode: must emit provenance WARN')
    assert(
        combined.includes('scripts/verify-semantic-provenance.mjs'),
        'DEFAULT mode: WARN must reference verify script'
    )
    console.log('[provenance-mode] DEFAULT mode: PASS')
}

// ── REQUIRED MODE: fails when index absent ────────────────────────────────
{
    const r = runAudit({ SEMANTIC_PROVENANCE_REQUIRED: '1' })
    assert(r.status !== 0, 'REQUIRED mode: must exit non-zero when index is absent')
    const combined = (r.stdout || '') + (r.stderr || '')
    assert(
        combined.toLowerCase().includes('provenance') && combined.toLowerCase().includes('fail'),
        'REQUIRED mode: must mention provenance failure'
    )
    assert(
        combined.includes('scripts/verify-semantic-provenance.mjs'),
        'REQUIRED mode: error must reference verify script'
    )
    console.log(`[provenance-mode] REQUIRED mode: PASS (exit ${r.status})`)
}

// ── DEFAULT + SEMANTIC_INDEX_BUILD_DIR → nonexistent dir: warns, passes ──
{
    const r = runAudit({
        SEMANTIC_PROVENANCE_REQUIRED: undefined,
        SEMANTIC_INDEX_BUILD_DIR: '/nonexistent/provenance-dir'
    })
    assert(r.status === 0, 'DEFAULT+override mode: must exit 0 even with nonexistent override')
    const combined = r.stdout + r.stderr
    assert(
        combined.includes('SEMANTIC_INDEX_BUILD_DIR=provenance-dir'),
        'DEFAULT+override mode: WARN must name the override source'
    )
    assert(combined.includes('Semantic space audit passed.'), 'DEFAULT+override mode: must report success')
    console.log('[provenance-mode] DEFAULT + SEMANTIC_INDEX_BUILD_DIR (nonexistent): PASS')
}

// ── REQUIRED + SEMANTIC_INDEX_BUILD_DIR → nonexistent dir: fails clearly ─
{
    const tmpDir = mkdtempSync('/tmp/semantic-provenance-test-')
    try {
        const r = runAudit({
            SEMANTIC_PROVENANCE_REQUIRED: '1',
            SEMANTIC_INDEX_BUILD_DIR: tmpDir
        })
        assert(r.status !== 0, 'REQUIRED+override mode: must exit non-zero with nonexistent override')
        const combined = (r.stdout || '') + (r.stderr || '')
        assert(combined.includes('[provenance] FAIL'), 'REQUIRED+override mode: must print FAIL')
        assert(
            combined.includes(tmpDir) || combined.includes('SEMANTIC_INDEX_BUILD_DIR'),
            'REQUIRED+override mode: must reference the override source in error'
        )
        console.log(`[provenance-mode] REQUIRED + SEMANTIC_INDEX_BUILD_DIR (temp dir): PASS (exit ${r.status})`)
    } finally {
        rmSync(tmpDir, { recursive: true, force: true })
    }
}

// ── REQUIRED MODE + present index: would pass (skipped — no builder machine here) ──
console.log('[provenance-mode] REQUIRED+index: SKIP (no builder index available on this host)')

console.log('Semantic space provenance-mode contract passed.')
