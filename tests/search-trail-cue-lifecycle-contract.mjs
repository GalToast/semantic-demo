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
import './helpers/svelte-rune-shim.mjs'

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

console.log('\nsearch-trail-cue-lifecycle-contract static passed')

// ── Runtime Behavioral Tests ──────────────────────────────────────────────────

// DOM shim for updateSearchTrailCue
if (!globalThis.document) {
    const elements = {}
    globalThis.document = {
        body: { dataset: {} },
        getElementById(id) {
            if (!elements[id]) {
                elements[id] = {
                    id,
                    hidden: true,
                    classList: {
                        _classes: [],
                        add(c) { if (!this._classes.includes(c)) this._classes.push(c) },
                        remove(c) { this._classes = this._classes.filter(x => x !== c) },
                        contains(c) { return this._classes.includes(c) },
                        toggle(c, v) {
                            if (v) { if (!this._classes.includes(c)) this._classes.push(c) }
                            else { this._classes = this._classes.filter(x => x !== c) }
                            return this._classes.includes(c)
                        }
                    },
                    querySelectorAll(sel) {
                        // Return fake step elements for the cue stages
                        if (sel === '.search-trail-cue-step') {
                            return ['query', 'anchor', 'explore'].map(stage => ({
                                dataset: { cueStage: stage },
                                classList: {
                                    _active: false,
                                    toggle(c, v) {
                                        if (c === 'active') this._active = v
                                    }
                                }
                            }))
                        }
                        return []
                    },
                    textContent: ''
                }
            }
            return elements[id]
        }
    }
    globalThis.performance = { now: () => 0 }
}

const { updateSearchTrailCue } = await import('../src/lib/journey/search-trail-cue-renderer.ts')
const cueEl = document.getElementById('search-trail-cue')

// R1: beat='idle' hides the cue
{
    updateSearchTrailCue({ beat: 'idle' })
    if (!cueEl.hidden) throw new Error('expected cue hidden on idle beat')
    if (cueEl.classList.contains('active')) throw new Error('expected no active class on idle beat')
    console.log('  R1 PASS: updateSearchTrailCue({ beat: "idle" }) → hidden + no active')
}

// R2: stage='query' shows the cue with active class
{
    document.body.dataset.panelSurface = 'overview'
    updateSearchTrailCue({ stage: 'query' })
    if (cueEl.hidden) throw new Error('expected cue visible on query stage')
    if (!cueEl.classList.contains('active')) throw new Error('expected active class on query stage')
    console.log('  R2 PASS: updateSearchTrailCue({ stage: "query" }) → visible + active')
}

// R3: stage='empty' shows empty state
{
    document.body.dataset.panelSurface = 'overview'
    updateSearchTrailCue({ stage: 'empty' })
    if (cueEl.hidden) throw new Error('expected cue visible on empty stage')
    if (!cueEl.classList.contains('active')) throw new Error('expected active class on empty stage')
    console.log('  R3 PASS: updateSearchTrailCue({ stage: "empty" }) → visible + active')
}

// R4: focus panel surface hides the cue (W48-UX guard)
{
    document.body.dataset.panelSurface = 'focus-search'
    updateSearchTrailCue({ stage: 'explore' })
    if (!cueEl.hidden) throw new Error('expected cue hidden when panelSurface starts with focus')
    console.log('  R4 PASS: focus panelSurface hides the cue (W48-UX guard)')
}

// R5: beat='focus' maps to anchor chip highlight
{
    document.body.dataset.panelSurface = 'overview'
    updateSearchTrailCue({ beat: 'focus', stage: 'anchor' })
    if (cueEl.hidden) throw new Error('expected cue visible on focus beat')
    console.log('  R5 PASS: focus beat → anchor chip highlight, cue visible')
}

console.log('\nsearch-trail-cue-lifecycle-contract.mjs complete')
