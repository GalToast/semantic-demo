#!/usr/bin/env node
/**
 * scripts/check-data-compression.mjs
 *
 * CI gate: fail if uncompressed .dat/.json data assets ship in dist/svelte/.
 *
 * The W44 asset-compression plugin (vite.config.ts closeBundle) writes .br/.gz
 * twins for large data assets and then deletes the uncompressed originals.
 * This gate verifies the deletion actually happened — if a future build
 * regresses (e.g. VITE_COMPRESS_ASSETS=false, plugin disabled, or the
 * deletion loop skips a file), the gate catches it before the 157 MB
 * footprint returns.
 *
 * Exit 0 = clean (only .br/.gz twins present).
 * Exit 1 = uncompressed data files found.
 */

import { readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'

const RESET = '\x1b[0m'
const BOLD = '\x1b[1m'
const RED = '\x1b[31m'
const GREEN = '\x1b[32m'
const DIM = '\x1b[2m'

const DIST = join(process.cwd(), 'dist', 'svelte')

/** File extensions that must never ship uncompressed. */
const PROTECTED_EXTENSIONS = ['.dat', '.json']

/**
 * Data assets exempted from the compression gate. `data.dat` (1.8 MB, the
 * 8,406-point mycelium) is kept uncompressed as the reliable data path
 * outside Vite — the PHP origin on 8795 and the visual-audit static server
 * do not have Vite's `serveRootAssets` middleware, which is the only thing
 * that can serve the `.gz`/`.br` twin with the right `Content-Encoding`
 * header. Without the uncompressed file, `data.dat` 404s, the data worker
 * never resolves, and the engine never builds. The `.gz`/`.br` twins are
 * still written for Vite-served environments. Cost: ~0.4% of the dist
 * budget. All other `.dat`/`.json` assets remain compressed.
 */
const UNCOMPRESSED_EXEMPTIONS = new Set(['data.dat'])

async function findUncompressed(dir) {
    const violations = []
    let entries
    try {
        entries = await readdir(dir, { recursive: true, withFileTypes: true })
    } catch {
        // dist/ doesn't exist yet — nothing to check
        return violations
    }

    await Promise.all(
        entries.map(async (entry) => {
            if (!entry.isFile()) return
            const name = entry.name
            const isProtected = PROTECTED_EXTENSIONS.some((ext) => name.endsWith(ext))
            // Skip compressed twins — they're expected.
            if (name.endsWith('.br') || name.endsWith('.gz')) return
            if (!isProtected) return
            // Skip exempted assets (see UNCOMPRESSED_EXEMPTIONS).
            if (UNCOMPRESSED_EXEMPTIONS.has(name)) return

            const filePath = join(entry.parentPath, name)
            const fileSize = (await stat(filePath)).size
            violations.push({ path: filePath, size: fileSize })
        })
    )

    return violations
}

/**
 * Required runtime assets that must exist in dist/svelte with a sane minimum
 * size. `data.dat` is the canonical 8,406-point mycelium dataset copied from
 * src/data.dat by vite's ROOT_ASSETS map; if the source goes missing (it is
 * gitignored — see qa-ready.mjs "points:0 silently") the build must FAIL here
 * instead of shipping an empty app.
 */
const REQUIRED_ASSETS = [{ path: 'data.dat', minBytes: 1024 * 1024 }]

async function assertRequiredAssets() {
    const missing = []
    for (const { path, minBytes } of REQUIRED_ASSETS) {
        try {
            const st = await stat(join(DIST, path))
            if (st.size < minBytes) {
                missing.push(
                    `${path} exists but is only ${(st.size / 1024).toFixed(1)} KB (< ${(minBytes / 1024).toFixed(0)} KB — truncated?)`
                )
            }
        } catch {
            missing.push(
                `${path} MISSING from dist — src/data.dat absent at build time? Restore it (copy from another checkout or regenerate) and rebuild.`
            )
        }
    }
    return missing
}

async function main() {
    const assetFailures = await assertRequiredAssets()
    const violations = await findUncompressed(DIST)

    if (assetFailures.length > 0) {
        console.log(`${RED}✗${RESET} ${BOLD}data-compression gate FAILED${RESET} — required runtime assets:`)
        for (const f of assetFailures) console.log(`  ${RED}→${RESET} ${f}`)
        process.exit(1)
    }

    if (violations.length === 0) {
        console.log(
            `${GREEN}✓${RESET} ${BOLD}data-compression gate${RESET}: no uncompressed .dat/.json in dist/svelte/`
        )
        process.exit(0)
    }

    console.log(`${RED}✗${RESET} ${BOLD}data-compression gate FAILED${RESET}`)
    console.log(`  ${violations.length} uncompressed data asset(s) found in ${DIM}${DIST}${RESET}:`)
    for (const { path, size } of violations) {
        const relPath = path.replace(process.cwd() + '/', '')
        const sizeKB = (size / 1024).toFixed(1)
        console.log(`  ${RED}→${RESET} ${relPath} (${sizeKB} KB)`)
    }
    console.log('')
    console.log(`  ${BOLD}Fix:${RESET} rebuild with VITE_COMPRESS_ASSETS=true (default) so the`)
    console.log(`  w44-asset-compression plugin writes .br/.gz twins. Note: data.dat is`)
    console.log(`  intentionally kept uncompressed (see UNCOMPRESSED_EXEMPTIONS).`)
    process.exit(1)
}

main().catch((err) => {
    console.error(`${RED}data-compression gate error:${RESET}`, err)
    process.exit(1)
})
