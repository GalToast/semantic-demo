// scripts/lib/tdb1-pack.mjs — shared TDB1/TDBU v2 packers (single source of truth).
// TDB1 (graph):   NODE = u32 lead | f32 signal | u16 nbrCount | nbr[ u32 lead | f32 score | f32 sem | u8 flags ]
// TDBU (ui/label): NODE = u32 lead | f32 signal | u16 nbrs
//                  EDGE = u32 lead | f32 score | f32 sem | f32 bridge | f32 nodeSignal
//                         u8 flags(bit0 same_city,1 same_status) | u16 threadType | u16 roleIdx | u16 axisIdx
// Consumers: scripts/tdb1-generate.mjs, scripts/tdb1-ui.mjs (dist artifacts),
//            scripts/tdb1-fixture-ensure.mjs (unit-test fixtures).
import { readFileSync } from 'node:fs'

/**
 * Pack the semantic graph JSON into the TDB1 binary layout.
 * @param {string} jsonPath path to the committed JSON oracle
 * @returns {{ bin: Buffer, edges: number }}
 */
export function packTdb1(jsonPath) {
    const j = JSON.parse(readFileSync(jsonPath, 'utf8'))
    const nodes = Object.values(j.nodes ?? {})

    const out = [Buffer.from('TDB1')]

    const meta = Buffer.alloc(8)
    meta.writeUInt32LE(nodes.length, 0)
    let strBuf = Buffer.alloc(0) // v2: no string table needed (graph is numeric-only)
    meta.writeUInt32LE(strBuf.length, 4)
    out.push(meta)

    let edges = 0
    for (const n of nodes) {
        const rec = Buffer.alloc(10)
        rec.writeUInt32LE(Number(n.lead_id) || 0, 0)
        rec.writeFloatLE(Number(n.signal_score) || 0, 4)
        const nb = n.neighbors ?? []
        rec.writeUInt16LE(nb.length, 8)
        out.push(rec)
        edges += nb.length
        for (const b of nb) {
            const e = Buffer.alloc(13)
            e.writeUInt32LE(Number(b.lead_id) || 0, 0)
            e.writeFloatLE(Number(b.score) || 0, 4)
            e.writeFloatLE(Number(b.semantic_score) || 0, 8)
            e.writeUInt8((b.same_city ? 1 : 0) | (b.same_status ? 2 : 0) | (b.bridge ? 4 : 0), 12)
            out.push(e)
        }
    }

    return { bin: Buffer.concat(out), edges }
}

/**
 * Pack the semantic-threads-UI JSON into the TDBU binary layout
 * (label plane: thread_type / role / axis strtab, bridge+signal scores).
 * @param {string} jsonPath path to the committed JSON oracle
 * @returns {{ bin: Buffer, edges: number, strCount: number }}
 */
export function packTdbUi(jsonPath) {
    const j = JSON.parse(readFileSync(jsonPath, 'utf8'))
    const nodes = Object.values(j.nodes ?? {})

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
    // records exclude the leading magic+placeholder header; frame = TDBU|count|strLen|records|strtab
    const records = Buffer.concat(outChunks.slice(2))
    const strBuf = Buffer.from(strtab.join('\u0000') + '\u0000', 'utf8')
    const header = Buffer.alloc(8)
    header.writeUInt32LE(nodes.length, 0)
    header.writeUInt32LE(strBuf.length, 4)
    const bin = Buffer.concat([Buffer.from('TDBU'), header, records, strBuf])

    return { bin, edges, strCount: strtab.length }
}
