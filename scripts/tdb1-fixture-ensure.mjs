// tdb1-fixture-ensure.mjs — vitest globalSetup: makes the TDB unit-test fixtures
// self-healing. tests/unit-active/semantic-tdb{,-fidelity}.test.ts read
// tmp/perf9/semantic_threads.dat.bin and tmp/perf9/semantic_threads_ui.dat.bin
// (gitignored); this regenerates them from the committed JSON oracles when
// missing or stale. No-op when fresh — zero cost per run.
import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { packTdb1, packTdbUi } from './lib/tdb1-pack.mjs'

const FIXTURES = [
    { src: 'public/data/semantic_threads.dat', out: 'tmp/perf9/semantic_threads.dat.bin', pack: packTdb1 },
    { src: 'public/data/semantic_threads_ui.dat', out: 'tmp/perf9/semantic_threads_ui.dat.bin', pack: packTdbUi }
]

export async function setup() {
    for (const { src, out, pack } of FIXTURES) {
        const srcPath = join(process.cwd(), src)
        const outPath = join(process.cwd(), out) // cwd-relative = what the tests read
        const srcStat = statSync(srcPath)
        if (existsSync(outPath) && statSync(outPath).mtimeMs >= srcStat.mtimeMs) continue
        mkdirSync(dirname(outPath), { recursive: true })
        const { bin, edges } = pack(srcPath)
        writeFileSync(outPath, bin)
        const mb = (statSync(outPath).size / 1048576).toFixed(2)
        console.log(`[tdb1-fixture-ensure] generated ${outPath} (${mb}MB, ${edges} edges)`)
    }
    return null
}

export default setup

// Direct execution (manual/CI): node scripts/tdb1-fixture-ensure.mjs
if (import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, '/')}`) {
    setup().catch((err) => {
        console.error('[tdb1-fixture-ensure] failed:', err)
        process.exit(1)
    })
}
