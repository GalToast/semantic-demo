// semantic-tdb.ts — production-side TDB reader (the .bin loader, OUR module).
// Consumes scripts/tdb1-generate.mjs output. The DATA-WORKER seam stays the
// wave's; this module proves the format's shape + provides the fetch path.
// Shapes (mirror of the JSON graph):
//   node = { lead_id, signal_score, neighbors: [{ lead_id, score, sem, flags }] }

export interface TdbNode {
    lead_id: number
    signal_score: number
    neighbors: Array<{ lead_id: number; score: number; sem: number; flags: number }>
}

type NodeMap = Record<string, TdbNode>

export function parseTdb(buffer: ArrayBuffer): { nodes: NodeMap; count: number } {
    const bytes = new Uint8Array(buffer)
    if (bytes[0] !== 0x54 || bytes[1] !== 0x44 || bytes[2] !== 0x42 || bytes[3] !== 0x31) {
        throw new Error('TDB1: bad magic')
    }
    const dv = new DataView(buffer)
    const count = dv.getUint32(4, true)
    const strLen = dv.getUint32(8, true)
    let o = 12
    const nodes: NodeMap = new Map()
    for (let i = 0; i < count; i++) {
        // v2 node: u32 lead | f32 signal | u16 nbrs | nbr[ u32 | f32 | f32 | u8 ]
        const lead_id = dv.getUint32(o, true)
        o += 4
        const signal_score = dv.getFloat32(o, true)
        o += 4
        const n = dv.getUint16(o, true)
        o += 2
        const neighbors = []
        for (let k = 0; k < n && o + 13 <= buffer.byteLength; k++) {
            neighbors.push({
                lead_id: dv.getUint32(o, true),
                score: dv.getFloat32(o + 4, true),
                sem: dv.getFloat32(o + 8, true),
                flags: bytes[o + 12]
            })
            o += 13
        }
        nodes.set(String(lead_id), { lead_id, signal_score, neighbors })
    }
    return { nodes, count }
}

/** fetch + parse (zero-copy typed views); throws on HTTP/format failure. */
export async function loadSemanticGraphTdb(
    url = 'data/semantic_threads.dat.bin'
): Promise<{ nodes: NodeMap; count: number }> {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`TDB1: HTTP ${res.status} for ${url}`)
    return parseTdb(await res.arrayBuffer())
}
