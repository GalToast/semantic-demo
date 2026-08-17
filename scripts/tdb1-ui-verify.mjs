// tdb1-ui-verify.mjs — TDBU parity: sample the bin against the JSON oracle.
import { readFileSync } from 'node:fs'

const SRC = 'public/data/semantic_threads_ui.dat'
const BIN = 'dist/svelte/data/semantic_threads_ui.dat.bin'

const j = JSON.parse(readFileSync(SRC, 'utf8'))
const oracle = Object.values(j.nodes ?? {})
const bin = readFileSync(BIN)
if (String.fromCharCode(...bin.subarray(0, 4)) !== 'TDBU') throw new Error('bad magic')
const dv = new DataView(bin.buffer, bin.byteOffset, bin.byteLength)
const count = dv.getUint32(4, true)
if (count !== oracle.length) throw new Error(`count mismatch: ${count} vs ${oracle.length}`)

let o = 12
let mismatches = 0
let checked = 0
const step = Math.max(1, Math.floor(count / 200))
for (let i = 0; i < count; i++) {
    const lead_id = dv.getUint32(o, true)
    const signal = dv.getFloat32(o + 4, true)
    const nbrs = dv.getUint16(o + 8, true)
    o += 10
    for (let k = 0; k < nbrs; k++) {
        const nn = dv.getUint32(o, true)
        if (i % step === 0) {
            const refN = oracle[i].neighbors?.[k]
            if (refN && refN.lead_id !== nn) mismatches++
        }
        o += 27
    }
    if (i % step === 0) {
        const ref = oracle[i]
        if (
            ref.lead_id !== lead_id ||
            Math.abs(ref.signal_score - signal) > 1e-3 ||
            (ref.neighbors?.length ?? 0) !== nbrs
        ) {
            mismatches++
        }
        checked++
    }
}
console.log(
    `TDBU parity: count ${count} checked ${checked} mismatches ${mismatches} -> ${mismatches === 0 ? 'PASS' : 'FAIL'}`
)
process.exit(mismatches === 0 ? 0 : 1)
