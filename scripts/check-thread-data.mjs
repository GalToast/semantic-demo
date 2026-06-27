/**
 * Diagnostic: check if data.dat and semantic_threads_ui.dat have matching lead_ids
 * and if any nodes have semantic thread neighbors.
 *
 * Usage: node scripts/check-thread-data.mjs
 */
import fs from 'node:fs'
import path from 'node:path'

const datFile = path.resolve('dist/svelte/data.dat')
const threadFile = path.resolve('public/data/semantic_threads_ui.dat')

function loadDataDat() {
    const raw = fs.readFileSync(datFile, 'utf8')
    return JSON.parse(raw)
}

function loadThreadDat() {
    const raw = fs.readFileSync(threadFile, 'utf8')
    return JSON.parse(raw)
}

const points = loadDataDat()
const threadBundle = loadThreadDat()

console.log('Points loaded:', points.length)
console.log('Thread bundle keys:', Object.keys(threadBundle).slice(0, 5))

const threadNodes = threadBundle.nodes || threadBundle
console.log('Thread nodes count:', Object.keys(threadNodes).length)

let nodesWithNeighbors = 0
let totalNeighbors = 0
const sample = []

for (const [leadId, node] of Object.entries(threadNodes)) {
    const n = node?.neighbors?.length || 0
    if (n > 0) {
        nodesWithNeighbors++
        totalNeighbors += n
        if (sample.length < 3) {
            sample.push({ leadId, neighbors: n, firstNeighbor: node.neighbors[0]?.leadId })
        }
    }
}

console.log('Nodes with neighbors:', nodesWithNeighbors)
console.log('Total neighbor entries:', totalNeighbors)
console.log('Sample nodes:', sample)

// Check lead_id matching
const leadIdsInData = new Set(points.map((p) => String(p[7] || '')).filter(Boolean))
const leadIdsInThread = new Set(Object.keys(threadNodes).map((k) => String(k)))

let matching = 0,
    onlyInData = 0,
    onlyInThread = 0
for (const id of leadIdsInData) {
    if (leadIdsInThread.has(id)) matching++
    else onlyInData++
}
for (const id of leadIdsInThread) {
    if (!leadIdsInData.has(id)) onlyInThread++
}

console.log('Lead ID overlap:', { dataOnly: onlyInData, threadOnly: onlyInThread, matching })

// Find a point with neighbors for testing
for (let i = 0; i < points.length; i++) {
    const leadId = String(points[i][7] || '')
    if (leadId && threadNodes[leadId]?.neighbors?.length > 0) {
        console.log(`Point ${i} (lead_id=${leadId}) has ${threadNodes[leadId].neighbors.length} neighbors`)
        break
    }
}
