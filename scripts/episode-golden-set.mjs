#!/usr/bin/env node
// episode-golden-set.mjs — bridge between episodic memory and eval-harness golden sets.
// Plain ESM, node:fs only.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'

const EPISODES_PATH = 'tmp/memory/episodes.jsonl'

function usage() {
  console.error(`Usage:
  node scripts/episode-golden-set.mjs --summarize                 count by task_family + verified ratio
  node scripts/episode-golden-set.mjs --golden                    emit verified episodes as eval-harness manifest
  node scripts/episode-golden-set.mjs --distill=<transcript.jsonl> append candidate episodes (verified:false)`)
  process.exit(2)
}

function readEpisodes() {
  if (!existsSync(EPISODES_PATH)) return []
  const raw = readFileSync(EPISODES_PATH, 'utf8')
  const lines = raw.split('\n').filter(Boolean)
  const episodes = []
  for (const line of lines) {
    try {
      episodes.push(JSON.parse(line))
    } catch {
      // skip malformed lines
    }
  }
  return episodes
}

function writeEpisodes(episodes) {
  const dir = EPISODES_PATH.split('/').slice(0, -1).join('/')
  try { mkdirSync(dir, { recursive: true }) } catch {}
  const lines = episodes.map(e => JSON.stringify(e))
  writeFileSync(EPISODES_PATH, lines.join('\n') + '\n', 'utf8')
}

function distillTranscript(transcriptPath) {
  if (!existsSync(transcriptPath)) {
    console.error(`transcript not found: ${transcriptPath}`)
    process.exit(1)
  }
  const raw = readFileSync(transcriptPath, 'utf8')
  const lines = raw.split('\n').filter(Boolean)

  const patterns = /\b(failure|failed|error|fix|resolved|lesson|learned|blocked|retry|fallback)\b/i
  const candidates = []
  for (const line of lines) {
    if (patterns.test(line)) {
      try {
        const obj = JSON.parse(line)
        if (obj && typeof obj === 'object') candidates.push(obj)
      } catch {
        // skip non-JSON lines
      }
    }
    if (candidates.length >= 3) break
  }

  const existing = readEpisodes()
  for (const c of candidates.slice(0, 3)) {
    existing.push({
      id: `episode-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      trigger: c.trigger || c.user || c.input || 'transcript event',
      action: c.action || c.model || c.tool || 'unknown action',
      outcome: c.outcome || c.result || 'unknown',
      lesson: c.lesson || c.insight || 'distilled from transcript',
      task_family: c.task_family || c.area || 'general',
      verified: false,
      date: new Date().toISOString().split('T')[0]
    })
  }
  writeEpisodes(existing)
  console.log(`distilled ${Math.min(candidates.length, 3)} episodes (verified:false) into ${EPISODES_PATH}`)
}

function goldenManifest() {
  const episodes = readEpisodes().filter(e => e.verified === true)
  const manifest = episodes.map(e => {
    const run = {
      id: e.id,
      model: e.task_family || 'default',
      prompt_path: `tmp/memory/episodes.jsonl#${e.id}`,
      timeout_seconds: 300
    }
    if (e.assertions && Array.isArray(e.assertions)) {
      const expectedFiles = e.assertions
        .filter(a => a && a.type === 'file_exists' && typeof a.path === 'string')
        .map(a => a.path)
      if (expectedFiles.length > 0) {
        run.expected_files = expectedFiles
      }
    }
    return run
  })
  process.stdout.write(JSON.stringify(manifest, null, 2) + '\n')
}

function summarize() {
  const episodes = readEpisodes()
  const byFamily = new Map()
  let verifiedCount = 0
  for (const e of episodes) {
    const fam = e.task_family || 'unknown'
    if (!byFamily.has(fam)) byFamily.set(fam, { total: 0, verified: 0 })
    const entry = byFamily.get(fam)
    entry.total++
    if (e.verified === true) {
      entry.verified++
      verifiedCount++
    }
  }
  console.log(`episodes: ${episodes.length} total, ${verifiedCount} verified (${episodes.length ? ((verifiedCount / episodes.length) * 100).toFixed(1) : '0.0'}%)`)
  console.log('task_family'.padEnd(20), 'total'.padStart(6), 'verified'.padStart(9))
  for (const [fam, entry] of byFamily) {
    console.log(fam.padEnd(20), String(entry.total).padStart(6), String(entry.verified).padStart(9))
  }
}

function main() {
  const args = process.argv.slice(2)
  if (args.length === 0) usage()

  let distillFlag = null
  let doGolden = false
  let doSummarize = false

  for (const arg of args) {
    if (arg.startsWith('--distill=')) distillFlag = arg.slice('--distill='.length)
    else if (arg === '--golden') doGolden = true
    else if (arg === '--summarize') doSummarize = true
    else {
      console.error(`unknown flag: ${arg}`)
      usage()
    }
  }

  if (distillFlag) distillTranscript(distillFlag)
  else if (doGolden) goldenManifest()
  else if (doSummarize) summarize()
  else usage()
}

main()
