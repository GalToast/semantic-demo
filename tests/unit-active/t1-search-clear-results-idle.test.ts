/**
 * Regression test: `clearSearchResults()` sets `searchStatus = 'idle'` directly
 * (Tier-1 fix #6). The previous code used a dead ternary
 * `(...? query ?? '').trim() ? 'idle' : 'idle'` that always evaluated to `'idle'`
 * — a misleading no-op smell. The fix replaces it with an explicit assignment.
 *
 * Two complementary guards:
 *   1. Source-text guard — pins the explicit idle assignment and bans the dead
 *      ternary `? 'idle' : 'idle'` inside clearSearchResults() (mirrors the
 *      t1-keyboard-help source-text style).
 *   2. Behavioral guard — drives `clearSearchResults()` through the real
 *      search.svelte.ts store in jsdom and asserts the post-condition
 *      `searchStatus() === 'idle'`. A behavioral regression that flips back to a
 *      ternary returning the wrong branch fails here even if the cosmetic source
 *      string remains unchanged.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import {
    clearSearchResults,
    setSearchResults,
    searchStatus,
    resetSearchForTests
} from '@lib/stores/search.svelte.ts'

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf-8')

describe('t1 clearSearchResults sets idle without dead ternary', () => {
    describe('source-text guard (explicit idle assignment, no dead ternary)', () => {
        it("replaces (...query).trim() ? 'idle' : 'idle' with explicit searchStatus = 'idle'", () => {
            const src = read('../../src/lib/stores/search.svelte.ts')

            const m = src.match(/export function clearSearchResults\(\)[\s\S]*?\n\}/)
            expect(m, 'clearSearchResults() should be present').toBeTruthy()
            const block = m![0]

            // Fix present: explicit idle assignment.
            expect(block).toContain("appState.searchState.searchStatus = 'idle'")

            // Old dead ternary absent: a `? 'idle' : 'idle'` construct is always a no-op smell.
            expect(block).not.toContain("? 'idle' : 'idle'")
        })
    })

    describe('behavioral (clearSearchResults flips a non-idle status back to idle)', () => {
        beforeEach(() => {
            // Start from a clean search mirror so prior state doesn't leak between cases.
            resetSearchForTests()
        })

        it('clearSearchResults resets a results state to searchStatus idle', () => {
            // setSearchResults sets searchStatus = 'results' (a non-idle state).
            setSearchResults([{ id: '1', name: 'C', index: 0, score: 1, category: '', snippet: '' }])
            expect(searchStatus()).toBe('results')

            clearSearchResults()

            // The fix: explicit `searchStatus = 'idle'` — not a dead ternary that could
            // silently return the wrong branch.
            expect(searchStatus()).toBe('idle')
        })
    })
})
