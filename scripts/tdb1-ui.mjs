// tdb1-ui.mjs — TDB-UI generator for semantic_threads_ui.dat (40MB sibling).
// NODE = u32 lead | f32 signal | u16 nbrs
// EDGE = u32 lead | f32 score | f32 sem | f32 bridge | f32 nodeSignal
//        u8 flags(bit0 same_city,1 same_status) | u16 threadType | u16 roleIdx | u16 axisIdx
import { readFileSync, writeFileSync, statSync } from 'node:fs'
import { brotliCompressSync } from 'node:zlib'

const SRC = 'public/data/semantic_threads_ui.dat'
const OUT = 'tmp/perf9/semantic_threads_ui.dat.bin'

const j = JSON.parse(readFileSync(SRC, 'utf8'))
const nodes = Object.values(j.nodes ?? {})

const strtab = []
const strIdx = new Map()
function intern(s) {
  let i = strIdx.get(s)
  if (i === undefined) { i = strtab.length; strtab.push(String(s)); strIdx.set(s, i) }
  return i
}

const outChunks = [Buffer.from('TDBU'), Buffer.alloc(8)]
let edges = 0
for (const n of nodes) {
  const nb = n.neighbors ?? []
  edges += nb.length
  const rec = Buffer.alloc(10)
  rec.writeUInt32LE(Number(n.lead_id) || 0, 0)
  rec.writeFloatLE(Number(n.signal_score) || 0, 4)
  rec.writeUInt16LE(nb.length, 8)
  outChunks.push(rec)
  for (const b of nb) {
    const e = Buffer.alloc(27)
    e.writeUInt32LE(Number(b.lead_id) || 0, 0)
    e.writeFloatLE(Number(b.score) || 0, 4)
    e.writeFloatLE(Number(b.semantic_score) || 0, 8)
    e.writeFloatLE(Number(b.bridge_score) || 0, 12)
    e.writeFloatLE(Number(b.signal_score) || 0, 16)
    e.writeUInt8((b.same_city ? 1 : 0) | (b.same_status ? 2 : 0), 20)
    e.writeUInt16LE(intern(String(b.thread_type ?? '')), 21)
    e.writeUInt16LE(intern(String(b.relationship_role ?? '')), 23)
    e.writeUInt16LE(intern(String(b.relationship_axis ?? '')), 25)
    outChunks.push(e)
  }
}
const payload = Buffer.concat(outChunks)
const strBuf = Buffer.from(strtab.join('\u0000') + '\u0000', 'utf8')
const header = Buffer.alloc(8)
header.writeUInt32LE(nodes.length, 0)
header.writeUInt32LE(strBuf.length, 4)
const bin = Buffer.concat([Buffer.from('TDBU'), header, payload.subarray(8), strBuf])

writeFileSync(OUT, bin)
const rawMB = statSync(SRC).size / 1048576
const binMB = bin.length / 1048576
const br = brotliCompressSync(bin).length / 1048576
console.log(`TDBU: ${binMB.toFixed(2)}MB vs ${rawMB.toFixed(1)}MB -> ${((1 - binMB / rawMB) * 100).toFixed(0)}% smaller | edges ${edges} | str ${strtab.length} | br ${br.toFixed(2)}MB`)