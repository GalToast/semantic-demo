// tdb1-gen.mjs — TDB1 binary prototype (semantic graph): nodes × neighbors.
import { readFileSync, writeFileSync, statSync } from 'node:fs'
import { gzipSync, brotliCompressSync } from 'node:zlib'

const P = 'public/data/semantic_threads.dat'
const OUT = 'tmp/perf9/semantic_threads.dat.bin'

const t0 = Date.now()
const raw = readFileSync(P, 'utf8')
const j = JSON.parse(raw)
const nodes = Object.values(j.nodes ?? {})
const jsonBytes = statSync(P).size
console.log('nodes:', nodes.length, '| parse-ms:', Date.now() - t0, '| json-MB:', (jsonBytes / 1048576).toFixed(1))

const strtab = []
const strIdx = new Map()
function intern(s) {
  let i = strIdx.get(s)
  if (i === undefined) {
    i = strtab.length
    strtab.push(String(s))
    strIdx.set(s, i)
  }
  return i
}

const chunks = []
let edges = 0
for (const n of nodes) {
  const nb = n.neighbors ?? []
  edges += nb.length
  chunks.push(Buffer.from(Uint32Array.from([n.lead_id ?? 0])))
  chunks.push(Buffer.from(Float32Array.of(Number(n.signal_score ?? 0))))
  chunks.push(Buffer.from(Uint16Array.from([nb.length])))
  for (const b of nb) {
    chunks.push(Buffer.from(Uint32Array.from([b.lead_id ?? 0])))
    chunks.push(Buffer.from(Float32Array.of(Number(b.score ?? 0))))
    chunks.push(Buffer.from(Float32Array.of(Number(b.semantic_score ?? 0))))
    const flags = (b.same_city ? 1 : 0) | (b.same_status ? 2 : 0) | (b.bridge ? 4 : 0)
    chunks.push(Buffer.from([flags]))
  }
}
const payload = Buffer.concat(chunks)
const strBuf = Buffer.from(strtab.join('\u0000') + '\u0000', 'utf8')

const header = Buffer.alloc(8)
header.writeUInt32LE(nodes.length, 0)
header.writeUInt32LE(strBuf.length, 4)
const bin = Buffer.concat([Buffer.from('TDB1'), header, payload, strBuf])

writeFileSync(OUT, bin)
const binBr = brotliCompressSync(bin).length
const jsonBr = brotliCompressSync(raw).length

console.log('bin-MB: ' + (bin.length / 1048576).toFixed(2))
console.log('ratio raw: ' + (jsonBytes / bin.length).toFixed(2) + 'x smaller')
console.log('bin.br: ' + (binBr / 1048576).toFixed(2) + 'MB | json.br: ' + (jsonBr / 1048576).toFixed(2) + 'MB')
console.log('edges: ' + edges + ' | strtab: ' + strtab.length)
console.log('total-ms: ' + (Date.now() - t0))