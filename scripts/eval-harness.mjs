#!/usr/bin/env node
// eval-harness.mjs — lightweight eval / A-B rerun harness for subagent dispatches.
// Plain ESM, node:fs only, deterministic (no Math.random() or external state).
import { readFileSync, writeFileSync, existsSync } from 'node:fs'

const LOG_PATH = 'tmp/eval-harness-log.jsonl'
const REQUIRED_FIELDS = ['id', 'model', 'prompt_path', 'timeout_seconds']

function usage() {
  console.error(`Usage:
  node scripts/eval-harness.mjs --manifest=<path>         validate manifest
  node scripts/eval-harness.mjs --record='<json>'         append A/B row
  node scripts/eval-harness.mjs --summarize               print per-model stats`)
  process.exit(2)
}

function validateManifest(manifestPath) {
  if (!existsSync(manifestPath)) {
    console.error(`manifest not found: ${manifestPath}`)
    process.exit(1)
  }
  const raw = readFileSync(manifestPath, 'utf8')
  let manifest
  try {
    manifest = JSON.parse(raw)
  } catch (err) {
    console.error(`manifest JSON parse error: ${err.message}`)
    process.exit(1)
  }
  if (!Array.isArray(manifest)) {
    console.error('manifest must be a JSON array of run objects')
    process.exit(1)
  }

  const errors = []
  const ids = new Set()
  const counts = new Map()
  for (let i = 0; i < manifest.length; i++) {
    const run = manifest[i]
    const label = `run[${i}]`
    for (const field of REQUIRED_FIELDS) {
      if (!run || run[field] === undefined || run[field] === null || run[field] === '') {
        errors.push(`${label}: missing or empty required field "${field}"`)
      }
    }
    if (run && run.id !== undefined) {
      const id = String(run.id)
      counts.set(id, (counts.get(id) || 0) + 1)
      if (!ids.has(id)) ids.add(id)
    }
    if (run && typeof run.timeout_seconds !== 'number') {
      errors.push(`${label}: timeout_seconds must be a number`)
    }
    if (run && run.expected_files !== undefined && !Array.isArray(run.expected_files)) {
      errors.push(`${label}: expected_files must be an array`)
    }
  }
  for (const [id, count] of counts) {
    if (count > 1) errors.push(`duplicate id "${id}" appears ${count} times`)
  }

  console.log(`Manifest validation: ${errors.length ? 'FAIL' : 'OK'} (${manifest.length} runs)`)
  for (const err of errors) console.error(`  - ${err}`)
  if (errors.length) process.exit(1)
}

function appendRecord(recordJson) {
  let row
  try {
    row = JSON.parse(recordJson)
  } catch (err) {
    console.error(`record JSON parse error: ${err.message}`)
    process.exit(1)
  }
  const required = ['id', 'model', 'startedAt', 'finishedAt', 'elapsedMs', 'exit', 'success']
  for (const field of required) {
    if (!(field in row)) {
      console.error(`record missing required field: ${field}`)
      process.exit(1)
    }
  }
  const line = JSON.stringify({
    id: String(row.id),
    model: String(row.model),
    startedAt: String(row.startedAt),
    finishedAt: String(row.finishedAt),
    elapsedMs: Number(row.elapsedMs),
    exit: Number(row.exit),
    success: Boolean(row.success),
    tokensIn: row.tokensIn !== undefined ? Number(row.tokensIn) : null,
    tokensOut: row.tokensOut !== undefined ? Number(row.tokensOut) : null,
    cost: row.cost !== undefined ? Number(row.cost) : null,
    notes: row.notes !== undefined ? String(row.notes) : ''
  })
  writeFileSync(LOG_PATH, line + '\n', { flag: 'a' })
  console.log(`appended row to ${LOG_PATH}`)
}

function summarize() {
  if (!existsSync(LOG_PATH)) {
    console.error(`log not found: ${LOG_PATH}`)
    process.exit(1)
  }
  const raw = readFileSync(LOG_PATH, 'utf8')
  const lines = raw.split('\n').filter(Boolean)
  if (lines.length === 0) {
    console.log('no rows to summarize')
    return
  }
  const rows = []
  for (const line of lines) {
    let row
    try { row = JSON.parse(line) } catch { continue }
    rows.push(row)
  }

  const byModel = new Map()
  for (const row of rows) {
    const key = row.model
    if (!byModel.has(key)) byModel.set(key, [])
    byModel.get(key).push(row)
  }

  const results = []
  for (const [model, group] of byModel) {
    const n = group.length
    const successes = group.filter(r => r.success)
    const successRate = successes.length / n
    const meanLatency = group.reduce((s, r) => s + r.elapsedMs, 0) / n
    const costRows = group.filter(r => r.cost !== null && !Number.isNaN(r.cost))
    const meanCost = costRows.length ? costRows.reduce((s, r) => s + r.cost, 0) / costRows.length : null
    results.push({ model, n, successRate, meanLatency, meanCost })
  }

  results.sort((a, b) => {
    if (b.successRate !== a.successRate) return b.successRate - a.successRate
    if (b.meanLatency !== a.meanLatency) return a.meanLatency - b.meanLatency
    return String(a.model).localeCompare(String(b.model))
  })

  console.log('eval-harness summary')
  console.log('model'.padEnd(48), 'n'.padStart(4), 'success'.padStart(9), 'latency_ms'.padStart(12), 'cost')
  for (const r of results) {
    const costStr = r.meanCost !== null ? r.meanCost.toFixed(4) : '-'
    console.log(
      String(r.model).padEnd(48),
      String(r.n).padStart(4),
      (r.successRate * 100).toFixed(1) + '%'.padStart(9),
      r.meanLatency.toFixed(0).padStart(12),
      costStr
    )
  }
}

function main() {
  const args = process.argv.slice(2)
  if (args.length === 0) usage()

  let manifestFlag = null
  let recordFlag = null
  let doSummarize = false
  for (const arg of args) {
    if (arg.startsWith('--manifest=')) manifestFlag = arg.slice('--manifest='.length)
    else if (arg === '--summarize') doSummarize = true
    else if (arg.startsWith('--record=')) recordFlag = arg.slice('--record='.length)
    else {
      console.error(`unknown flag: ${arg}`)
      usage()
    }
  }

  if (manifestFlag) validateManifest(manifestFlag)
  else if (recordFlag) appendRecord(recordFlag)
  else if (doSummarize) summarize()
  else usage()
}

main()
