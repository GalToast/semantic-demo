// tdb1-verify-full.mjs — COMPLETE oracle fidelity test of TDB1 binary
// For EVERY node (all 8,406):
//   (a) bin lead-id exists in JSON nodes
//   (b) edge count equals JSON neighbors.length
//   (c) first-2 + last-1 edge (lead, score, sem) round-trip within 1e-3
//   (d) bin lead-id SET == JSON lead-id SET (no extras, no missing)
// Emits: tmp/firmware-lab/tdb1-fidelity.CERT
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'

const BIN = 'tmp/perf9/semantic_threads.dat.bin'
const JSON_PATH = 'public/data/semantic_threads.dat'
const CERT_PATH = 'tmp/firmware-lab/tdb1-fidelity.CERT'
const EPS = 1e-3

// ── parse JSON once, time-boxed ──────────────────────────────────────
const t0 = Date.now()
const j = JSON.parse(readFileSync(JSON_PATH, 'utf8'))
const jsonParseMs = Date.now() - t0
console.log(`JSON parse: ${jsonParseMs}ms`)

const jsonNodesArr = Object.values(j.nodes ?? {})
const jsonByLead = new Map()
for (const n of jsonNodesArr) {
    jsonByLead.set(Number(n.lead_id), n)
}
console.log(`JSON nodes: ${jsonByLead.size}`)

// ── parse binary ─────────────────────────────────────────────────────
const bin = readFileSync(BIN)
if (bin.subarray(0, 4).toString() !== 'TDB1') throw new Error('bad magic')
const binCount = bin.readUInt32LE(4)
const strtabLen = bin.readUInt32LE(8)
console.log(`BIN: count=${binCount} strtab=${strtabLen} size=${bin.length}`)

let offset = 12
let nodesChecked = 0
let edgesChecked = 0
let mismatches = 0
const mismatchDump = [] // top-5
const binLeadIds = new Set()

function u32() { const v = bin.readUInt32LE(offset); offset += 4; return v }
function f32() { const v = bin.readFloatLE(offset); offset += 4; return v }
function u16() { const v = bin.readUInt16LE(offset); offset += 2; return v }

for (let i = 0; i < binCount; i++) {
    const lead = u32()
    const signal = f32()
    const n = u16()
    binLeadIds.add(lead)

    const jsonNode = jsonByLead.get(lead)
    const jsonNbrs = jsonNode?.neighbors ?? []

    // (a) lead-id must exist in JSON
    if (!jsonNode) {
        mismatches++
        if (mismatchDump.length < 5) mismatchDump.push({ node_idx: i, lead, reason: 'lead-id missing in JSON' })
        offset += n * 13 // skip all edges for this node
        continue
    }

    // (b) edge count equal
    const edgeCountOk = jsonNbrs.length === n
    if (!edgeCountOk) {
        mismatches++
        if (mismatchDump.length < 5) mismatchDump.push({
            node_idx: i, lead, reason: 'edge count mismatch',
            bin_count: n, json_count: jsonNbrs.length
        })
    }

    // Read ALL edges for this node
    const edgeLeads = []
    const edgeScores = []
    const edgeSems = []
    for (let k = 0; k < n; k++) {
        edgeLeads.push(u32())
        edgeScores.push(f32())
        edgeSems.push(f32())
        offset += 1 // flags u8
    }

    // Determine which edge indices to verify: first 2 + last 1, deduped
    const checkIndices = new Set()
    if (n >= 1) checkIndices.add(0)
    if (n >= 2) checkIndices.add(1)
    if (n >= 1) checkIndices.add(n - 1)

    for (const ei of checkIndices) {
        const jsonEdge = jsonNbrs[ei]
        if (!jsonEdge) {
            mismatches++
            if (mismatchDump.length < 5) mismatchDump.push({
                node_idx: i, lead, edge_idx: ei,
                reason: 'edge index out of range in JSON neighbors'
            })
            continue
        }
        edgesChecked++
        const eLead = edgeLeads[ei]
        const eScore = edgeScores[ei]
        const eSem = edgeSems[ei]

        const leadOk = Number(jsonEdge.lead_id) === eLead
        const scoreOk = Math.abs(jsonEdge.score - eScore) < EPS
        const semOk = Math.abs((jsonEdge.semantic_score ?? 0) - eSem) < EPS
        if (!leadOk || !scoreOk || !semOk) {
            mismatches++
            if (mismatchDump.length < 5) mismatchDump.push({
                node_idx: i, lead, edge_idx: ei,
                reason: 'edge field mismatch',
                bin_lead: eLead, json_lead: jsonEdge.lead_id,
                bin_score: eScore, json_score: jsonEdge.score,
                bin_sem: eSem, json_sem: jsonEdge.semantic_score
            })
        }
    }

    nodesChecked++
}

// (d) SET equality: bin lead-ids vs JSON lead-ids
const jsonLeadIds = new Set(jsonNodesArr.map(n => Number(n.lead_id)))
const extraInBin = [...binLeadIds].filter(id => !jsonLeadIds.has(id))
const missingFromBin = [...jsonLeadIds].filter(id => !binLeadIds.has(id))

if (extraInBin.length > 0 || missingFromBin.length > 0) {
    mismatches++
    if (mismatchDump.length < 5) {
        mismatchDump.push({
            reason: 'lead-id SET inequality',
            extra_in_bin: extraInBin.slice(0, 5),
            missing_from_bin: missingFromBin.slice(0, 5)
        })
    }
}

const binEndOffset = offset
console.log(`nodes_checked: ${nodesChecked}`)
console.log(`edges_checked: ${edgesChecked}`)
console.log(`mismatches: ${mismatches}`)
console.log(`bin bytes consumed: ${binEndOffset} / ${bin.length}`)
if (extraInBin.length) console.log(`EXTRA in bin (not in JSON): ${extraInBin.slice(0, 5).join(', ')}`)
if (missingFromBin.length) console.log(`MISSING from bin: ${missingFromBin.slice(0, 5).join(', ')}`)

const verdict = mismatches === 0 ? 'PASS' : 'FAIL'
console.log(verdict)

// ── emit certificate ─────────────────────────────────────────────────
mkdirSync('tmp/firmware-lab', { recursive: true })
const certLines = [
    'TDB1 Full-Fidelity Certificate',
    `nodes_checked: ${nodesChecked}`,
    `edges_checked: ${edgesChecked}`,
    `mismatches: ${mismatches}`,
    `verdict: ${verdict}`,
    `json_parse_ms: ${jsonParseMs}`,
    `bin_bytes_consumed: ${binEndOffset}/${bin.length}`,
    `bin_lead_set_size: ${binLeadIds.size}`,
    `json_lead_set_size: ${jsonLeadIds.size}`,
    ...(extraInBin.length ? [`extra_in_bin: ${extraInBin.slice(0, 10).join(',')}`] : []),
    ...(missingFromBin.length ? [`missing_from_bin: ${missingFromBin.slice(0, 10).join(',')}`] : []),
    ...(mismatchDump.length ? [`mismatch_dump:` , ...mismatchDump.map(m => JSON.stringify(m))] : []),
]
writeFileSync(CERT_PATH, certLines.join('\n') + '\n', 'utf8')
console.log(`\nCertificate written: ${CERT_PATH}`)
process.exit(mismatches === 0 ? 0 : 1)
