/**
 * share-view-clipboard-contract.mjs
 *
 * Fast Node contract test for clipboard failure seam in copyCurrentViewLink.
 *
 * Coverage:
 *   1. navigator.clipboard.writeText is wrapped in try/catch
 *   2. Catch path calls showExperienceToast (or no-throw guard) and returns null
 *   3. Success path (after writeText) shows toast and returns href string
 *   4. URL params are cleaned before building share URL (cb, lead removed)
 *   5. Function does not re-throw on clipboard failure — failure is silent to caller
 *
 * Run: node tests/share-view-clipboard-contract.mjs
 *       (from semantic-demo root)
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const CWD = process.cwd();
const URL_STATE_PATH = resolve(CWD, 'js/modules/url-state.ts');

const src = readFileSync(URL_STATE_PATH, 'utf-8');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

function assertContains(haystack, needle, label) {
  const found = haystack.includes(needle);
  assert(found, `${label}: expected source to contain "${needle}"`);
}

function assertNotContains(haystack, needle, label) {
  const found = haystack.includes(needle);
  assert(!found, `${label}: source should NOT contain "${needle}"`);
}

// ---------------------------------------------------------------------------
// TEST 1: clipboard write wrapped in try/catch, catch returns null
// ---------------------------------------------------------------------------

function testClipboardCatchPath() {
  console.log('\n[TEST] clipboard write wrapped in try/catch, catch returns null');

  // writeText is awaited and wrapped
  assertContains(src, 'await navigator.clipboard.writeText(href)',
    'navigator.clipboard.writeText call exists');

  // Catch block must handle failure gracefully
  assertContains(src, 'catch (err)',
    'copyCurrentViewLink has catch block for clipboard error');

  // Catch must show toast (not re-throw) so UI stays stable
  assertContains(src, "showExperienceToast('Copy unavailable'",
    'catch block calls showExperienceToast for Copy unavailable');

  // Catch must return null — no success value after failure
  assertContains(src, 'return null',
    'catch block returns null (not throwing)');
}

// ---------------------------------------------------------------------------
// TEST 2: success path exists and returns href string
// ---------------------------------------------------------------------------

function testSuccessPathReturnsHref() {
  console.log('\n[TEST] success path exists: shows toast and returns href string');

  // After writeText succeeds, toast shown and href returned (dead lastCopiedViewLink write removed)
  assertNotContains(src, 'state.lastCopiedViewLink',
    'success path no longer writes dead lastCopiedViewLink field');

  assertContains(src, "showExperienceToast('View link copied'",
    'success path shows View link copied toast');

  // Must return href (string), not an object or undefined
  assertContains(src, 'return href',
    'success path returns href string');
}

// ---------------------------------------------------------------------------
// TEST 3: URL param cleaning before clipboard write
// ---------------------------------------------------------------------------

function testUrlParamCleaning() {
  console.log('\n[TEST] share URL removes cb and lead params before writing');

  assertContains(src, "shareUrl.searchParams.delete('cb')",
    'cb param is deleted from share URL');
  assertContains(src, "shareUrl.searchParams.delete('lead')",
    'lead param is deleted from share URL');
}

// ---------------------------------------------------------------------------
// TEST 4: no re-throw on clipboard failure — catch uses toast+return null
// ---------------------------------------------------------------------------

function testNoRethrowOnClipboardFailure() {
  console.log('\n[TEST] clipboard catch block does not re-throw');

  // Extract the copyCurrentViewLink function body — find start and matching close brace
  const funcStart = src.indexOf('export async function copyCurrentViewLink()');
  assert(funcStart !== -1, 'copyCurrentViewLink function found');

  // Find the clipboard try block and its catch
  const writeTextPos = src.indexOf('await navigator.clipboard.writeText(href)', funcStart);
  assert(writeTextPos !== -1, 'navigator.clipboard.writeText call found');

  const clipboardTryStart = src.lastIndexOf('try {', writeTextPos);
  const clipboardCatchStart = src.indexOf('catch (err)', clipboardTryStart);
  assert(clipboardCatchStart !== -1, 'catch (err) for clipboard write found');

  // Scan forward from the catch keyword to find the opening brace
  let catchBrace = src.indexOf('{', clipboardCatchStart);
  assert(catchBrace !== -1 && catchBrace < clipboardCatchStart + 200,
    'catch block opening brace found near catch keyword');

  // Find the matching close brace using a simple scan
  let braceDepth = 1;
  let i = catchBrace + 1;
  while (i < src.length && braceDepth > 0) {
    if (src[i] === '{') braceDepth++;
    else if (src[i] === '}') braceDepth--;
    i++;
  }
  const catchEnd = i - 1;
  const catchBlock = src.slice(clipboardCatchStart, catchEnd + 1);

  assert(!/\bthrow\b/.test(catchBlock.replace(/\/\/.*$/gm, '').trim()),
    'catch block must not contain an actual throw statement (not just a comment mention)');
  assert(catchBlock.includes('return null'),
    'catch block must return null on failure');
  assert(catchBlock.includes("showExperienceToast('Copy unavailable'"),
    'catch block must show toast on failure');
}

// ---------------------------------------------------------------------------
// TEST 5: share button label reset via event-bindings.js
// ---------------------------------------------------------------------------

function testShareButtonLabelReset() {
  console.log('\n[TEST] view-bindings.js resets share button label on copy success');

  const EVB_PATH = resolve(CWD, 'js/modules/bindings/view-bindings.ts');
  const evbSrc = readFileSync(EVB_PATH, 'utf-8');

  assertContains(evbSrc, "btn.setAttribute('aria-label', 'Link copied to clipboard')",
    'view-bindings sets aria-label to Link copied to clipboard on success');
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

const tests = [
  testClipboardCatchPath,
  testSuccessPathReturnsHref,
  testUrlParamCleaning,
  testNoRethrowOnClipboardFailure,
  testShareButtonLabelReset,
];

let passed = 0;
let failed = 0;

for (const test of tests) {
  try {
    test();
    passed++;
    console.log('  PASS');
  } catch (err) {
    failed++;
    console.error(`  FAIL: ${err.message}`);
  }
}

console.log(`\nResult: ${passed}/${tests.length} passed\n`);
if (failed > 0) process.exit(1);
