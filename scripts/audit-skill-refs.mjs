#!/usr/bin/env node
/**
 * audit-skill-refs.mjs — cross-reference integrity check for skills.
 * Verifies every "See X." inside a SKILL.md description points at a skill
 * directory that actually exists in any loaded skill root.
 *
 * Exit 0 = all refs resolvable; 1 = dangling refs found.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname, basename } from 'node:path'
import { homedir } from 'node:os'

const ROOTS = [
  join(homedir(), '.pi', 'agent', 'skills'),
  join(homedir(), '.pi', 'agent', 'pi-hermes-memory', 'skills'),
  join(homedir(), '.pi', 'agent', 'local-packages', 'pi-lens', 'skills'),
  join(homedir(), '.pi', 'agent', 'local-packages', 'pi-context', 'skills'),
  join(homedir(), '.pi', 'agent', 'npm', 'node_modules', 'pi-mcp-adapter', 'skills'),
  join(homedir(), '.pi', 'agent', 'projects-memory', 'skills'),
]

function findSkills(dir, acc) {
  let entries
  try { entries = readdirSync(dir, { withFileTypes: true }) } catch { return }
  for (const e of entries) {
    const p = join(dir, e.name)
    if (e.isDirectory()) findSkills(p, acc)
    else if (e.name === 'SKILL.md') acc.push(p)
  }
}

const files = []
for (const root of ROOTS) findSkills(root, files)

const skillDirs = new Set(files.map((f) => dirname(f)).map((d) => basename(d)).map((n) => n.toLowerCase()))

let refs = 0
const dangling = []
for (const file of files) {
  const src = readFileSync(file, 'utf8')
  const fm = src.match(/^---\n([\s\S]*?)\n---\n/m)
  if (!fm) continue
  const re = /See\s+([a-zA-Z0-9_-]+)\.?/g
  let m
  while ((m = re.exec(fm[1])) !== null) {
    const target = m[1].trim().toLowerCase()
    if (target === 'reference') continue
    refs++
    if (!skillDirs.has(target)) {
      dangling.push(`${basename(dirname(file))} -> ${target}`)
    }
  }
}

console.log(`skill dirs indexed: ${skillDirs.size} (from ${files.length} SKILL.md)`)
console.log(`See-refs found: ${refs}`)
console.log(`dangling refs: ${dangling.length}`)
for (const d of dangling.slice(0, 20)) console.log(`  DANGLING: ${d}`)
if (!dangling.length) console.log('CROSS-REF INTEGRITY OK')
process.exit(dangling.length ? 1 : 0)