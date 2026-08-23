#!/usr/bin/env node
/**
 * decompress-data-twins.mjs — restore plain data files for non-negotiating servers.
 *
 * The W44 Phase F twin pipeline (vite.config.ts closeBundle) writes .br/.gz twins
 * for dist/svelte/data/* and DELETES the plain originals (keep-set data.dat only).
 * Vite's own middleware negotiates encodings, but `npm run serve` uses
 * `php -S 127.0.0.1:8795 -t .`, which does NOT — every plain data URL 404s and the
 * app silently falls back to geometric mode ("0 related businesses" ghost bugs).
 *
 * This restores plains from the .br twins. Idempotent, fast (~2s for 100MB).
 * Wire: npm run serve = node scripts/decompress-data-twins.mjs && php -S ...
 */
import { readdir, writeFile, stat } from 'node:fs/promises'
import { brotliDecompressSync } from 'node:zlib'
import { resolve, basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..')
const DATA_DIR = resolve(ROOT, 'dist', 'svelte', 'data')

async function main() {
    let restored = 0
    let already = 0
    let entries
    try {
        entries = await readdir(DATA_DIR)
    } catch {
        console.log(`[decompress-data-twins] no ${DATA_DIR} — nothing to do (run build first)`)
        return
    }
    for (const name of entries) {
        if (!name.endsWith('.br')) continue
        const twin = join(DATA_DIR, name)
        const plain = join(DATA_DIR, basename(name, '.br'))
        try {
            const existing = await stat(plain)
            if (existing.isFile()) {
                already += 1
                continue
            }
        } catch {
            /* plain missing — restore it */
        }
        const compressed = await import('node:fs/promises').then((fs) => fs.readFile(twin))
        await writeFile(plain, brotliDecompressSync(compressed))
        restored += 1
    }
    console.log(`[decompress-data-twins] restored ${restored} plain(s), ${already} already present`)
}

main().catch((err) => {
    console.error('[decompress-data-twins] failed:', err.message)
    process.exitCode = 1
})