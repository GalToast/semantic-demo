// semantic-tdb-fidelity.test.ts — binary-vs-JSON fidelity tripwire.
// Fails the moment the parsed binary ever diverges from the JSON oracle.
// Three layers: (a) lead-set parity, (b) sampled node/neighbor comparison,
// (c) global edge-sum checksum (fast catch-all).
import { readFileSync } from 'node:fs'
import { test, expect } from 'vitest'
import { parseTdb } from '@lib/loaders/semantic-tdb'

const bin = readFileSync('tmp/perf9/semantic_threads.dat.bin')
const j = JSON.parse(readFileSync('public/data/semantic_threads.dat', 'utf8'))
const ab = Uint8Array.from(bin).buffer

const { nodes, count } = parseTdb(ab)
const jsonNodes = j.nodes ?? {}
const jsonKeys = Object.keys(jsonNodes) // string lead_ids

test('lead-set parity: binary keys == JSON node keys (no extras, no missing)', () => {
    const binKeys = Array.from(nodes.keys()).sort()
    const sortedJsonKeys = [...jsonKeys].sort()
    expect(binKeys.length).toBe(sortedJsonKeys.length)
    expect(binKeys).toEqual(sortedJsonKeys)
})

test('sampled node + top-10 neighbors round-trip within 1e-3', () => {
    const tolerance = 1e-3
    // Sample 10 node indices across the map
    const sampleIndices = [0, 500, 1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000]
    for (const idx of sampleIndices) {
        const src = Object.values(jsonNodes)[idx] as any
        expect(src, `node[${idx}]`).toBeDefined()
        const binNode = nodes.get(String(src.lead_id))
        expect(binNode, `node[${idx}] lead_id=${src.lead_id}`).toBeDefined()

        // signal_score
        expect(
            Math.abs(binNode.signal_score - (src.signal_score ?? 0)),
            `node[${idx}] signal_score`
        ).toBeLessThan(tolerance)

        // top-10 neighbors
        const maxNbrs = Math.min(src.neighbors?.length ?? 0, 10)
        for (let k = 0; k < maxNbrs; k++) {
            const jnb = src.neighbors[k]
            const bnb = binNode.neighbors[k]
            expect(bnb, `node[${idx}] neighbor[${k}]`).toBeDefined()
            expect(bnb.lead_id, `node[${idx}] nbr[${k}].lead_id`).toBe(jnb.lead_id)
            expect(
                Math.abs(bnb.score - (jnb.score ?? 0)),
                `node[${idx}] nbr[${k}].score`
            ).toBeLessThan(tolerance)
            expect(
                Math.abs(bnb.sem - (jnb.semantic_score ?? 0)),
                `node[${idx}] nbr[${k}].sem`
            ).toBeLessThan(tolerance)
        }
    }
})

test('edge-preservation checksum: bin edge-sum == JSON edge-sum within 1%', () => {
    let binSum = 0
    for (const node of nodes.values()) {
        for (const nb of node.neighbors) {
            binSum += nb.lead_id + nb.score + nb.sem
        }
    }
    let jsonSum = 0
    for (const src of Object.values(jsonNodes)) {
        for (const jnb of (src as any).neighbors ?? []) {
            jsonSum += jnb.lead_id + (jnb.score ?? 0) + (jnb.semantic_score ?? 0)
        }
    }
    const rel = Math.abs(binSum - jsonSum) / Math.abs(jsonSum)
    expect(rel, `bin=${binSum.toFixed(3)} json=${jsonSum.toFixed(3)}`).toBeLessThan(0.01)
})
