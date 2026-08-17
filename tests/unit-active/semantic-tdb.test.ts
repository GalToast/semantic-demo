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

// ── TDBU / label-plane (the fix that stopped the silent label drop) ──────────
import { parseTdbU } from '@lib/loaders/semantic-tdb'

function buildTdbuFixture(): ArrayBuffer {
    const strings = ['same_city_semantic_neighbor', 'core_peer', 'professional_support', '']
    const strtab = Buffer.from(strings.join('\u0000') + '\u0000', 'utf8')
    // 1 node: lead 7, signal 3.5, 1 neighbor
    const node = Buffer.alloc(10)
    node.writeUInt32LE(7, 0)
    node.writeFloatLE(3.5, 4)
    node.writeUInt16LE(1, 8)
    const edge = Buffer.alloc(27)
    edge.writeUInt32LE(42, 0) // lead
    edge.writeFloatLE(1.2, 4) // score
    edge.writeFloatLE(0.9, 8) // semantic
    edge.writeFloatLE(0.7, 12) // bridge
    edge.writeFloatLE(3.2, 16) // signal
    edge.writeUInt8(3, 20) // flags: same_city+same_status
    edge.writeUInt16LE(0, 21) // thread_type
    edge.writeUInt16LE(1, 23) // relationship_role
    edge.writeUInt16LE(2, 25) // relationship_axis
    const header = Buffer.alloc(8)
    header.writeUInt32LE(1, 0) // count
    header.writeUInt32LE(strtab.length, 4) // strtab len
    const out = Buffer.concat([Buffer.from('TDBU'), header, node, edge, strtab])
    return Uint8Array.from(out).buffer
}

test('TDBU: label plane decodes (thread_type/role/axis + bridge + flags)', () => {
    const { nodes, count } = parseTdbU(buildTdbuFixture())
    expect(count).toBe(1)
    const nb = nodes.get('7')!.neighbors[0]
    expect(nb.lead_id).toBe(42)
    expect(nb.score).toBeCloseTo(1.2, 5)
    expect(nb.semantic_score).toBeCloseTo(0.9, 5)
    expect(nb.bridge_score).toBeCloseTo(0.7, 5)
    expect(nb.signal_score).toBeCloseTo(3.2, 5)
    expect(nb.same_city).toBe(true)
    expect(nb.same_status).toBe(true)
    // the label plane that the shared worker mapper renders:
    expect(nb.thread_type).toBe('same_city_semantic_neighbor')
    expect(nb.relationship_role).toBe('core_peer')
    expect(nb.relationship_axis).toBe('professional_support')
})

test('TDBU: real dist bin carries a non-empty label plane (the flip gate)', () => {
    const bin = readFileSync('tmp/perf9/semantic_threads_ui.dat.bin')
    const { nodes } = parseTdbU(Uint8Array.from(bin).buffer)
    let labeled = 0
    let total = 0
    for (const node of nodes.values()) {
        for (const n of node.neighbors) {
            total++
            if (n.thread_type || n.relationship_role) labeled++
        }
    }
    expect(total).toBeGreaterThan(100000)
    expect(labeled / total).toBeGreaterThan(0.99) // 99% of edges carry labels
})
