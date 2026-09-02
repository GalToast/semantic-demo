// semantic-tdb.ts — production-side TDB reader (the .bin loader, OUR module).
// Consumes scripts/tdb1-generate.mjs output. The DATA-WORKER seam stays the
// wave's; this module proves the format's shape + provides the fetch path.
// Shapes (mirror of the JSON graph):
//   node = { lead_id, signal_score, neighbors: [{ lead_id, score, sem, flags }] }

export interface TdbNode {
    lead_id: number
    signal_score: number
    neighbors: Array<{
        lead_id: number
        score: number
        sem: number
        flags: number
        // label plane — the shared worker mapper reads these snake names:
        semantic_score?: number
        bridge_score?: number
        signal_score?: number
        same_city?: boolean
        same_status?: boolean
        thread_type?: string
        relationship_role?: string
        relationship_axis?: string
    }>
}

type NodeMap = Map<string, TdbNode>

/**
 * Compact representation used across the worker boundary for binary TDB
 * artifacts. The numeric planes are deliberately separate ArrayBuffers so
 * the worker can transfer them instead of structured-cloning an object graph.
 */
export interface SerializedSemanticThreadGraph {
    nodeLeadIds: Uint32Array
    nodeSignalScores: Float32Array
    nodeOffsets: Uint32Array
    neighborLeadIds: Uint32Array
    neighborScores: Float32Array
    neighborSemanticScores: Float32Array
    neighborBridgeScores: Float32Array
    neighborSignalScores: Float32Array
    neighborFlags: Uint8Array
    neighborThreadTypeIndices: Uint16Array
    neighborRelationshipRoleIndices: Uint16Array
    neighborRelationshipAxisIndices: Uint16Array
    stringTable: string[]
    count: number
    edgeCount: number
    labelPlane: boolean
}

export function parseTdb(buffer: ArrayBuffer): { nodes: NodeMap; count: number } {
    const bytes = new Uint8Array(buffer)
    if (bytes[0] !== 0x54 || bytes[1] !== 0x44 || bytes[2] !== 0x42 || bytes[3] !== 0x31) {
        throw new Error('TDB1: bad magic')
    }
    const dv = new DataView(buffer)
    const count = dv.getUint32(4, true)
    dv.getUint32(8, true) // reserved string-table length in TDB1
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
                flags: bytes[o + 12] ?? 0
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

/** TDBU (ui variant): node = u32 lead | f32 signal | u16 nbrs; edge = u32 lead
 *  | f32 score | f32 semantic | f32 bridge | f32 signal | u8 flags | u16 type
 *  | u16 role | u16 axis; the string table sits after the final edge record. */
export function parseTdbU(buffer: ArrayBuffer): { nodes: Map<string, TdbNode>; count: number } {
    const bytes = new Uint8Array(buffer)
    if (bytes[0] !== 0x54 || bytes[1] !== 0x44 || bytes[2] !== 0x42 || bytes[3] !== 0x55) {
        throw new Error('TDBU: bad magic')
    }
    const dv = new DataView(buffer)
    const count = dv.getUint32(4, true)
    const strLen = dv.getUint32(8, true)
    // prewalk records to find the strtab (it ends the file; records vary per-node)
    let strStart = 12
    for (let i = 0; i < count; i++) {
        strStart += 10 + dv.getUint16(strStart + 8, true) * 27
    }
    const strtab = new TextDecoder().decode(bytes.subarray(strStart, strStart + strLen)).split('\u0000')
    const nodes = new Map<string, TdbNode>()
    let o = 12
    for (let i = 0; i < count; i++) {
        const lead_id = dv.getUint32(o, true)
        o += 4
        const signal_score = dv.getFloat32(o, true)
        o += 4
        const n = dv.getUint16(o, true)
        o += 2
        const neighbors: TdbNode['neighbors'] = []
        for (let k = 0; k < n && o + 27 <= buffer.byteLength; k++) {
            const flags = bytes[o + 20] ?? 0
            neighbors.push({
                lead_id: dv.getUint32(o, true),
                score: dv.getFloat32(o + 4, true),
                sem: dv.getFloat32(o + 8, true),
                flags,
                // label plane — the shared worker mapper reads these snake names:
                semantic_score: dv.getFloat32(o + 8, true),
                bridge_score: dv.getFloat32(o + 12, true),
                signal_score: dv.getFloat32(o + 16, true),
                same_city: (flags & 1) !== 0,
                same_status: (flags & 2) !== 0,
                thread_type: strtab[dv.getUint16(o + 21, true)] ?? '',
                relationship_role: strtab[dv.getUint16(o + 23, true)] ?? '',
                relationship_axis: strtab[dv.getUint16(o + 25, true)] ?? ''
            })
            o += 27
        }
        nodes.set(String(lead_id), { lead_id, signal_score, neighbors })
    }
    return { nodes, count }
}

function readCompactHeader(
    buffer: ArrayBuffer,
    expectedMagic: string
): { bytes: Uint8Array; dv: DataView; count: number; strLen: number } {
    const bytes = new Uint8Array(buffer)
    if (buffer.byteLength < 12) throw new Error(`${expectedMagic}: truncated header`)
    for (let i = 0; i < expectedMagic.length; i++) {
        if (bytes[i] !== expectedMagic.charCodeAt(i)) throw new Error(`${expectedMagic}: bad magic`)
    }
    const dv = new DataView(buffer)
    const count = dv.getUint32(4, true)
    const strLen = dv.getUint32(8, true)
    // Every record has at least a 10-byte node header. This prevents a corrupt
    // count from causing a giant typed-array allocation before bounds checks.
    if (count > Math.floor((buffer.byteLength - 12) / 10)) {
        throw new Error(`${expectedMagic}: node count exceeds buffer`)
    }
    return { bytes, dv, count, strLen }
}

function createSerializedGraph(count: number, edgeCount: number, stringTable: string[], labelPlane: boolean) {
    return {
        nodeLeadIds: new Uint32Array(count),
        nodeSignalScores: new Float32Array(count),
        nodeOffsets: new Uint32Array(count + 1),
        neighborLeadIds: new Uint32Array(edgeCount),
        neighborScores: new Float32Array(edgeCount),
        neighborSemanticScores: new Float32Array(edgeCount),
        neighborBridgeScores: new Float32Array(edgeCount),
        neighborSignalScores: new Float32Array(edgeCount),
        neighborFlags: new Uint8Array(edgeCount),
        neighborThreadTypeIndices: new Uint16Array(edgeCount),
        neighborRelationshipRoleIndices: new Uint16Array(edgeCount),
        neighborRelationshipAxisIndices: new Uint16Array(edgeCount),
        stringTable,
        count,
        edgeCount,
        labelPlane
    } satisfies SerializedSemanticThreadGraph
}

/**
 * Parse a score-only TDB1 artifact without constructing Maps or per-edge
 * objects. The returned planes are transferable from a Web Worker.
 */
export function parseTdbCompact(buffer: ArrayBuffer): SerializedSemanticThreadGraph {
    const { bytes, dv, count } = readCompactHeader(buffer, 'TDB1')
    let offset = 12
    let edgeCount = 0
    for (let i = 0; i < count; i++) {
        if (offset + 10 > buffer.byteLength) throw new Error('TDB1: truncated node header')
        const neighborCount = dv.getUint16(offset + 8, true)
        const edgeBytes = neighborCount * 13
        if (offset + 10 + edgeBytes > buffer.byteLength) throw new Error('TDB1: truncated neighbor records')
        offset += 10 + edgeBytes
        edgeCount += neighborCount
    }

    const graph = createSerializedGraph(count, edgeCount, [''], false)
    offset = 12
    let edgeIndex = 0
    graph.nodeOffsets[0] = 0
    for (let nodeIndex = 0; nodeIndex < count; nodeIndex++) {
        graph.nodeLeadIds[nodeIndex] = dv.getUint32(offset, true)
        graph.nodeSignalScores[nodeIndex] = dv.getFloat32(offset + 4, true)
        const neighborCount = dv.getUint16(offset + 8, true)
        offset += 10
        for (let neighborIndex = 0; neighborIndex < neighborCount; neighborIndex++) {
            graph.neighborLeadIds[edgeIndex] = dv.getUint32(offset, true)
            graph.neighborScores[edgeIndex] = dv.getFloat32(offset + 4, true)
            graph.neighborSemanticScores[edgeIndex] = dv.getFloat32(offset + 8, true)
            graph.neighborFlags[edgeIndex] = bytes[offset + 12] ?? 0
            offset += 13
            edgeIndex++
        }
        graph.nodeOffsets[nodeIndex + 1] = edgeIndex
    }
    return graph
}

/**
 * Parse a label-plane TDBU artifact into transferable numeric planes. The
 * string table is the only non-typed payload and is small relative to the
 * graph itself.
 */
export function parseTdbUCompact(buffer: ArrayBuffer): SerializedSemanticThreadGraph {
    const { bytes, dv, count, strLen } = readCompactHeader(buffer, 'TDBU')
    let stringStart = 12
    let edgeCount = 0
    for (let i = 0; i < count; i++) {
        if (stringStart + 10 > buffer.byteLength) throw new Error('TDBU: truncated node header')
        const neighborCount = dv.getUint16(stringStart + 8, true)
        const edgeBytes = neighborCount * 27
        if (stringStart + 10 + edgeBytes > buffer.byteLength) {
            throw new Error('TDBU: truncated neighbor records')
        }
        stringStart += 10 + edgeBytes
        edgeCount += neighborCount
    }
    if (stringStart + strLen > buffer.byteLength) throw new Error('TDBU: truncated string table')

    const stringTable = new TextDecoder()
        .decode(bytes.subarray(stringStart, stringStart + strLen))
        .split('\u0000')
    const graph = createSerializedGraph(count, edgeCount, stringTable, true)
    let offset = 12
    let edgeIndex = 0
    graph.nodeOffsets[0] = 0
    for (let nodeIndex = 0; nodeIndex < count; nodeIndex++) {
        graph.nodeLeadIds[nodeIndex] = dv.getUint32(offset, true)
        graph.nodeSignalScores[nodeIndex] = dv.getFloat32(offset + 4, true)
        const neighborCount = dv.getUint16(offset + 8, true)
        offset += 10
        for (let neighborIndex = 0; neighborIndex < neighborCount; neighborIndex++) {
            graph.neighborLeadIds[edgeIndex] = dv.getUint32(offset, true)
            graph.neighborScores[edgeIndex] = dv.getFloat32(offset + 4, true)
            graph.neighborSemanticScores[edgeIndex] = dv.getFloat32(offset + 8, true)
            graph.neighborBridgeScores[edgeIndex] = dv.getFloat32(offset + 12, true)
            graph.neighborSignalScores[edgeIndex] = dv.getFloat32(offset + 16, true)
            graph.neighborFlags[edgeIndex] = bytes[offset + 20] ?? 0
            graph.neighborThreadTypeIndices[edgeIndex] = dv.getUint16(offset + 21, true)
            graph.neighborRelationshipRoleIndices[edgeIndex] = dv.getUint16(offset + 23, true)
            graph.neighborRelationshipAxisIndices[edgeIndex] = dv.getUint16(offset + 25, true)
            offset += 27
            edgeIndex++
        }
        graph.nodeOffsets[nodeIndex + 1] = edgeIndex
    }
    return graph
}
