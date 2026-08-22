// tdb1-ui.mjs — TDB-UI generator for semantic_threads_ui.dat (via shared scripts/lib/tdb1-pack.mjs).
import { readFileSync, writeFileSync, statSync } from 'node:fs'
import { brotliCompressSync } from 'node:zlib'
import { packTdbUi } from './lib/tdb1-pack.mjs'

const SRC = 'public/data/semantic_threads_ui.dat'
const OUT = 'dist/svelte/data/semantic_threads_ui.dat.bin'

const { bin, edges, strCount } = packTdbUi(SRC)
writeFileSync(OUT, bin)

const rawMB = statSync(SRC).size / 1048576
const binMB = bin.length / 1048576
const br = brotliCompressSync(bin).length / 1048576
console.log(
    `TDBU: ${binMB.toFixed(2)}MB vs ${rawMB.toFixed(1)}MB -> ${((1 - binMB / rawMB) * 100).toFixed(0)}% smaller | edges ${edges} | str ${strCount} | br ${br.toFixed(2)}MB`
)
