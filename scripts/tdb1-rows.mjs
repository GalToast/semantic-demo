// tdb1-rows.mjs — TDB-rows generator (the 1.8MB tuple catalog, mirror of the graph bin).
// Columns (src/data.dat rows): 0-2 f32 xyz · 3 u32 cluster · 4-6 str name/what/city
// 7 u32 index · 8-9 f64 lat/lng · 10-13 str web/email/phone/blurb · 14-15 str status/naics
// Layout: 'TDBR' | u32 count | strtab | per-row fields (dict-coded strings).
import { readFileSync, writeFileSync, statSync } from 'node:fs'

const SRC = 'src/data.dat'
const OUT = 'tmp/perf9/rows.bin'
const rows = JSON.parse(readFileSync(SRC, 'utf8'))

const strtab = []
const strIdx = new Map()
function intern(s) {
  let i = strIdx.get(s)
  if (i === undefined) { i = strtab.length; strtab.push(s); strIdx.set(s, i) }
  return i
}

const chunks = [Buffer.from('TDBR')]
const meta = Buffer.alloc(8)
meta.writeUInt32LE(rows.length, 0) // strtab len written below
chunks.push(meta)

for (const r of rows) {
  const rec = Buffer.alloc(64) // xyz12+cluster4+index4+lat8+9xstr4
  let o = 0
  for (let i = 0; i < 3; i++) { rec.writeFloatLE(Number(r[i]) || 0, o); o += 4 }
  rec.writeUInt32LE(Number(r[3]) || 0, o); o += 4
  rec.writeUInt32LE(Number(r[7]) || 0, o); o += 4
  rec.writeFloatLE(Number(r[8]) || 0, o); o += 4
  rec.writeFloatLE(Number(r[9]) || 0, o); o += 4
  // string columns 4,5,6,10,11,12,13,14,15 interned (u32 idx each)
  for (const ci of [4, 5, 6, 10, 11, 12, 13, 14, 15]) {
    rec.writeUInt32LE(intern(String(r[ci] ?? '')), o); o += 4
  }
  chunks.push(rec)
}
const strBuf = Buffer.from(strtab.join('\u0000') + '\u0000', 'utf8')
const payload = Buffer.concat(chunks)
payload.writeUInt32LE(rows.length, 4)
payload.writeUInt32LE(strBuf.length, 8)
writeFileSync(OUT, Buffer.concat([payload.subarray(0, 12), strBuf]))

const rawMB = statSync(SRC).size / 1048576
const binMB = statSync(OUT).size / 1048576
console.log(`TDBR: ${binMB.toFixed(3)}MB vs raw ${rawMB.toFixed(2)}MB -> ${((1 - binMB / rawMB) * 100).toFixed(1)}% smaller | rows ${rows.length} | str ${strtab.length}`)