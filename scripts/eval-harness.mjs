#!/usr/bin/env node
// eval-harness.mjs — lightweight eval / A-B rerun harness for subagent dispatches.
// Plain ESM, node:fs only, deterministic.
import { readFileSync, writeFileSync, existsSync } from 'node:fs'

const LOG_PATH = 'tmp/eval-harness-log.jsonl'
const REQUIRED_FIELDS = ['id', 'model', 'prompt_path', 'timeout_seconds']
const ASSERTION_TYPES = new Set(['exact_match', 'includes', 'file_exists', 'json_schema', 'llm_judge'])
const DEFAULT_MIN_SUCCESS = 0.8

function usage() {
  console.error(`Usage:
  node scripts/eval-harness.mjs --manifest=<path>         validate manifest
  node scripts/eval-harness.mjs --record='<json>'         append A/B row
  node scripts/eval-harness.mjs --summarize               print per-model stats
  node scripts/eval-harness.mjs --run=<manifest>          evaluate recorded rows against assertions
  node scripts/eval-harness.mjs --ci=<manifest>           evaluate + fail on threshold breach`)
  process.exit(2)
}

function getByPath(obj, path) {
  for (const part of String(path).split('.')) {
    if (obj === null || typeof obj !== 'object') return undefined
    obj = obj[part]
  }
  return obj
}

function evaluateAssertion(a, record) {
  const { type, target, value, schema, path } = a
  if (type === 'exact_match') return record[target] === value
  if (type === 'includes') return String(record[target] ?? '').includes(String(value))
  if (type === 'file_exists') return existsSync(target)
  if (type === 'json_schema') {
    try {
      let parsed
      try { parsed = typeof record[target] === 'string' ? JSON.parse(record[target]) : record[target] }
      catch { parsed = record[target] }
      const subject = path !== undefined ? getByPath(parsed, path) : parsed
      if (!schema || subject === undefined) return true
      if (schema.type && typeof subject !== schema.type) return false
      if (schema.required && Array.isArray(schema.required)) {
        if (typeof subject !== 'object' || subject === null) return false
        for (const key of schema.required) if (!(key in subject)) return false
      }
      return true
    } catch { return false }
  }
  if (type === 'llm_judge') return false
  return false
}

function validateAssertionShape(assertions, prefix) {
  const errors = []
  for (let j = 0; j < assertions.length; j++) {
    const a = assertions[j], al = `${prefix}.assertions[${j}]`
    if (!a || typeof a !== 'object' || !a.type) { errors.push(`${al}: missing type`); continue }
    if (!ASSERTION_TYPES.has(a.type)) errors.push(`${al}: unknown type "${a.type}"`)
    if ((a.type === 'exact_match' || a.type === 'includes') && a.value === undefined) errors.push(`${al}: missing value`)
    if ((a.type === 'file_exists' || a.type === 'json_schema' || a.type === 'llm_judge') && !a.target) errors.push(`${al}: missing target`)
    if (a.type === 'llm_judge' && !a.rubric && !a.path) errors.push(`${al}: llm_judge requires rubric or path`)
  }
  return errors
}

function validateManifest(manifestPath) {
  if (!existsSync(manifestPath)) { console.error(`manifest not found: ${manifestPath}`); process.exit(1) }
  let manifest
  try { manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) }
  catch (err) { console.error(`manifest JSON parse error: ${err.message}`); process.exit(1) }
  const runs = Array.isArray(manifest) ? manifest : (manifest?.runs && Array.isArray(manifest.runs) ? manifest.runs : null)
  if (!runs) { console.error('manifest must be a JSON array or object with runs array'); process.exit(1) }

  const errors = [], counts = new Map()
  for (let i = 0; i < runs.length; i++) {
    const run = runs[i], label = `run[${i}]`
    for (const field of REQUIRED_FIELDS) {
      if (!run || run[field] === undefined || run[field] === null || run[field] === '') errors.push(`${label}: missing or empty "${field}"`)
    }
    if (run?.id !== undefined) counts.set(String(run.id), (counts.get(String(run.id)) || 0) + 1)
    if (run && typeof run.timeout_seconds !== 'number') errors.push(`${label}: timeout_seconds must be a number`)
    if (run && run.expected_files !== undefined && !Array.isArray(run.expected_files)) errors.push(`${label}: expected_files must be an array`)
    if (run && Array.isArray(run.assertions)) errors.push(...validateAssertionShape(run.assertions, label))
  }
  for (const [id, count] of counts) if (count > 1) errors.push(`duplicate id "${id}" appears ${count} times`)

  console.log(`Manifest validation: ${errors.length ? 'FAIL' : 'OK'} (${runs.length} runs)`)
  for (const err of errors) console.error(`  - ${err}`)
  if (errors.length) process.exit(1)
}

function appendRecord(recordJson) {
  let row
  try { row = JSON.parse(recordJson) }
  catch (err) { console.error(`record JSON parse error: ${err.message}`); process.exit(1) }
  const required = ['id', 'model', 'startedAt', 'finishedAt', 'elapsedMs', 'exit', 'success']
  for (const field of required) { if (!(field in row)) { console.error(`record missing required field: ${field}`); process.exit(1) } }
  const line = JSON.stringify({
    id: String(row.id), model: String(row.model),
    startedAt: String(row.startedAt), finishedAt: String(row.finishedAt),
    elapsedMs: Number(row.elapsedMs), exit: Number(row.exit), success: Boolean(row.success),
    tokensIn: row.tokensIn !== undefined ? Number(row.tokensIn) : null,
    tokensOut: row.tokensOut !== undefined ? Number(row.tokensOut) : null,
    cost: row.cost !== undefined ? Number(row.cost) : null,
    notes: row.notes !== undefined ? String(row.notes) : ''
  })
  writeFileSync(LOG_PATH, line + '\n', { flag: 'a' })
  console.log(`appended row to ${LOG_PATH}`)
}

function summarize() {
  if (!existsSync(LOG_PATH)) { console.error(`log not found: ${LOG_PATH}`); process.exit(1) }
  const raw = readFileSync(LOG_PATH, 'utf8')
  const lines = raw.split('\n').filter(Boolean)
  if (!lines.length) { console.log('no rows to summarize'); return }

  const byModel = new Map()
  for (const line of lines) {
    let row
    try { row = JSON.parse(line) } catch { continue }
    const key = row.model
    if (!byModel.has(key)) byModel.set(key, [])
    byModel.get(key).push(row)
  }

  const results = []
  for (const [model, group] of byModel) {
    const n = group.length, successes = group.filter(r => r.success)
    const successRate = successes.length / n
    const meanLatency = group.reduce((s, r) => s + r.elapsedMs, 0) / n
    const costRows = group.filter(r => r.cost != null && !Number.isNaN(r.cost))
    const meanCost = costRows.length ? costRows.reduce((s, r) => s + r.cost, 0) / costRows.length : null
    results.push({ model, n, successRate, meanLatency, meanCost })
  }

  results.sort((a, b) => b.successRate - a.successRate || a.meanLatency - b.meanLatency || String(a.model).localeCompare(String(b.model)))
  console.log('eval-harness summary')
  console.log('model'.padEnd(48), 'n'.padStart(4), 'success'.padStart(9), 'latency_ms'.padStart(12), 'cost')
  for (const r of results) {
    const costStr = r.meanCost != null ? r.meanCost.toFixed(4) : '-'
    console.log(String(r.model).padEnd(48), String(r.n).padStart(4), (r.successRate * 100).toFixed(1) + '%'.padStart(9), r.meanLatency.toFixed(0).padStart(12), costStr)
  }
}

function loadLog() {
  if (!existsSync(LOG_PATH)) return []
  return readFileSync(LOG_PATH, 'utf8').split('\n').filter(Boolean).map(line => { try { return JSON.parse(line) } catch { return null } }).filter(Boolean)
}

function findRecordForRun(rows, run) {
  const matches = rows.filter(r => r.id === run.id && (!run.model || r.model === run.model))
  return matches.length ? matches[matches.length - 1] : null
}

function evaluateRun(run, record) {
  const verdicts = []
  if (run.timeout_seconds && record.elapsedMs > run.timeout_seconds * 1000)
    verdicts.push({ pass: false, label: 'elapsedMs <= timeout_seconds', detail: `${record.elapsedMs}ms > ${run.timeout_seconds}s` })
  if (run.expected_files && Array.isArray(run.expected_files))
    for (const f of run.expected_files) verdicts.push({ pass: existsSync(f), label: `file_exists: ${f}` })
  if (Array.isArray(run.assertions))
    for (const a of run.assertions) {
      const pass = evaluateAssertion(a, record)
      const detail = pass ? 'ok' : (a.type === 'llm_judge' ? 'UNSUPPORTED (no MCP dispatch)' : 'FAIL')
      verdicts.push({ pass, label: `${a.type}: ${a.target}${a.path ? '.' + a.path : ''}`, detail })
    }
  return { id: run.id, pass: !verdicts.length || verdicts.every(v => v.pass), verdicts }
}

function printResults(results) {
  let anyFail = false
  for (const r of results) {
    const status = r.pass ? 'PASS' : 'FAIL'
    if (!r.pass) anyFail = true
    console.log(`${r.id}: ${status}`)
    for (const v of r.verdicts) console.log(`  ${v.pass ? '✓' : '✗'} ${v.label} — ${v.detail}`)
  }
  return anyFail
}

function runMode(manifestPath, ciMode) {
  if (!existsSync(manifestPath)) { console.error(`manifest not found: ${manifestPath}`); process.exit(1) }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  let runs, minSuccess = DEFAULT_MIN_SUCCESS
  if (Array.isArray(manifest)) runs = manifest
  else if (manifest?.runs && Array.isArray(manifest.runs)) { runs = manifest.runs; if (manifest.min_success !== undefined) minSuccess = Number(manifest.min_success) }
  else { console.error('manifest must be a JSON array or object with runs array'); process.exit(1) }

  for (let i = 0; i < runs.length; i++) {
    const run = runs[i]
    if (run && Array.isArray(run.assertions)) {
      const errors = validateAssertionShape(run.assertions, `run[${i}]`)
      for (const err of errors) console.error(err)
      if (errors.length) process.exit(1)
    }
  }

  const results = runs.map(run => {
    const record = findRecordForRun(loadLog(), run)
    if (!record) return { id: run.id, pass: false, verdicts: [{ pass: false, label: 'record', detail: 'no matching log row found' }] }
    return evaluateRun(run, record)
  })

  let anyFail = printResults(results)
  if (ciMode) {
    console.log(anyFail ? '\nCI GATE: FAIL' : '\nCI GATE: PASS')
    const modelStats = new Map()
    for (const row of loadLog()) {
      const key = row.model
      if (!modelStats.has(key)) modelStats.set(key, { total: 0, successes: 0 })
      const s = modelStats.get(key); s.total++; if (row.success) s.successes++
    }
    for (const [model, stat] of modelStats) {
      const rate = stat.total ? stat.successes / stat.total : 0
      if (rate < minSuccess) { anyFail = true; console.log(`  ✗ ${model} success rate ${(rate * 100).toFixed(1)}% < ${(minSuccess * 100).toFixed(0)}% threshold (${stat.successes}/${stat.total})`) }
    }
    if (anyFail) process.exit(1)
  }
}

function main() {
  const args = process.argv.slice(2)
  if (!args.length) usage()
  let manifestFlag = null, recordFlag = null, doSummarize = false, runFlag = null, ciFlag = null
  for (const arg of args) {
    if (arg.startsWith('--manifest=')) manifestFlag = arg.slice('--manifest='.length)
    else if (arg === '--summarize') doSummarize = true
    else if (arg.startsWith('--record=')) recordFlag = arg.slice('--record='.length)
    else if (arg.startsWith('--run=')) runFlag = arg.slice('--run='.length)
    else if (arg.startsWith('--ci=')) ciFlag = arg.slice('--ci='.length)
    else { console.error(`unknown flag: ${arg}`); usage() }
  }
  if (manifestFlag) validateManifest(manifestFlag)
  else if (recordFlag) appendRecord(recordFlag)
  else if (doSummarize) summarize()
  else if (runFlag) runMode(runFlag, false)
  else if (ciFlag) runMode(ciFlag, true)
  else usage()
}

main()
