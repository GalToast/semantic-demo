// tdb1-ensure.mjs — build-time seam: ensure the .bin + rows.bin exist (generate
// if missing/older than the JSON), and return PASS/FAIL for the pipeline.
import { existsSync, statSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const PAIRS = [
    {
        bin: 'dist/svelte/data/semantic_threads.dat.bin',
        gen: 'scripts/tdb1-generate.mjs',
        src: 'public/data/semantic_threads.dat'
    },
    { bin: 'dist/svelte/data/rows.bin', gen: 'scripts/tdb1-rows.mjs', src: 'src/data.dat' }
]

let pass = true
for (const { bin, gen, src } of PAIRS) {
    const needs = !existsSync(bin) || (existsSync(src) && statSync(src).mtimeMs > statSync(bin).mtimeMs)
    if (needs) {
        const r = spawnSync(process.execPath, [gen], { stdio: 'inherit' })
        if (r.status !== 0) {
            console.error(`[tdb-ensure] ${gen} failed`)
            pass = false
            continue
        }
    }
    if (!existsSync(bin)) {
        console.error(`[tdb-ensure] missing ${bin}`)
        pass = false
        continue
    }
    console.log(`[tdb-ensure] OK ${bin} (${(statSync(bin).size / 1048576).toFixed(2)}MB)`)
}
console.log(pass ? '[tdb-ensure] ALL PASS' : '[tdb-ensure] FAIL')
process.exit(pass ? 0 : 1)
