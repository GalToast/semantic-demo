// tdb1-fidelity-ci.mjs — merge-gate fidelity check for the TDB1 binary path.
// Additive: if the .bin is absent (fresh clone / pre-generate), SKIP with a
// notice (exit 0) — the generator+ensure wiring is the enable switch.
// If present: runs the tripwire file + a lead-set/oracle-sum smoke, exits 0/1.
import { existsSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const BIN = 'dist/svelte/data/semantic_threads.dat.bin'
const JSON_SRC = 'public/data/semantic_threads.dat'
const TRIPWIRE = ['npx', 'vitest', 'run', 'tests/unit-active/semantic-tdb-fidelity.test.ts']

if (!existsSync(BIN)) {
  console.log('[tdb-fidelity] SKIP (no .bin — run scripts/tdb1-ensure.mjs to enable)')
  process.exit(0)
}

// 1) tripwire suite (lead-set / parity / checksum)
const r = spawnSync('npx', ['vitest', 'run', 'tests/unit-active/semantic-tdb-fidelity.test.ts'], {
  stdio: 'inherit',
})
if (r.status !== 0) process.exit(r.status ?? 1)

// 2) fast oracle checksum (edge-sum within 1%) — mirrors the CERT's core
try {
  const raw = readFileSync(JSON_SRC, 'utf8')
  const j = JSON.parse(raw)
  const nodes = Object.values(j.nodes ?? {})
  let jsonSum = 0
  for (const n of nodes) for (const b of n.neighbors ?? []) jsonSum += b.score ?? 0
  const bin = readFileSync(BIN)
  const dv = new DataView(bin.buffer, bin.byteOffset, bin.byteLength)
  const count = dv.getUint32(4, true)
  let o = 12
  let binSum = 0
  for (let i = 0; i < count; i++) {
    o += 8 // lead + signal
    const n = dv.getUint16(o, true); o += 2
    for (let k = 0; k < n; k++) { binSum += dv.getFloat32(o + 4, true); o += 13 }
  }
  const ratio = Math.abs(jsonSum - binSum) / Math.max(jsonSum, 1e-9)
  if (ratio > 0.01) {
    console.error(`[tdb-fidelity] ORACLE-SUM drift ${(ratio * 100).toFixed(2)}% (>1%)`)
    process.exit(1)
  }
  console.log(`[tdb-fidelity] PASS (tripwire + oracle-sum within ${(ratio * 100).toFixed(3)}%)`)
} catch (e) {
  console.error('[tdb-fidelity] oracle check failed:', e.message)
  process.exit(1)
}
process.exit(0)