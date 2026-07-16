/**
 * z-index-consistency.test.ts — Guard against undefined `var(--z-*)` usages.
 *
 * The UI sweep (W48) found real bugs where components used
 * `var(--z-NAME, <fallback>)` with an UNDECLARED token:
 *   - `--z-devtools`  DevTelemetry fallback 9000 vs SpectorInspector fallback 5
 *   - `--z-search-bar` SearchBar fallback 2 (contained search bar dropped behind content)
 * An undefined token silently falls back to a wrong value, so the bug is
 * invisible until a layer renders in the wrong place. This test scans every
 * `var(--z-NAME)` in src/ + css/ and fails if NAME is not declared in any
 * :root (the single-source-of-truth check). Catches the whole regression
 * class where a token is used but never defined.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import { resolve, extname } from 'path'

const ROOT = resolve(__dirname, '../..')

function walk(dir: string): string[] {
  const out: string[] = []
  for (const e of readdirSync(dir)) {
    const p = resolve(dir, e)
    const s = statSync(p)
    if (s.isDirectory()) {
      if (e === 'node_modules' || e === '.git' || e === 'dist') continue
      out.push(...walk(p))
    } else {
      const ext = extname(p).toLowerCase()
      if (['.ts', '.js', '.svelte', '.css', '.html'].includes(ext)) out.push(p)
    }
  }
  return out
}

function collectDeclared(): Set<string> {
  const declared = new Set<string>()
  for (const f of walk(resolve(ROOT, 'src')).concat(walk(resolve(ROOT, 'css')))) {
    const txt = readFileSync(f, 'utf8')
    for (const m of txt.matchAll(/--z-[a-z0-9-]+/gi)) declared.add(m[0].toLowerCase())
  }
  return declared
}

function collectUsed(): Map<string, string[]> {
  const used = new Map<string, string[]>()
  const files = walk(resolve(ROOT, 'src')).concat(walk(resolve(ROOT, 'css')))
  for (const f of files) {
    const txt = readFileSync(f, 'utf8')
    for (const m of txt.matchAll(/var\((--z-[a-z0-9-]+)\s*(,[^)]*)?\)/gi)) {
      const name = m[1].toLowerCase()
      if (!used.has(name)) used.set(name, [])
      used.get(name)!.push(f.replace(ROOT, ''))
    }
  }
  return used
}

describe('z-index token consistency', () => {
  const declared = collectDeclared()
  const used = collectUsed()

  it('every var(--z-*) used is declared in a :root (no undefined tokens)', () => {
    const undefinedUsed: string[] = []
    for (const name of used.keys()) {
      if (!declared.has(name)) undefinedUsed.push(`${name}  <-  ${used.get(name)!.join(', ')}`)
    }
    if (undefinedUsed.length) {
      throw new Error(
        'Undefined --z-* tokens are used (they silently fall back to a wrong value):\n' +
          undefinedUsed.map((u) => '  - ' + u).join('\n')
      )
    }
    expect(undefinedUsed).toEqual([])
  })
})
