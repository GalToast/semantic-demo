// tdb1-verify.mjs — validates the generator's output against the JSON oracle
// (sample-based, loader-free). PASS = the .bin is consumable as-specified.
import { readFileSync } from 'node:fs'

const BIN = 'tmp/perf9/semantic_threads.dat.bin'
const JSON_PATH = 'public/data/semantic_threads.dat'

const bin = readFileSync(BIN)
if (bin.subarray(0, 4).toString() !== 'TDB1') throw new Error('bad magic')
const count = bin.readUInt32LE(4)
const strLen = bin.readUInt32LE(8)
console.log('magic ok | count', count, '| strtab', strLen)

const t0 = Date.now()
const j = JSON.parse(readFileSync(JSON_PATH, 'utf8'))
const nodes = Object.values(j.nodes ?? {})
console.log('json nodes:', nodes.length, '| parse-ms:', Date.now() - t0)

let p = 12 // header + strings start after strtab? layout = header(8) + payload then strtab
// layout: magic(4) header(8) payload(node blocks) strtab(strLen)
let offset = 12
let checked = 0
let mismatches = 0
const eps = 1e-3

function u32() { const v = bin.readUInt32LE(offset); offset += 4; return v }
function f32() { const v = bin.readFloatLE(offset); offset += 4; return v }
function u16() { const v = bin.readUInt16LE(offset); offset += 2; return v }

for (let i = 0; i < count; i++) {
  const lead = u32()
  const signal = f32()
  const n = u16()
  const nbrs = []
  for (let k = 0; k < n; k++) {
    nbrs.push({ lead: u32(), score: f32(), sem: f32(), flags: bin[offset++] })
  }
  // compare against json only on the sample grid
  if (i % 397 === 0 || i === count - 1) {
    const src = nodes[i] ?? nodes[lead]
    const found = nodes.find((x) => x.lead_id === lead)
    if (!found) { mismatches++; continue }
    const sameN = (found.neighbors ?? []).length === n
    const sigOk = Math.abs((found.signal_score ?? 0) - signal) < eps
    if (!sameN || !sigOk) { mismatches++; console.log('MISMATCH node', lead, 'n', n, 'vs', (found.neighbors ?? []).length, 'sig', signal, found.signal_score) }
    checked++
  }
}
console.log('checked-sample:', checked, '| mismatches:', mismatches, '| bytes-consumed:', offset)
console.log(mismatches === 0 ? 'PASS — generator output is consumable as specified' : 'FAIL — see rows above')
process.exit(mismatches === 0 ? 0 : 1)