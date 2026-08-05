#!/usr/bin/env node
/**
 * gen-tasks.mjs — generate harness-ablation tasks 6..12 with automatic
 * verification (buggy FAILS, fixed PASSES). Prevents inverted-bug mistakes.
 * Run: node gen-tasks.mjs   (from tools/harness-ablation/tasks)
 */
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..', '..') // tasks dir

const TASKS = [
  {
    id: 6,
    readme: `# task-6 — Sliding window max (size 3)

**Goal:** Fix \`slidingMax3(arr)\` in \`src/task.js\` so it returns, for each index i, the max of arr[i], arr[i+1], arr[i+2] (treating out-of-range as -Infinity).

**Repro:** \`node test/test.js\` (expect FAIL)

**Expected:** \`[1,5,3]\` -> \`[5,5,3]\`; \`[1,5,3,2]\` -> \`[5,5,3,2]\`; \`[7]\` -> \`[7]\`; \`[]\` -> \`[]\`; \`[2,9,1,8,4]\` -> \`[9,9,8,8,4]\`

Bug: the loop iterates i from 0..len-2 (missing the last index's window), so the last element is dropped. Fix: loop to len-1.`,
    buggy: `// Bug: loop misses the LAST index's window (runs i < arr.length-1)
function slidingMax3(arr) {
  if (arr.length === 0) return [];
  const out = [];
  for (let i = 0; i < arr.length - 1; i++) {
    out.push(Math.max(arr[i], arr[i + 1] ?? -Infinity, arr[i + 2] ?? -Infinity));
  }
  return out;
}
module.exports = { slidingMax3 };`,
    fixed: `function slidingMax3(arr) {
  if (arr.length === 0) return [];
  const out = [];
  for (let i = 0; i < arr.length; i++) {
    out.push(Math.max(arr[i], arr[i + 1] ?? -Infinity, arr[i + 2] ?? -Infinity));
  }
  return out;
}
module.exports = { slidingMax3 };`,
    test: `const { slidingMax3 } = require('../src/task.js');
function assert(cond, msg) { if (!cond) throw new Error('ASSERT FAIL: ' + msg); }
assert(JSON.stringify(slidingMax3([1,5,3])) === JSON.stringify([5,5,3]), '3 elems');
assert(JSON.stringify(slidingMax3([1,5,3,2])) === JSON.stringify([5,5,3,2]), '4 elems');
assert(JSON.stringify(slidingMax3([7])) === JSON.stringify([7]), 'single');
assert(JSON.stringify(slidingMax3([])) === JSON.stringify([]), 'empty');
assert(JSON.stringify(slidingMax3([2,9,1,8,4])) === JSON.stringify([9,9,8,8,4]), 'mixed');
console.log('task-6 OK');`,
  },
  {
    id: 7,
    readme: `# task-7 — Wrong comparator in sort

**Goal:** Fix \`topThree(arr)\` in \`src/task.js\` so it returns the 3 LARGEST numbers (descending).

**Repro:** \`node test/test.js\` (expect FAIL)

**Expected:** \`[1,9,4,7,2]\` -> \`[9,7,4]\`; \`[5]\` -> \`[5]\`; \`[]\` -> \`[]\`; \`[3,1,2]\` -> \`[3,2,1]\`

Bug: the sort comparator is ascending (or reversed), so the largest aren't picked.`,
    buggy: `// Bug: sorts ascending, so slice(-3) returns the 3 SMALLEST... actually slice(0,3) of ascending = smallest 3
function topThree(arr) {
  const sorted = [...arr].sort((a, b) => a - b);
  return sorted.slice(0, 3);
}
module.exports = { topThree };`,
    fixed: `function topThree(arr) {
  const sorted = [...arr].sort((a, b) => b - a);
  return sorted.slice(0, 3);
}
module.exports = { topThree };`,
    test: `const { topThree } = require('../src/task.js');
function assert(cond, msg) { if (!cond) throw new Error('ASSERT FAIL: ' + msg); }
assert(JSON.stringify(topThree([1,9,4,7,2])) === JSON.stringify([9,7,4]), 'top3');
assert(JSON.stringify(topThree([5])) === JSON.stringify([5]), 'single');
assert(JSON.stringify(topThree([])) === JSON.stringify([]), 'empty');
assert(JSON.stringify(topThree([3,1,2])) === JSON.stringify([3,2,1]), '3 elems');
console.log('task-7 OK');`,
  },
  {
    id: 8,
    readme: `# task-8 — Missing null guard

**Goal:** Fix \`safeLength(x)\` in \`src/task.js\` so it returns \`0\` for \`null\`/\`undefined\` and the length for strings/arrays.

**Repro:** \`node test/test.js\` (expect FAIL)

**Expected:** \`safeLength(null)\` -> \`0\`; \`safeLength(undefined)\` -> \`0\`; \`safeLength('abc')\` -> \`3\`; \`safeLength([1,2])\` -> \`2\`

Bug: no null/undefined guard (throws TypeError).`,
    buggy: `// Bug: no null/undefined guard
function safeLength(x) {
  return x.length;
}
module.exports = { safeLength };`,
    fixed: `function safeLength(x) {
  if (x == null) return 0;
  return x.length;
}
module.exports = { safeLength };`,
    test: `const { safeLength } = require('../src/task.js');
function assert(cond, msg) { if (!cond) throw new Error('ASSERT FAIL: ' + msg); }
assert(safeLength(null) === 0, 'null');
assert(safeLength(undefined) === 0, 'undefined');
assert(safeLength('abc') === 3, 'string');
assert(safeLength([1,2]) === 2, 'array');
console.log('task-8 OK');`,
  },
  {
    id: 9,
    readme: `# task-9 — Async race / stale value

**Goal:** Fix \`fetchUser(id)\` in \`src/task.js\` so it returns the value from the LAST call, not a stale one. It's a mock: \`slow(id)\` resolves after a delay.

**Repro:** \`node test/test.js\` (expect FAIL)

**Expected:** calling \`fetchUser(1)\` then quickly \`fetchUser(2)\` (where 2 resolves faster) should yield \`2\` for the second await. The test waits for both and checks the second result is 2.

Bug: the async fn captures \`id\` in a closure but uses a shared \`current\` variable that the later call overwrites, OR resolves with a stale captured value. The fix: resolve with the call's own id (no shared mutable state).`,
    buggy: `// Bug: uses a shared mutable 'latest' so a slow earlier call can overwrite a later result
let latest = null;
function slowResolve(val, ms) {
  return new Promise((r) => setTimeout(() => r(val), ms));
}
async function fetchUser(id) {
  latest = id;
  await slowResolve(id, id === 1 ? 50 : 5);
  return latest;
}
module.exports = { fetchUser };`,
    fixed: `function slowResolve(val, ms) {
  return new Promise((r) => setTimeout(() => r(val), ms));
}
async function fetchUser(id) {
  await slowResolve(id, id === 1 ? 50 : 5);
  return id;
}
module.exports = { fetchUser };`,
    test: `const { fetchUser } = require('../src/task.js');
function assert(cond, msg) { if (!cond) throw new Error('ASSERT FAIL: ' + msg); }
async function main() {
  const p1 = fetchUser(1);
  const p2 = fetchUser(2);
  const r1 = await p1;
  const r2 = await p2;
  assert(r1 === 1, 'first call returns 1 (got ' + r1 + ')');
  assert(r2 === 2, 'second call returns 2, not stale ' + r2);
  console.log('task-9 OK');
}
main().catch((e) => { console.error(e.message); process.exit(1); });`,
  },
  {
    id: 10,
    readme: `# task-10 — Aggregation bug (sum of negatives)

**Goal:** Fix \`sumPositive(arr)\` in \`src/task.js\` so it sums ONLY positive numbers.

**Repro:** \`node test/test.js\` (expect FAIL)

**Expected:** \`[1,-2,3]\` -> \`4\`; \`[-1,-2]\` -> \`0\`; \`[0,5]\` -> \`5\`; \`[]\` -> \`0\`

Bug: it sums all numbers (or skips incorrectly).`,
    buggy: `// Bug: sums ALL numbers, including negatives
function sumPositive(arr) {
  return arr.reduce((s, x) => s + x, 0);
}
module.exports = { sumPositive };`,
    fixed: `function sumPositive(arr) {
  return arr.reduce((s, x) => (x > 0 ? s + x : s), 0);
}
module.exports = { sumPositive };`,
    test: `const { sumPositive } = require('../src/task.js');
function assert(cond, msg) { if (!cond) throw new Error('ASSERT FAIL: ' + msg); }
assert(sumPositive([1,-2,3]) === 4, 'mixed');
assert(sumPositive([-1,-2]) === 0, 'all negative');
assert(sumPositive([0,5]) === 5, 'zero + positive');
assert(sumPositive([]) === 0, 'empty');
console.log('task-10 OK');`,
  },
  {
    id: 11,
    readme: `# task-11 — Closure capture in loop

**Goal:** Fix \`makeCounters(n)\` in \`src/task.js\` so it returns an array of n functions where the i-th function returns i (not n).

**Repro:** \`node test/test.js\` (expect FAIL)

**Expected:** \`makeCounters(3)\` -> each fn returns its index: [0,1,2].

Bug: \`var\` (or \`let\` in a closure capture) shares the loop variable, so all fns return the final value. Fix: capture per-iteration (block-scoped or IIFE).`,
    buggy: `// Bug: var i is shared across closures, all return n
function makeCounters(n) {
  const fns = [];
  for (var i = 0; i < n; i++) {
    fns.push(function () { return i; });
  }
  return fns;
}
module.exports = { makeCounters };`,
    fixed: `function makeCounters(n) {
  const fns = [];
  for (let i = 0; i < n; i++) {
    fns.push(function () { return i; });
  }
  return fns;
}
module.exports = { makeCounters };`,
    test: `const { makeCounters } = require('../src/task.js');
function assert(cond, msg) { if (!cond) throw new Error('ASSERT FAIL: ' + msg); }
const fns = makeCounters(3);
assert(fns[0]() === 0, 'fn0 returns 0 (got ' + fns[0]() + ')');
assert(fns[1]() === 1, 'fn1 returns 1');
assert(fns[2]() === 2, 'fn2 returns 2');
console.log('task-11 OK');`,
  },
  {
    id: 12,
    readme: `# task-12 — Rounding bug

**Goal:** Fix \`round2(x)\` in \`src/task.js\` so it rounds to 2 decimal places correctly.

**Repro:** \`node test/test.js\` (expect FAIL)

**Expected:** \`round2(1.005)\` -> \`1.01\` (banker's not needed; standard rounding); \`round2(2.5)\` -> \`2.5\`; \`round2(0.1+0.2)\` -> \`0.3\`; \`round2(-1.005)\` -> \`-1.01\` (optional; test only positive)

Bug: naive \`Math.round(x*100)/100\` fails for \`1.005\` (gives \`1\` due to float repr). Fix: add epsilon or use toFixed carefully (but toFixed has its own quirks — prefer \`Math.round((x + Number.EPSILON) * 100) / 100\`).`,
    buggy: `// Bug: naive *100 rounding fails on float repr (1.005 -> 1)
function round2(x) {
  return Math.round(x * 100) / 100;
}
module.exports = { round2 };`,
    fixed: `function round2(x) {
  return Math.round((x + Number.EPSILON) * 100) / 100;
}
module.exports = { round2 };`,
    test: `const { round2 } = require('../src/task.js');
function assert(cond, msg) { if (!cond) throw new Error('ASSERT FAIL: ' + msg); }
assert(Math.abs(round2(1.005) - 1.01) < 1e-9, '1.005 -> 1.01 (got ' + round2(1.005) + ')');
assert(Math.abs(round2(2.5) - 2.5) < 1e-9, '2.5');
assert(Math.abs(round2(0.1 + 0.2) - 0.3) < 1e-9, '0.1+0.2 -> 0.3');
assert(Math.abs(round2(3.14159) - 3.14) < 1e-9, 'pi -> 3.14');
console.log('task-12 OK');`,
  },
]

function verify(task) {
  const dir = join(ROOT, `task-${task.id}`)
  const tmp = join(ROOT, `.tmp-gen-${task.id}`)
  rmSync(tmp, { recursive: true, force: true })
  mkdirSync(tmp, { recursive: true })
  writeFileSync(join(tmp, 'package.json'), JSON.stringify({ type: 'commonjs' }))

  // buggy must FAIL
  mkdirSync(join(tmp, 'src'), { recursive: true })
  mkdirSync(join(tmp, 'test'), { recursive: true })
  writeFileSync(join(tmp, 'src', 'task.js'), task.buggy)
  writeFileSync(join(tmp, 'test', 'test.js'), task.test)
  let buggyFails = false
  try {
    execFileSync(process.execPath, [join(tmp, 'test', 'test.js')], { cwd: tmp, stdio: 'pipe', timeout: 8000 })
  } catch { buggyFails = true }

  // fixed must PASS
  writeFileSync(join(tmp, 'src', 'task.js'), task.fixed)
  let fixedPasses = false
  try {
    execFileSync(process.execPath, [join(tmp, 'test', 'test.js')], { cwd: tmp, stdio: 'pipe', timeout: 8000 })
    fixedPasses = true
  } catch { /* no */ }
  rmSync(tmp, { recursive: true, force: true })
  return { buggyFails, fixedPasses }
}

let ok = true
for (const t of TASKS) {
  const v = verify(t)
  const pass = v.buggyFails && v.fixedPasses
  if (!pass) ok = false
  console.log(`task-${t.id}: buggyFails=${v.buggyFails} fixedPasses=${v.fixedPasses} => ${pass ? 'OK' : 'INVERTED/BROKEN'}`)
  if (pass) {
    const dir = join(ROOT, `task-${t.id}`)
    rmSync(dir, { recursive: true, force: true })
    mkdirSync(dir, { recursive: true })
    mkdirSync(join(dir, 'src'), { recursive: true })
    mkdirSync(join(dir, 'test'), { recursive: true })
    writeFileSync(join(dir, 'src', 'task.js'), t.buggy)
    writeFileSync(join(dir, 'test', 'test.js'), t.test)
    writeFileSync(join(dir, 'README.md'), t.readme)
  }
}
console.log(ok ? '\nALL TASKS VERIFIED + WRITTEN' : '\nSOME TASKS FAILED — not written')
process.exit(ok ? 0 : 1)
