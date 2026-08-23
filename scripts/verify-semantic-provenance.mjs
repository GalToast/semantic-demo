#!/usr/bin/env node
/**
 * verify-semantic-provenance.mjs — operator-run provenance re-arm (2026-08-23).
 *
 * The shipped layout manifest used to embed a machine-local index_dir and the
 * semantic-space audit equality check silently skipped when the index build was
 * absent — the "honesty gate" for the semantic plane died by cleanup (018c2d2a).
 * This script restores the same check as an explicit operator step on the
 * machine that OWNS the index build:
 *
 *   SEMANTIC_INDEX_BUILD_DIR=C:/.../index-rich-0.6b-YYYYMMDD \
 *     node scripts/verify-semantic-provenance.mjs
 *
 * Checks:
 *   1. index build present (manifest.json + metadata.json + embeddings.npy)
 *   2. sha256(index embeddings.npy) === reference tmp/fixtures/qwen3_embeddings.npy
 *   3. index manifest count === metadata rows === shipped layout manifest rows
 *      (the geometric plane was built from THIS index's embeddings)
 *
 * Verified 2026-08-23 (4 paths, tmp/fixtures/provenance-sim throwaway):
 *   clean copy -> PASS exit 0; tampered embeddings -> FAIL hash; count 8405 ->
 *   FAIL count; metadata 8405 rows -> FAIL; no env -> SKIP-FAIL loud guidance.
 * Reference fixture: tmp/fixtures/qwen3_embeddings.npy, shape (8406,1024) f32,
 *   sha256 6610beecf25d8d12fb3c30d990b55bc33a4b1183574ba326e8563d005b9278a5.
 *
 * HONEST LIMITATION: this gate's MECHANISM is verified, but the reference
 * fixture's OWN provenance is NOT re-derivable on this machine — the builder
 * machine's index build dir was purged (018c2d2a) and no other embeddings.npy
 * survives. The gate anchors to this fixture; re-establish the anchor from the
 * original embedding run / git history before treating a PASS as proof the
 * shipped layout was built from the reference embeddings. Same audit-of-audits
 * gap as F6 (a claim that can't be re-derived from disk).
 *
 * Exit: 0 = provenance verified; 1 = mismatch/missing (read message).
 */
import { existsSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve, join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const INDEX_DIR = resolve(process.env.SEMANTIC_INDEX_BUILD_DIR || '')
const REFERENCE = resolve(ROOT, 'tmp', 'fixtures', 'qwen3_embeddings.npy')
const LAYOUT_MANIFEST = resolve(ROOT, 'public', 'data', 'semantic_space_layout_manifest.json')

function sha256(p) {
    return createHash('sha256').update(readFileSync(p)).digest('hex')
}

function fail(msg) {
    console.error('[provenance] FAIL:', msg)
    process.exit(1)
}

if (!process.env.SEMANTIC_INDEX_BUILD_DIR) {
    console.error(
        '[provenance] SKIP-FAIL: SEMANTIC_INDEX_BUILD_DIR not set. Re-arm usage:\n' +
            '  On the builder machine, point it at the layout index build (manifest.json,\n' +
            '  metadata.json, embeddings.npy), e.g. the dir previously stored as\n' +
            '  layout manifest index_dir (index-rich-0.6b-*), then re-run this script.'
    )
    process.exit(1)
}

const manifestPath = join(INDEX_DIR, 'manifest.json')
const metadataPath = join(INDEX_DIR, 'metadata.json')
const embeddingsPath = join(INDEX_DIR, 'embeddings.npy')
for (const p of [manifestPath, metadataPath, embeddingsPath]) {
    if (!existsSync(p)) fail(`missing ${p}`)
}

const embHash = sha256(embeddingsPath)

const indexManifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
const layout = JSON.parse(readFileSync(LAYOUT_MANIFEST, 'utf8'))
const metadataRows = JSON.parse(readFileSync(metadataPath, 'utf8'))
const metaLen = Array.isArray(metadataRows) ? metadataRows.length : Number(metadataRows?.count || 0)
const errs = []
if (Number(indexManifest.count) !== 8406) errs.push(`index manifest count ${indexManifest.count} != 8406`)
if (metaLen !== 8406) errs.push(`index metadata rows ${metaLen} != 8406`)
if (Number(layout.rows) !== 8406) errs.push(`shipped layout rows ${layout.rows} != 8406`)
if (errs.length) fail(errs.join('; '))

// SELF-DESCRIBING PROVENANCE (2026-08-23): when the shipped manifest declares
// embeddings_sha256 (requirement documented in public/data/README.md), that
// declared value is authoritative and no external fixture is needed. Older
// manifests fall back to the tmp/fixtures reference comparison.
const declaredSha = typeof layout.embeddings_sha256 === 'string' ? layout.embeddings_sha256.toLowerCase() : ''
if (declaredSha) {
    if (declaredSha !== embHash) {
        fail(
            `index embeddings.npy hash ${embHash.slice(0, 16)} != manifest-declared ${declaredSha.slice(0, 16)}. ` +
                'The layout was NOT built from these embeddings — provenance broken.'
        )
    }
    console.log('[provenance] PASS — index build matches the manifest-declared embeddings_sha256; counts 8406/8406/8406.')
    console.log(`[provenance] declared+verified sha256: ${declaredSha}`)
} else {
    if (!existsSync(REFERENCE)) {
        fail(
            `reference missing: ${REFERENCE}. Restore tmp/fixtures/qwen3_embeddings.npy ` +
                '(gitignored fixture), or regenerate the layout with an embeddings_sha256 field ' +
                '(self-describing provenance — see public/data/README.md).'
        )
    }
    const refHash = sha256(REFERENCE)
    if (embHash !== refHash) {
        fail(
            `index embeddings.npy hash ${embHash.slice(0, 16)} != reference ${refHash.slice(0, 16)}. ` +
                'The layout was NOT built from the reference embeddings — provenance broken.'
        )
    }
    console.log('[provenance] PASS — index build embeddings match the reference fixture; counts 8406/8406/8406.')
    console.log(`[provenance] reference sha256: ${refHash}`)
    console.log('[provenance] NOTE: manifest lacks embeddings_sha256 (pre-self-describing build); fixture anchor in use.')
}
