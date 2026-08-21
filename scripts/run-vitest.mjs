#!/usr/bin/env node
/**
 * scripts/run-vitest.mjs — heap-bounded vitest launcher.
 *
 * The unit suite outgrew the default Node heap (vmThreads pool holds the
 * whole module graph; the lane's contract wave pushed collection past it ->
 * `MarkCompactCollector: young object promotion failed` RC=134 ~20s in).
 * NODE_OPTIONS inline prefixes don't survive npm's cmd.exe invocation on
 * Windows, so this wrapper re-spawns node with an explicit heap ceiling and
 * forwards all CLI args to vitest unchanged.
 *
 * Usage: node scripts/run-vitest.mjs [vitest args...]
 *   (package.json: "test:unit": "node scripts/run-vitest.mjs run --config vitest.config.js")
 */
import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// vitest does not export ./vitest.mjs via package exports; resolve on disk.
const vitestEntry = join(dirname(fileURLToPath(import.meta.resolve('vitest/package.json'))), 'vitest.mjs')

const HEAP_MB = process.env.VITEST_HEAP_MB ?? '6144'
const child = spawn(process.execPath, ['--max-old-space-size=' + HEAP_MB, vitestEntry, ...process.argv.slice(2)], {
    stdio: 'inherit'
})
child.on('exit', (code, signal) => {
    if (signal) process.kill(process.pid, signal)
    process.exit(code ?? 0)
})
