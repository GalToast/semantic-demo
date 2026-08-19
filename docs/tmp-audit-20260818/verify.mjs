#!/usr/bin/env node
// Main-lane gate for the tmp-junkyard swarm. Cross-checks lanes A/B/C against
// each other and the baseline snapshot. Exit 0 = audit passes its own rubric.
import { readFileSync, existsSync } from 'node:fs'
import { execSync } from 'node:child_process'
const D = 'tmp/swarm-tmp-audit-20260818'
const A = D + '/lane-a-tracked'   // lane A: manifest.json, REPORT.md, untrack-cmds.txt
const B = D + '/lane-b-disk'      // lane B: inventory.json, delete-candidates.tsv, REPORT.md
const C = D + '/lane-c-history'   // lane C: REPORT.md ; extra artifacts (birth-map, cleanup-plan) in D + '/lane-a/'
let fails = 0, oks = 0
const ok = m => { oks++; console.log('  ok  ' + m) }
const bad = m => { fails++; console.log('  FAIL ' + m) }

const before = readFileSync(D + '/before-tracked-list.txt', 'utf8').split('\n').filter(Boolean)
console.log('baseline: ' + before.length + ' tracked tmp files')

// ---- lane A: 100% coverage + verdicts + manifest/untrack consistency ----
if (!existsSync(A + '/manifest.json')) bad('lane A: manifest.json missing')
else {
  let man
  try { man = JSON.parse(readFileSync(A + '/manifest.json', 'utf8')) }
  catch (e) { bad('lane A: manifest.json not valid JSON'); man = [] }
  const seen = new Set(man.map(r => r.path))
  const missing = before.filter(p => !seen.has(p))
  if (missing.length) bad('lane A: ' + missing.length + ' tracked files have no verdict: ' + missing.slice(0, 6).join(', '))
  else ok('lane A: 100% coverage (' + before.length + '/' + before.length + ')')
  const badV = man.filter(r => !['UNTRACK', 'KEEP', 'ASK'].includes(r.verdict))
  if (badV.length) bad('lane A: bad verdicts: ' + badV.map(r => r.path + '=' + r.verdict).join(', '))
  else ok('lane A: all verdicts in {UNTRACK,KEEP,ASK} (' + man.length + ' rows)')
  const untrack = man.filter(r => r.verdict === 'UNTRACK').map(r => r.path).sort()
  if (existsSync(A + '/untrack-cmds.txt')) {
    const cmds = readFileSync(A + '/untrack-cmds.txt', 'utf8').match(/git rm --cached tmp\/[^\s]+/g) || []
    const paths = cmds.map(c => c.replace(/^git rm --cached /, '')).sort()
    if (JSON.stringify(paths) === JSON.stringify(untrack)) ok('lane A: untrack-cmds.txt == manifest UNTRACK set (' + untrack.length + ')')
    else bad('lane A: untrack-cmds.txt (' + paths.length + ') != manifest UNTRACK (' + untrack.length + ')')
  } else bad('lane A: untrack-cmds.txt missing')
}

// ---- lane B: classification + byte reconciliation ----
if (!existsSync(B + '/inventory.json')) bad('lane B: inventory.json missing (still running)')
else {
  let inv
  try { inv = JSON.parse(readFileSync(B + '/inventory.json', 'utf8')) }
  catch (e) { bad('lane B: inventory.json not valid JSON'); inv = [] }
  const allowed = ['SOURCES-UNRELATED', 'SEMANTIC-SCRAP', 'SAFETY-KEEP', 'MOVABLE', 'UNKNOWN']
  const badC = inv.filter(r => !allowed.includes(r.class))
  if (badC.length) bad('lane B: bad classes: ' + badC.map(r => r.path + '=' + r.class).join(', '))
  else ok('lane B: ' + inv.length + ' entries, all classes valid')
  const sum = inv.reduce((a, r) => a + (r.bytes || 0), 0)
  const measured = execSync('du -sb tmp/* 2>/dev/null | awk -v d=tmp/swarm-tmp-audit-20260818 "$0 !~ d {s+=$1} END {print s+0}"', { encoding: 'utf8' }).trim()
  const pct = measured ? Math.abs(sum - +measured) / +measured : 1
  if (pct <= 0.05) ok('lane B: bytes reconcile (' + (sum / 1e9).toFixed(2) + 'GB vs measured ' + (+measured / 1e9).toFixed(2) + 'GB, ' + (pct * 100).toFixed(1) + '%)')
  else bad('lane B: byte mismatch ' + (pct * 100).toFixed(1) + '%')
  if (existsSync(B + '/delete-candidates.tsv')) {
    const rows = readFileSync(B + '/delete-candidates.tsv', 'utf8').split('\n').filter(Boolean)
    const scrap = inv.filter(r => r.class === 'SEMANTIC-SCRAP').reduce((a, r) => a + (r.bytes || 0), 0)
    ok('lane B: delete-candidates.tsv has ' + rows.length + ' rows; SEMANTIC-SCRAP total ' + (scrap / 1e9).toFixed(2) + 'GB')
  }
}

// ---- lane C: forensics + policy + cross-lane consistency ----
if (!existsSync(C + '/REPORT.md')) bad('lane C: REPORT.md missing')
else ok('lane C: REPORT.md present')
if (existsSync('docs/tmp-hygiene.md')) ok('lane C: docs/tmp-hygiene.md written')
else bad('lane C: docs/tmp-hygiene.md missing')
if (existsSync(D + '/lane-a/birth-map.tsv')) ok('lane C: birth-map.tsv present (' + readFileSync(D + '/lane-a/birth-map.tsv', 'utf8').split('\n').filter(Boolean).length + ' rows)')
// lane C stashed its cleanup-plan in D/lane-a/ (worker artifact placement quirk)
if (existsSync(D + '/lane-a/cleanup-plan.txt') || existsSync(C + '/cleanup-plan.txt')) {
  const planSrc = existsSync(D + '/lane-a/cleanup-plan.txt') ? D + '/lane-a/cleanup-plan.txt' : C + '/cleanup-plan.txt'
  const plan = readFileSync(planSrc, 'utf8').match(/git rm --cached tmp\/[^\s]+/g) || []
  const untrack = existsSync(A + '/manifest.json')
    ? JSON.parse(readFileSync(A + '/manifest.json', 'utf8')).filter(r => r.verdict === 'UNTRACK').map(r => r.path).sort()
    : []
  if (untrack.length && JSON.stringify(plan.map(c => c.replace(/^git rm --cached /, '')).sort()) === JSON.stringify(untrack))
    ok('lane C: cleanup-plan == lane A UNTRACK set (' + untrack.length + ')')
  else bad('lane C: cleanup-plan != lane A UNTRACK set (plan ' + plan.length + ' vs manifest ' + untrack.length + ')')
}

console.log('\n==== ' + oks + ' ok, ' + fails + ' fail ====')
process.exit(fails ? 1 : 0)