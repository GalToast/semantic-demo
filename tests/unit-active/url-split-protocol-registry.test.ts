// url-split-protocol-registry.test.ts — pins WHO reads WHICH url-restore split file.
//
// 2026-08-17: a pointer drift to the wrong split file silently red'd 16 tests
// overnight (a3-3 + url-state-no-synthetic). This registry makes any UNREGISTERED
// reader of the url-restore family fail at the boundary so a split-move can never
// silently orphan a suite again. When the wave refactors the split, the registry
// is the single place to repoint — and it will tell you exactly who must follow.
import { test, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

const UNIT = resolve(__dirname, '..', 'unit-active')
const READER_FILES = readdirSync(UNIT).filter((f) => f.endsWith('.test.ts'))

// Registry: reader-basename → the url-restore source file it MUST reference.
const REGISTRY: Record<string, string> = {
  'a3-3-invalid-anchor-fallback.test.ts': 'url-restore-deep-link.ts',
  'url-state-no-synthetic-input.test.ts': 'url-restore-search.ts',
  'url-state-options-contract.test.ts': '@lib/orchestration/url-restore',
}
const SELF = 'url-split-protocol-registry.test.ts'

test('every url-restore reader is registered (no silent readers)', () => {
  const readers = READER_FILES.filter((f) => {
    if (f === SELF) return false
    const src = readFileSync(join(UNIT, f), 'utf8')
    return src.includes('url-restore')
  })
  for (const r of readers) {
    expect(Object.keys(REGISTRY), `unregistered reader ${r} — add it to REGISTRY`).toContain(r)
  }
})

test('registered readers still point at their registered file (drift detector)', () => {
  for (const [reader, expectedFile] of Object.entries(REGISTRY)) {
    const src = readFileSync(join(UNIT, reader), 'utf8')
    expect(
      src.includes(expectedFile),
      `${reader} no longer references ${expectedFile} — the split moved: update REGISTRY + the pointer in ${reader}`,
    ).toBe(true)
  }
})