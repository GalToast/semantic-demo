/**
 * search-trail-cue-lifecycle-contract.mjs
 *
 * Source-level contract ensuring the active search store path drives the
 * search-trail-cue overlay. Previously the cue renderer was defined but never
 * invoked from the SearchInput.svelte / search-store path that actually runs
 * in production, so multi-result searches left the cue hidden.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const CWD = process.cwd()
const SEARCH_STORE_PATH = resolve(CWD, 'src/lib/stores/search.svelte.ts')

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERTION FAILED: ${message}`)
}

function assertContains(src, needle, label) {
    assert(src.includes(needle), `${label}: expected source to contain "${needle}"`)
}

const storeSrc = readFileSync(SEARCH_STORE_PATH, 'utf8')

console.log('\n[TEST 1] search store imports updateSearchTrailCue from the renderer')
assertContains(
    storeSrc,
    "import { updateSearchTrailCue } from '@lib/journey/search-trail-cue-renderer'",
    'search store must import updateSearchTrailCue'
)
console.log('  PASS')

console.log('\n[TEST 2] setSearchStatus(searching) advances the cue to the query stage')
assertContains(
    storeSrc,
    "updateSearchTrailCue({ stage: 'query' })",
    'setSearchStatus must call updateSearchTrailCue({ stage: \'query\' }) when searching'
)
console.log('  PASS')

console.log('\n[TEST 3] setSearchResults advances the cue based on result count')
assertContains(
    storeSrc,
    "updateSearchTrailCue(results.length > 0 ? { stage: 'explore' } : { stage: 'empty' })",
    'setSearchResults must call updateSearchTrailCue with explore/empty stage'
)
console.log('  PASS')

console.log('\n[TEST 4] setSearchError advances the cue to the empty stage')
assertContains(
    storeSrc,
    "updateSearchTrailCue({ stage: 'empty' })",
    'setSearchError must call updateSearchTrailCue({ stage: \'empty\' })'
)
console.log('  PASS')

console.log('\n[TEST 5] clearSearch hides the cue')
assertContains(
    storeSrc,
    "updateSearchTrailCue({ beat: 'idle' })",
    'clearSearch must call updateSearchTrailCue({ beat: \'idle\' })'
)
console.log('  PASS')

console.log('\nsearch-trail-cue-lifecycle-contract.mjs passed')
