/**
 * worker-contract.spec.mjs
 *
 * Contract test enforcing the harness worker-report standard
 * (docs/harness-standards.md).
 *
 * Reads tmp/switchboard-protocol-REPORT.md as the sample fixture and
 * asserts it contains all required sections: what was changed (file:line),
 * verification evidence, done marker.
 *
 * Exact done-marker convention: report ends with the marker line the
 * prompt requested.
 *
 * Style: plain node + assert (no framework deps), matching
 * tests/search-trail-cue-lifecycle-contract.mjs.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const CWD = process.cwd()
const REPORT_PATH = resolve(CWD, 'tmp/switchboard-protocol-REPORT.md')

function assert(condition, message) {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`)
}

function assertContains(src, needle, label) {
  assert(
    src.includes(needle),
    `${label}: expected report to contain "${needle}"`
  )
}

// ── helpers ──────────────────────────────────────────────────
function header(src, text) {
  // matches "## N. <text>" or "## <text>" at start-of-line
  const re = new RegExp('^##+\\s+' + text.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\x2'), 'm')
  assert(re.test(src), `REPORT must contain ## header: ${text}`)
}

// ── load ─────────────────────────────────────────────────────
let src
try {
  src = readFileSync(REPORT_PATH, 'utf8')
} catch (err) {
  console.error(`FATAL: could not read fixture at ${REPORT_PATH}`)
  console.error(`  ${err.code}: ${err.message}`)
  process.exit(1)
}

// ── TEST 1: Section 1 — Protocol doc coverage ────────────────
console.log('\n[TEST 1] report documents the 4 required protocol areas')
assertContains(src, 'Task vs Message',   'must document Task vs Message section')
assertContains(src, 'Finding → Handoff', 'must document Finding → Handoff Flow')
assertContains(src, 'Resource Locks',    'must document Resource Locks section')
assertContains(src, 'Inbox Discipline', 'must document Inbox Discipline section')
console.log(' PASS')

// ── TEST 2: Section 2 — file:line evidence ──────────────────
console.log('\n[TEST 2] report contains file:line citations for changed items')
assertContains(
  src,
  'docs/switchboard-protocol.md',
  'must cite the protocol doc path'
)
assertContains(
  src,
  'File: `docs/switchboard-protocol.md`',
  'must use file-reference format in evidence table'
)
assertContains(
  src,
  '| 13 |',  // line number cited in the fixture
  'must cite specific line numbers'
)
console.log(' PASS')

// ── TEST 3: Section 3 — verification evidence ────────────────
console.log('\n[TEST 3] report contains verification evidence (read + existence)')
assertContains(
  src,
  'Verified file existence',
  'must state that deliverable files were verified'
)
assertContains(
  src,
  'read',
  'must reference the read mechanism used'
)
assertContains(
  src,
  'SWITCHBOARD PROTOCOL DONE',
  'must contain the done marker'
)
console.log(' PASS')

// ── TEST 4: Done marker — exact final line ───────────────────
console.log('\n[TEST 4] report ends with the correct done marker')
const trimmed = src.trimEnd()
const lastLine = trimmed.split('\n').pop()
const expectedMarker = 'SWITCHBOARD PROTOCOL DONE'
assert(
  lastLine === expectedMarker,
  `last line must be exactly "${expectedMarker}", got: "${lastLine}"`
)
console.log(' PASS')

// ── TEST 5: Report structure — required sub-sections ─────────
console.log('\n[TEST 5] report contains all required sub-sections')

header(src, '1')
header(src, '2')
header(src, '3')
assertContains(
  src,
  '## 4.',
  'must have a section 4 (or section 4 sub-item)'
)
assertContains(
  src,
  '## 5.',
  'must have a section 5 (or section 5 sub-item)'
)
console.log(' PASS')

// ── TEST 6: No-revert / scope discipline prose ────────────────
console.log('\n[TEST 6] report asserts no files outside scope were modified')
assertContains(
  src,
  'No files',   // "No files outside the specified scope were modified"
  'must contain boundary-scope assertion'
)
console.log(' PASS')

// ── done ─────────────────────────────────────────────────────
console.log('\nworker-contract.spec.mjs passed')
