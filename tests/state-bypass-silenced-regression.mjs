/**
 * state-bypass-silenced-regression.mjs
 *
 * Regression test for silencing the 7 false-positive [State Bypass] warnings.
 *
 * Bug: js/state.ts emitted two distinct [State Bypass] warnings that fired
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
 * Fix (2026-06-12, this commit): Silenced both warnings. Kept the prod proxy
 *      throw-error path for CRITICAL_KEYS (line ~1057) and the top-level
 *      wholesale-reassignment warning (line ~1096) — these are the real
 *      diagnostic signals.
 *
 * Verification: this static-grep test confirms both warning emissions are
 * removed. The contract suite (308+ pass) verifies nothing else broke.
 *
 * Run: node tests/state-bypass-silenced-regression.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATE_TS_PATH = path.join(__dirname, '..', 'js', 'state.ts');

function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

console.log('============================================================');
console.log('state-bypass-silenced-regression.mjs');
console.log('Static-grep regression: [State Bypass] warnings silenced');
console.log('============================================================');

const src = fs.readFileSync(STATE_TS_PATH, 'utf-8');

// 1. Prod proxy "sub-object mutation detected" warning must be removed
assert(!src.includes('sub-object mutation detected'),
  'Prod proxy "sub-object mutation detected" warning must be REMOVED from js/state.ts');

// 2. Deep-track dev proxy "use store .update()" warning must be removed
assert(!src.includes("' use store .update()'") && !src.includes('" use store .update()"'),
  'Deep-track dev proxy "use store .update()" warning must be REMOVED from js/state.ts');

// 3. The prod proxy throw-error path for CRITICAL_KEYS must STILL be present
assert(src.includes("Illegal direct mutation of critical sub-property"),
  'Prod proxy throw-error path for CRITICAL_KEYS must be PRESERVED');

// 4. The top-level wholesale-reassignment warning must STILL be present
assert(src.includes('wholesale reassignment detected'),
  'Top-level wholesale-reassignment warning must be PRESERVED');

// 5. The prod proxy sub-object branch should have a comment explaining why
//    the warning was silenced (so future maintainers understand the intent)
assert(src.includes('Soft warning silenced 2026-06-12') ||
       src.includes('dev-only noise'),
  'Silenced warnings should have explanatory comments for future maintainers');

console.log('  OK Prod proxy "sub-object mutation detected" warning REMOVED');
console.log('  OK Deep-track dev proxy "use store .update()" warning REMOVED');
console.log('  OK Prod proxy throw-error for CRITICAL_KEYS PRESERVED');
console.log('  OK Top-level wholesale-reassignment warning PRESERVED');
console.log('  OK Explanatory comments present for future maintainers');
console.log('\n============================================================');
console.log('ALL CHECKS PASSED');
console.log('============================================================');
