#!/usr/bin/env node
/**
 * verify-skills.mjs — loader-faithful SKILL.md frontmatter validation.
 *
 * Uses PI'S OWN parser (dist/utils/frontmatter.js) so the check is exactly
 * what the resource loader runs. A file that THROWS here is silently dropped
 * from skill discovery at reload — catch those before they cost a skill.
 *
 * Usage:
 *   node scripts/verify-skills.mjs            # validate + print totals
 *   node scripts/verify-skills.mjs --quiet    # exit-code only (for hooks)
 *
 * Exit 0 = all skills parse; 1 = any throw/incomplete/missing.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { pathToFileURL } from 'node:url'

const QUIET = process.argv.includes('--quiet')

const PI_PKG = process.env.PI_PACKAGE_PATH ||
  join(process.env.APPDATA || '', 'npm', 'node_modules', '@earendil-works', 'pi-coding-agent')
const FM_URL = pathToFileURL(join(PI_PKG, 'dist', 'utils', 'frontmatter.js')).href

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

const { parseFrontmatter } = await import(FM_URL)

const files = []
for (const root of ROOTS) findSkills(root, files)

let ok = 0
let thrown = 0
let incomplete = 0
let missing = 0
let totalChars = 0
const problems = []

for (const f of files.sort()) {
  const content = readFileSync(f, 'utf8')
  try {
    const { frontmatter } = parseFrontmatter(content)
    if (Object.keys(frontmatter).length === 0) {
      missing++
      problems.push(`  NO-FRONTMATTER ${f}`)
      continue
    }
    const name = String(frontmatter?.name ?? '').trim()
    const desc = String(frontmatter?.description ?? '').trim()
    if (!name || !desc) {
      incomplete++
      problems.push(`  INCOMPLETE ${f} (name=${!!name} desc=${!!desc})`)
      continue
    }
    ok++
    totalChars += name.length + desc.length
  } catch (e) {
    thrown++
    problems.push(`  THROWS ${f} — ${e.code || e.message}`)
  }
}

const summary = `skills: ${ok}/${files.length} ok · thrown ${thrown} · incomplete ${incomplete} · no-frontmatter ${missing} · name+desc ${totalChars} chars`

if (!QUIET) {
  console.log(summary)
  if (problems.length) {
    console.log('PROBLEMS:')
    problems.forEach((p) => console.log(p))
  }
}

const pass = thrown === 0 && incomplete === 0 && missing === 0
if (!pass) {
  if (QUIET) { console.error(`[verify-skills] ${summary}`); problems.slice(0, 8).forEach((p) => console.error(p)) }
  process.exit(1)
}
console.log('[verify-skills] PASS — all skill frontmatters load under pi\'s parser')