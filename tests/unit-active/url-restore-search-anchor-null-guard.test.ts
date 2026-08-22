/**
 * url-restore-search-anchor-null-guard.test.ts
 *
 * Regression guard for the phantom anchor=0 bug (found live 2026-08-22):
 * `Number(null)` and `Number('')` are both 0, so the previous
 * `Number.isFinite(Number(anchorId))` check treated anchor-less ?q= deep
 * links (?q=coffee) as "numeric anchor 0" — phantom-focusing dataset index 0
 * (1845 Solutions), opening its business card, arming walk controls, and
 * persisting anchor=0 into the URL on every shared search link.
 *
 * The fix requires a present (truthy) anchorId before the isFinite check:
 *   const numericAnchor = !!anchorId && Number.isFinite(Number(anchorId))
 *
 * Run: npx vitest run tests/unit-active/url-restore-search-anchor-null-guard.test.ts
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

function readSearchRestoreSource(): string {
    return readFileSync(resolve(__dirname, '../../src/lib/orchestration/url-restore-search.ts'), 'utf-8')
}

describe('url-restore-search: anchor=null must never resolve as numeric anchor 0', () => {
    it('guards numericAnchor with a truthy anchorId check', () => {
        const src = readSearchRestoreSource()
        const decl = src.match(/const numericAnchor = .+/)
        expect(decl, 'numericAnchor declaration must exist').not.toBeNull()
        // Must short-circuit on missing/empty anchorId BEFORE Number() coercion.
        expect(decl![0]).toMatch(/!!anchorId\s*&&/)
        // The unguarded footgun must not come back.
        expect(decl![0]).not.toMatch(/=\s*Number\.isFinite\(Number\(anchorId\)\)\s*$/)
    })

    it('documents WHY the guard exists (Number(null)/Number("") === 0 footgun)', () => {
        const src = readSearchRestoreSource()
        expect(src).toMatch(/Number\(null\)/)
        expect(src).toMatch(/phantom-focus/i)
    })
})
