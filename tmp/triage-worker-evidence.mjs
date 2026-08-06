/* triage-worker-evidence.mjs — turn worker JSONL evidence into a triage table.
 * Usage: node triage-worker-evidence.mjs <evidence.jsonl>...
 * Applies the KNOWN-FALSE-POSITIVE filter classes, then flattens real hits. */
import fs from 'node:fs'

function knownFalsePositive(o) {
  const cls = String(o.cls || o.selector || o.path || '')
  if (/sr-only/.test(cls)) return 'sr-only'
  if (/search-result-name/.test(cls)) return 'intentional-ellipsis'
  if (/selected-relationship-label/.test(cls)) return 'intentional-ellipsis'
  if (/focus-stage-neighbor-name/.test(cls)) return 'intentional-ellipsis'
  if (/focus-pocket|leaflet-tile|leaflet-layer/.test(cls)) return 'off-canvas-or-map'
  if (/aria-disabled/.test(cls)) return 'disabled-by-design'
  return null
}

const files = process.argv.slice(2)
if (files.length === 0) { console.log('usage: node triage-worker-evidence.mjs <file0> <file1> ...'); process.exit(0) }

for (const file of files) {
  if (!fs.existsSync(file)) { console.log(`[missing] ${file}`); continue }
  const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean)
  const real = []
  const dismissed = new Map()
  let beats = 0
  let sentinel = false
  for (const line of lines) {
    let o
    try { o = JSON.parse(line) } catch { continue }
    if (o.kind === 'beat') { beats++; continue }
    if (typeof o.text === 'string' && /AUDIT DONE|DIVE LINE DONE/.test(o.text)) { sentinel = true; continue }
    const fp = knownFalsePositive(o)
    if (fp) dismissed.set(fp, (dismissed.get(fp) || 0) + 1)
    else real.push(o)
  }
  console.log(`\n═══ ${file} ═══`)
  console.log(`  beats: ${beats} | sentinel: ${sentinel} | real findings: ${real.length} | dismissed: ${[...dismissed.entries()].map(([k, v]) => `${k}×${v}`).join(', ')}`)
  for (const r of real.slice(0, 12)) {
    const tag = r.tag || r.selector || r.path || ''
    const cls = String(r.cls || '').slice(0, 40)
    const txt = JSON.stringify(String(r.txt || r.text || '').slice(0, 50))
    console.log(`  ● ${r.kind || r.type || 'finding'} ${tag} ${cls} ${txt} sw=${r.sw ?? '-'} cw=${r.cw ?? '-'}`)
  }
}