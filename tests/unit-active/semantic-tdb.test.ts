// semantic-tdb.test.ts — parse-shape parity: the TDB reader reconstructs the
// graph the JSON produces (sample-compare), proving the production path.
import { readFileSync } from 'node:fs'
import { test, expect } from 'vitest'
import { parseTdb } from '@lib/loaders/semantic-tdb'

const bin = readFileSync('tmp/perf9/semantic_threads.dat.bin')
const j = JSON.parse(readFileSync('public/data/semantic_threads.dat', 'utf8'))

const { nodes, count } = parseTdb(bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength))

test('magic/parse: count matches json node map', () => {
  expect(count).toBe(Object.keys(j.nodes ?? {}).length)
  expect(Object.keys(nodes).length).toBe(count)
})

test('sample node shape matches json oracle (lead_id/signal)', () => {
  const src = Object.values(j.nodes)[0] as any
  const binNode = nodes[String(src.lead_id)]
  expect(binNode).toBeDefined()
  expect(Math.abs(binNode.signal_score - (src.signal_score ?? 0))).toBeLessThan(1e-3)
  expect(binNode.neighbors.length).toBe((src.neighbors ?? []).length)
})

test("first neighbor's score round-trips", () => {
  const src = Object.values(j.nodes)[0] as any
  const nb = (src.neighbors ?? [])[0]
  const bn = nodes[String(src.lead_id)].neighbors[0]
  expect(bn).toBeDefined()
  expect(Math.abs(bn.score - (nb.score ?? 0))).toBeLessThan(1e-3)
})