// semantic-tdb.test.ts — parse-shape parity: the TDB reader reconstructs the
// graph the JSON produces (sample-compare), proving the production path.
import { readFileSync } from 'node:fs'
import { test, expect } from 'vitest'
import { parseTdb } from '@lib/loaders/semantic-tdb'

const bin = readFileSync('tmp/perf9/semantic_threads.dat.bin')
const j = JSON.parse(readFileSync('public/data/semantic_threads.dat', 'utf8'))
// Plain ArrayBuffer (vitest/jsdom-safe; avoids Buffer-pool slicing quirks)
const ab = Uint8Array.from(bin).buffer

const { nodes, count } = parseTdb(ab)

test('magic/parse: count matches json node map', () => {
    expect(count).toBe(Object.keys(j.nodes ?? {}).length)
    expect(nodes.size).toBe(count)
})

test('sample node shape matches json oracle (lead_id/signal)', () => {
    const src = Object.values(j.nodes)[0] as any
    const binNode = nodes.get(String(src.lead_id))
    expect(binNode).toBeDefined()
    expect(Math.abs(binNode.signal_score - (src.signal_score ?? 0))).toBeLessThan(1e-3)
    expect(binNode.neighbors.length).toBe((src.neighbors ?? []).length)
})

test("first neighbor's score round-trips", () => {
    const src = Object.values(j.nodes)[0] as any
    const nb = (src.neighbors ?? [])[0]
    const bn = nodes.get(String(src.lead_id)).neighbors[0]
    expect(bn).toBeDefined()
    expect(Math.abs(bn.score - (nb.score ?? 0))).toBeLessThan(1e-3)
})
