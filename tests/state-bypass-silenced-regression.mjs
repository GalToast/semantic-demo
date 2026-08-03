/**
 * state-bypass-silenced-regression.mjs
 *
 * Regression test for silencing the 7 false-positive [State Bypass] warnings.
 *
 * Bug: legacy js/state.ts emitted two distinct [State Bypass] warnings that fired
 *      for every sub-property write on TRACKED_SUB_KEYS sub-objects, even
 *      for legitimate legacy code paths:
 *        1. Prod proxy (`_makeProdProxy` set trap) emitted
 *           "[State Bypass] <path>.<prop> — sub-object mutation detected;
 *            consider withStateMutation() for batch writes" for non-critical
 *           TRACKED_SUB_KEYS sub-property writes. Allowed the write to proceed.
 *        2. Deep-track dev proxy emitted
 *           "[State Bypass] <path>.<prop> — use store .update()" for every
 *           sub-property write on localhost. The top-level wholesale-
 *           reassignment warning already catches real "should use store.update()"
 *           cases, so this was redundant.
 *
 * Fix (2026-06-12): Silenced both warnings. W13-T5b later retired js/state.ts
 *      and moved mutation ownership to the canonical Svelte AppState plus
 *      src/lib/state/with-state-mutation.ts.
 *
 * Verification: this static-grep test confirms both warning emissions stay
 * removed from the canonical state/mutation surface.
 *
 * Run: node tests/state-bypass-silenced-regression.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const APP_STATE_PATH = path.join(__dirname, '..', 'src', 'lib', 'state', 'app.svelte.ts')
const MUTATION_PATH = path.join(__dirname, '..', 'src', 'lib', 'state', 'with-state-mutation.ts')

function assert(cond, msg) {
    if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`)
}

console.log('============================================================')
console.log('state-bypass-silenced-regression.mjs')
console.log('Static-grep regression: retired [State Bypass] warnings stay silenced')
console.log('============================================================')

const appStateSrc = fs.readFileSync(APP_STATE_PATH, 'utf-8')
const mutationSrc = fs.readFileSync(MUTATION_PATH, 'utf-8')
const src = `${appStateSrc}\n${mutationSrc}`

// 1. Prod proxy "sub-object mutation detected" warning must be removed
assert(
    !src.includes('sub-object mutation detected'),
    'Prod proxy "sub-object mutation detected" warning must stay removed from canonical state'
)

// 2. Deep-track dev proxy "use store .update()" warning must be removed
assert(
    !src.includes("' use store .update()'") && !src.includes('" use store .update()"'),
    'Deep-track dev proxy "use store .update()" warning must stay removed from canonical state'
)

// 3. Warning text must not reference the retired CRITICAL_KEYS/TRACKED_SUB_KEYS
//    mutation-guard machinery (removed in W66 cleanup). The old assertion that
//    checked these symbols were "preserved" has been retired alongside them.
assert(
    !src.includes('CRITICAL_KEYS') && !src.includes('TRACKED_SUB_KEYS_SET'),
    'Retired CRITICAL_KEYS/TRACKED_SUB_KEYS_SET machinery must not be referenced in canonical state'
)

// 4. Derived compatibility aliases replace legacy Proxy getters (getter/setter pairs).
assert(
    appStateSrc.includes('get semanticDiveMode') &&
        appStateSrc.includes('get focusedNode') &&
        appStateSrc.includes('set focusedNode(index: number | null)'),
    'AppState must preserve derived compatibility aliases that replaced legacy Proxy getters'
)

console.log('  OK Prod proxy "sub-object mutation detected" warning REMOVED')
console.log('  OK Deep-track dev proxy "use store .update()" warning REMOVED')
console.log('  OK Retired CRITICAL_KEYS/TRACKED_SUB_KEYS_SET machinery NOT referenced')
console.log('  OK Derived compatibility fields PRESERVED')
console.log('\n============================================================')
console.log('ALL CHECKS PASSED')
console.log('============================================================')
