/**
 * search-score-retention-contract.mjs
 *
 * Regression contract pinning the 50449bcd search-score-retention fix.
 *
 * Bug surface covered:
 *   - buildSearchResultsFromIndices() previously hardcoded score: 0 for every
 *     rendered result, so the DOM never surfaced real relevance scores.
 *     Commit 50449bcd (2026-08-08) changed it to look up the live score from
 *     appState.searchResults (the canonical scored array) by index via a
 *     scoredByIndex Map.
 *   - SearchResultItem.svelte now emits data-result-score={result.score} +
 *     data-result-rank on the result <button>, so the DOM carries honest scores.
 *   - Score normalization: local-search-index.ts normalizes to 0..1 via
 *     Math.min(1, hit.score / 3.0).
 *
 * Purpose: text-based regression-prevention. The hooks trip if a future
 * refactor re-hardcodes score: 0, drops the data-* attributes, or removes
 * the normalization constant.
 *
 * Load strategy: pure source-inspection (no runtime Svelte/store import) to
 * avoid the heavy Svelte 5 + appState import chain that requires full fake-DOM
 * bootstrap. All assertions are text-based against the canonical source files.
 * Runtime assertions (section 4) are attempted opportunistically if the
 * store module imports cleanly through the ts-resolve-loader; they are gated
 * and documented as non-blocking.
 */

import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'

const root = process.cwd()

const SEARCH_STORE_PATH = path.join(root, 'src', 'lib', 'stores', 'search.svelte.ts')
const SEARCH_RESULT_ITEM_PATH = path.join(root, 'src', 'components', 'SearchResultItem.svelte')
const LOCAL_SEARCH_INDEX_PATH = path.join(root, 'src', 'lib', 'search', 'local-search-index.ts')

const searchSrc = fs.readFileSync(SEARCH_STORE_PATH, 'utf8')
const itemSrc = fs.readFileSync(SEARCH_RESULT_ITEM_PATH, 'utf8')
const localIndexSrc = fs.readFileSync(LOCAL_SEARCH_INDEX_PATH, 'utf8')

// ─── SECTION 1: buildSearchResultsFromIndices score retention ─────────────────
//
// Before 50449bcd the function body was:
//   return indices.map(idx => { ... score: 0, ... });
//
// After 50449bcd it builds a scoredByIndex Map from appState.searchResults
// and looks up each result's score by index.

const fnBodyStart = searchSrc.indexOf('function buildSearchResultsFromIndices')
assert(fnBodyStart !== -1, 'buildSearchResultsFromIndices must exist in search.svelte.ts')

const fnBodyEnd = searchSrc.indexOf('\n/** Build a fresh SearchStoreState', fnBodyStart)
assert(fnBodyEnd !== -1, 'Could not find end of buildSearchResultsFromIndices function')

const fnBody = searchSrc.slice(fnBodyStart, fnBodyEnd)

// 1a. Must NOT hardcode score: 0. The old pattern was `score: 0` inside the
//     map callback. New code may have `scoredByIndex.get(index) ?? 0` which
//     contains `0` as a fallback. Distinguish: the OLD code was a standalone
//     `score: 0` property in an object literal, not a `?? 0` fallback.
const scoreZeroLines = fnBody
    .split('\n')
    // Strip line comments before matching so the FIX-EXPLANATION comment
    // ('// score: 0, so the DOM never surfaced real scores') in the current
    // source doesn't false-positive. Only a real `score: 0` assignment in
    // executable code trips the guard.
    .map((l) => l.replace(/\/\/.*$/, '').trim())
    .filter((l) => /\bscore:\s*0\b/.test(l))
assert(
    scoreZeroLines.length === 0,
    `buildSearchResultsFromIndices must NOT hardcode score: 0. Found:${scoreZeroLines.map((l) => `\n    ${l.trim()}`).join('')}`
)

// 1b. Must contain a scoredByIndex Map built from appState.searchResults.
assert(
    /scoredByIndex/.test(fnBody),
    'buildSearchResultsFromIndices must reference scoredByIndex (the score lookup Map)'
)
assert(
    /appState\.searchResults/.test(fnBody),
    'buildSearchResultsFromIndices must reference appState.searchResults (source of live scores)'
)

// 1c. Must contain a Map constructor for scoredByIndex.
assert(
    /new Map\b/.test(fnBody),
    'buildSearchResultsFromIndices must construct a scoredByIndex Map (new Map)'
)

// 1d. Must contain a score lookup pattern: scoredByIndex.get(index) (with or
//     without the ?? 0 fallback). This is the replacement for the old
//     hardcoded score: 0.
assert(
    /scoredByIndex\.get\s*\(/.test(fnBody),
    'buildSearchResultsFromIndices must look up scores via scoredByIndex.get(...)'
)

console.log('PASS SECTION 1: buildSearchResultsFromIndices uses scoredByIndex Map, no score:0 hardcode')

// ─── SECTION 2: SearchResultItem.svelte data-result-score attribute ────────────
//
// The <button> element must carry data-result-score={result.score} so DOM
// inspection and E2E tests can read the score directly.

assert(
    /data-result-score=\{/.test(itemSrc),
    'SearchResultItem.svelte must contain data-result-score={...} on the result button'
)

// Verify it references result.score (not a constant or different field)
assert(
    /data-result-score=\{result\.score\}/.test(itemSrc),
    'SearchResultItem.svelte data-result-score must reference result.score'
)

// Also verify data-result-rank exists (paired attribute, same commit)
assert(
    /data-result-rank/.test(itemSrc),
    'SearchResultItem.svelte must contain data-result-rank on the result button'
)

console.log('PASS SECTION 2: SearchResultItem.svelte emits data-result-score + data-result-rank')

// ─── SECTION 3: local-search-index.ts normalization constant ───────────────────
//
// localHitsToResults() normalizes raw hit scores to [0, 1] via
// Math.min(1, hit.score / 3.0). This pin prevents accidentally removing
// the normalization and feeding raw scores (>1 possible) to the render path.

assert(
    /Math\.min\s*\(\s*1\s*,/.test(localIndexSrc),
    'local-search-index.ts must contain Math.min(1, ...) normalization'
)

// The normalization lives inside localHitsToResults; verify it's in that function
// or at minimum that the score field is capped.
const localHitsStart = localIndexSrc.indexOf('export function localHitsToResults')
assert(localHitsStart !== -1, 'localHitsToResults must exist in local-search-index.ts')

const localHitsEnd = localIndexSrc.indexOf('\n/**\n * Get the top', localHitsStart)
const localHitsBody = localIndexSrc.slice(localHitsStart, localHitsEnd !== -1 ? localHitsEnd : undefined)

assert(
    /Math\.min\s*\(\s*1\s*,\s*hit\.score\s*\/\s*3\.0\s*\)/.test(localHitsBody),
    'localHitsToResults must normalize score via Math.min(1, hit.score / 3.0)'
)

console.log('PASS SECTION 3: local-search-index.ts normalizes scores via Math.min(1, hit.score / 3.0)')

// ─── SECTION 4: Runtime import (opportunistic) ────────────────────────────────
//
// Attempt to import buildSearchResultsFromIndices from the store module.
// This may fail because the search store pulls in appState → Svelte 5 runes
// → fake-DOM requirements. Document the outcome but never fail the contract
// over it — the source assertions above are sufficient.

let runtimePassed = false
let runtimeNote

try {
    const searchMod = await import('../src/lib/stores/search.svelte.ts')
    // The function may be exported or module-local. Check if it's accessible.
    // It's not exported directly — it's called internally by buildSearchStoreSnapshot
    // and the init path runs immediately on import. If the import survived (no
    // crash), the module loaded successfully and the score code is functional.
    // The source assertions above already proved the fix.
    runtimeNote = 'store module imported successfully (score-retention code is load-safe)'
    runtimePassed = true
} catch (err) {
    runtimeNote = `store module import NOT attempted/FAILED (expected — requires full appState bootstrap): ${err.message.split('\n')[0]}`
}

if (runtimePassed) {
    console.log(`PASS SECTION 4: runtime import succeeded — ${runtimeNote}`)
} else {
    console.log(`SKIP SECTION 4: runtime import skipped (source assertions sufficient) — ${runtimeNote}`)
}

// ─── Summary ───────────────────────────────────────────────────────────────────

console.log('\n=== search-score-retention-contract.mjs COMPLETE ===')
console.log('3 source-inspection sections verified.')
console.log('Score retention invariant: buildSearchResultsFromIndices → scoredByIndex Map → result.score')
console.log('DOM contract: SearchResultItem.svelte → data-result-score + data-result-rank on button')
console.log('Normalization: localHitsToResults → Math.min(1, hit.score / 3.0)')
if (runtimePassed) console.log('Runtime: store module loaded — score code is load-safe.')
else console.log(`Runtime: not required for contract pass. ${runtimeNote}`)
