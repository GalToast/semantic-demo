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

            const filePath = join(entry.parentPath, name)
            const fileSize = (await stat(filePath)).size
            violations.push({ path: filePath, size: fileSize })
        })
    )

    return violations
}

async function main() {
    const violations = await findUncompressed(DIST)

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
    console.log(`  w44-asset-compression plugin writes .br/.gz twins and deletes originals.`)
    process.exit(1)
}

main().catch((err) => {
    console.error(`${RED}data-compression gate error:${RESET}`, err)
    process.exit(1)
})
