// tdb1-generate.mjs — semantic graph → TDB1 binary (v2, explicit record layout).
// NODE = u32 lead | f32 signal | u16 nbrCount | nbr[ u32 lead | f32 score | f32 sem | u8 flags ]
import { readFileSync, writeFileSync, statSync } from 'node:fs'
import { brotliCompressSync } from 'node:zlib'

const SRC = 'public/data/semantic_threads.dat'
const OUT = 'dist/svelte/data/semantic_threads.dat.bin'

const j = JSON.parse(readFileSync(SRC, 'utf8'))
const nodes = Object.values(j.nodes ?? {})

const out = []
out.push(Buffer.from('TDB1'))

const meta = Buffer.alloc(8)
meta.writeUInt32LE(nodes.length, 0)
let strBuf = Buffer.alloc(0) // v2: no string table needed (graph is numeric-only)
meta.writeUInt32LE(strBuf.length, 4)
out.push(meta)

let edges = 0
for (const n of nodes) {
    const rec = Buffer.alloc(10)
    rec.writeUInt32LE(Number(n.lead_id) || 0, 0)
    rec.writeFloatLE(Number(n.signal_score) || 0, 4)
    const nb = n.neighbors ?? []
    rec.writeUInt16LE(nb.length, 8)
    out.push(rec)
    edges += nb.length
    for (const b of nb) {
        const e = Buffer.alloc(13)
        e.writeUInt32LE(Number(b.lead_id) || 0, 0)
        e.writeFloatLE(Number(b.score) || 0, 4)
        e.writeFloatLE(Number(b.semantic_score) || 0, 8)
        e.writeUInt8((b.same_city ? 1 : 0) | (b.same_status ? 2 : 0) | (b.bridge ? 4 : 0), 12)
        out.push(e)
    }
}
writeFileSync(OUT, Buffer.concat(out))
const binBr = brotliCompressSync(readFileSync(OUT)).length
console.log(
    `TDB1 v2: ${(statSync(OUT).size / 1048576).toFixed(2)}MB | edges ${edges} | br ${(binBr / 1048576).toFixed(2)}MB | raw-json ${(statSync(SRC).size / 1048576).toFixed(1)}MB`
)
