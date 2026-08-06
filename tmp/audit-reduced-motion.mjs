/* audit-reduced-motion.mjs — find animation keyframes used OUTSIDE the prefers-reduced-motion
 * gates. Output: candidates whose @keyframes is NOT mentioned in any reduce-media block.
 * Usage: node audit-reduced-motion.mjs   (browser-free; prints gaps) */
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
const cssDir = 'css'
const files = readdirSync(cssDir, { recursive: true }).filter(f => f.endsWith('.css'))
const all = new Map() // name -> [files]
const reduceBlocks = []
const reduce = reduceBlocks
for (const f of files) {
  const txt = readFileSync(path.join(cssDir, f), 'utf8')
  for (const m of txt.matchAll(/@keyframes\s+([a-zA-Z0-9_-]+)/g)) {
    if (!all.has(m[1])) all.set(m[1], [])
    all.get(m[1]).push(f)
  }
  // capture reduced-motion block contents (with selector context)
  const inReduce = txt.split('@media (prefers-reduced-motion: reduce)').slice(1)
  for (const blk of inReduce) reduce.push(blk.slice(0, Math.min(blk.length, blk.indexOf('}') + 400)))
}
const reduceText = reduce.join('\n')
const gaps = []
for (const [name, files] of all) {
  if (!reduceText.includes(name) && !reduceText.includes('*')) gaps.push({ name, files })
}
console.log(`keyframes total: ${all.size}`)
console.log(`not mentioned in ANY reduce block: ${gaps.length}`)
for (const g of gaps) console.log(`  ${g.name}: ${g.files.map(f=>f.split('/').pop()).join(',')}`)
