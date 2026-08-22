// tdb1-generate.mjs — semantic graph → TDB1 binary (via shared scripts/lib/tdb1-pack.mjs).
import { readFileSync, writeFileSync, statSync } from 'node:fs'
import { brotliCompressSync } from 'node:zlib'
import { packTdb1 } from './lib/tdb1-pack.mjs'

const SRC = 'public/data/semantic_threads.dat'
const OUT = 'dist/svelte/data/semantic_threads.dat.bin'

const { bin, edges } = packTdb1(SRC)
writeFileSync(OUT, bin)

const binBr = brotliCompressSync(readFileSync(OUT)).length
console.log(
    `TDB1 v2: ${(statSync(OUT).size / 1048576).toFixed(2)}MB | edges ${edges} | br ${(binBr / 1048576).toFixed(2)}MB | raw-json ${(statSync(SRC).size / 1048576).toFixed(1)}MB`
)
