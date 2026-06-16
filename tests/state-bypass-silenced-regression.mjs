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
 * removed from the canonical state/mutation surface and that the bridge still
 * exposes the compatibility state export plus withStateMutation().
 *
 * Run: node tests/state-bypass-silenced-regression.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_STATE_PATH = path.join(__dirname, '..', 'src', 'lib', 'state', 'app.svelte.ts');
const MUTATION_PATH = path.join(__dirname, '..', 'src', 'lib', 'state', 'with-state-mutation.ts');
const BRIDGE_PATH = path.join(__dirname, '..', 'src', 'lib', 'engine', 'state-bridge.ts');

function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

console.log('============================================================');
console.log('state-bypass-silenced-regression.mjs');
console.log('Static-grep regression: retired [State Bypass] warnings stay silenced');
console.log('============================================================');

const appStateSrc = fs.readFileSync(APP_STATE_PATH, 'utf-8');
const mutationSrc = fs.readFileSync(MUTATION_PATH, 'utf-8');
const bridgeSrc = fs.readFileSync(BRIDGE_PATH, 'utf-8');
const src = `${appStateSrc}\n${mutationSrc}\n${bridgeSrc}`;

// 1. Prod proxy "sub-object mutation detected" warning must be removed
assert(!src.includes('sub-object mutation detected'),
  'Prod proxy "sub-object mutation detected" warning must stay removed from canonical state');

// 2. Deep-track dev proxy "use store .update()" warning must be removed
assert(!src.includes("' use store .update()'") && !src.includes('" use store .update()"'),
  'Deep-track dev proxy "use store .update()" warning must stay removed from canonical state');

// 3. Critical/tracked mutation ownership must still be explicit.
assert(mutationSrc.includes('CRITICAL_KEYS') && mutationSrc.includes('TRACKED_SUB_KEYS'),
  'Critical/tracked mutation key registries must be preserved');

// 4. Compatibility consumers still need bridge exports.
assert(/export\s+const\s+state\s*=\s*appState/.test(bridgeSrc),
  'State bridge must keep exposing appState as state');
assert(bridgeSrc.includes('withStateMutation'),
  'State bridge must keep re-exporting withStateMutation');

// 5. Derived compatibility fields replace legacy Proxy getters.
assert(appStateSrc.includes('semanticDiveMode = $derived') && appStateSrc.includes('focusedNode = $derived'),
  'AppState must preserve derived compatibility fields that replaced legacy Proxy getters');

console.log('  OK Prod proxy "sub-object mutation detected" warning REMOVED');
console.log('  OK Deep-track dev proxy "use store .update()" warning REMOVED');
console.log('  OK Critical/tracked mutation registries PRESERVED');
console.log('  OK State bridge compatibility exports PRESERVED');
console.log('  OK Derived compatibility fields PRESERVED');
console.log('\n============================================================');
console.log('ALL CHECKS PASSED');
console.log('============================================================');
