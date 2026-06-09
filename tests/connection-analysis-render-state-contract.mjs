/**
 * connection-analysis-render-state-contract.mjs
 *
 * Focused render/state contract for connection-analysis.js via adapter seam.
 *
 * Verifies the external render/state behavior — DOM side-effects, state snapshot
 * fidelity, and abort-driven state cleanup — without importing the module directly.
 *
 * Runs in Node with a tiny DOM/fetch/window shim. No Playwright, no live network.
 *
 * Cases covered:
 *   1. Successful cached story        → correct text + source + cache-age in DOM
 *   2. Empty story                   → "still being prepared" + cleared source
 *   3. Invalid JSON                  → error message + "unavailable" source
 *   4. HTTP 500                      → error message + "unavailable" source
 *   5. Abort                         → state cleaned up, no DOM corruption
 *
 * Usage:
 *   node tests/connection-analysis-render-state-contract.mjs
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const SEMDEMO_ROOT = path.resolve(process.cwd());

// ---------------------------------------------------------------------------
// Assertions
// ---------------------------------------------------------------------------

function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`ASSERTION FAILED: ${label}: expected "${expected}", got "${actual}"`);
  }
}

function assertStartsWith(actual, prefix, label) {
  if (!actual.startsWith(prefix)) {
    throw new Error(`ASSERTION FAILED: ${label}: expected to start with "${prefix}", got "${actual}"`);
  }
}

function assertContains(haystack, needle, label) {
  if (!haystack.includes(needle)) {
    throw new Error(`ASSERTION FAILED: ${label}: expected "${needle}" in "${haystack}"`);
  }
}

function assertNotContains(haystack, needle, label) {
  if (haystack.includes(needle)) {
    throw new Error(`ASSERTION FAILED: ${label}: expected NOT to contain "${needle}", got "${haystack}"`);
  }
}

// ---------------------------------------------------------------------------
// Fake DOM
// ---------------------------------------------------------------------------

class FakeClassList {
  constructor() { this._items = new Set(); }
  add(k)           { this._items.add(String(k)); }
  remove(k)        { this._items.delete(String(k)); }
  contains(k)      { return this._items.has(String(k)); }
  toggle(k, force) {
    const on = force !== undefined ? force : !this._items.has(String(k));
    on ? this._items.add(String(k)) : this._items.delete(String(k));
    return on;
  }
}

class FakeAttrMap extends Map {
  get(k)      { return super.get(String(k)) ?? null; }
  set(k, v)   { super.set(String(k), String(v)); }
}

class FakeElement {
  constructor(tag = 'div') {
    this.tagName   = tag.toUpperCase();
    this.classList = new FakeClassList();
    this.dataset   = {};
    this._attr     = new FakeAttrMap();
    this._text     = '';
    this._handlers = {};
  }
  get textContent()    { return this._text; }
  set textContent(v)   { this._text = String(v); }
  setAttribute(k, v)  { this._attr.set(String(k), String(v)); }
  getAttribute(k)     { return this._attr.get(String(k)) ?? null; }
  removeAttribute(k)  { this._attr.delete(String(k)); }
  addEventListener()  {}
  removeEventListener() {}
}

const elementsById = new Map();

const fakeDoc = {
  body: new FakeElement('body'),
  getElementById: (id) => elementsById.get(id) || null,
  querySelectorAll: () => [],
};

globalThis.document = fakeDoc;

let _uuid = 0;
Object.defineProperty(globalThis, 'crypto', {
  value: { randomUUID: () => `fake-uuid-${++_uuid}` },
  configurable: true,
  writable: true,
});

// ---------------------------------------------------------------------------
// Fake fetch — controllable resolution
// ---------------------------------------------------------------------------

let pendingFetch = null;

globalThis.fetch = function fakeFetch(url, options) {
  return new Promise((resolve) => {
    pendingFetch = { url, options, resolve, reject: () => {} };
  });
};

function resolveFetch(response) {
  if (!pendingFetch) throw new Error('No pending fetch to resolve');
  const { resolve } = pendingFetch;
  pendingFetch = null;
  resolve(response);
}

function rejectFetch(reason) {
  if (!pendingFetch) throw new Error('No pending fetch to reject');
  const { reject } = pendingFetch;
  pendingFetch = null;
  reject(reason);
}

// ---------------------------------------------------------------------------
// State + adapter import
// ---------------------------------------------------------------------------

const { state } = await import('../js/state.ts');
const {
  getConnectionStateSnapshot,
} = await import('../js/modules/connection-analysis-adapter.ts');

function resetState() {
  state.currentSearchSummary = null;
  state.focusedNode = null;
  state.points = [];
  elementsById.clear();
}

function setupDOM() {
  const card = new FakeElement('div');
  card.id = 'semantic-summary-card';
  elementsById.set('semantic-summary-card', card);

  const storyNote = new FakeElement('div');
  storyNote.id = 'summary-gemma-story';
  elementsById.set('summary-gemma-story', storyNote);

  const storyText = new FakeElement('div');
  storyText.id = 'summary-gemma-story-text';
  elementsById.set('summary-gemma-story-text', storyText);

  const storySource = new FakeElement('div');
  storySource.id = 'summary-gemma-story-source';
  elementsById.set('summary-gemma-story-source', storySource);

  return { card, storyNote, storyText, storySource };
}

// ---------------------------------------------------------------------------
// Test 1: Adapter getConnectionStateSnapshot fidelity
// ---------------------------------------------------------------------------

async function testAdapterStateSnapshot() {
  console.log('\n[ADAPTER] getConnectionStateSnapshot fidelity');

  resetState();

  state.focusedNode = 3;
  state.points = [
    { lead_id: 'LI_001', name: 'Biz A' },
    { lead_id: 'LI_002', name: 'Biz B' },
    { lead_id: 'LI_003', name: 'Biz C' },
    { lead_id: 'LI_004', name: 'Biz D' },
  ];
  state.currentSearchSummary = { resultIndices: [3], anchorIndex: 3 };

  const snap = getConnectionStateSnapshot();

  assertEqual(snap.focusedNode, 3, 'focusedNode in snapshot');
  assertEqual(snap.points, state.points, 'points reference in snapshot');
  assertEqual(snap.currentSearchSummary, state.currentSearchSummary, 'currentSearchSummary in snapshot');

  // Mutation of state is reflected in snapshot (same reference)
  state.focusedNode = 1;
  const snap2 = getConnectionStateSnapshot();
  assertEqual(snap2.focusedNode, 1, 'snapshot reflects state mutation');

  console.log('  OK adapter state snapshot fidelity verified');
}

// ---------------------------------------------------------------------------
// Test 2: Successful cached story — DOM render correctness
// ---------------------------------------------------------------------------

async function testCachedStoryDOMRender() {
  console.log('\n[RENDER] Successful cached story — DOM output');

  resetState();
  const { card, storyNote, storyText, storySource } = setupDOM();

  state.currentSearchSummary = { resultIndices: [0], anchorIndex: 0 };
  state.focusedNode = 0;
  state.points = [{ lead_id: 'LI_001', name: 'Test Biz', city: 'Austin', cluster: 1, status: 'active', what: 'A note' }];

  const { showSemanticThreadsDetail } = await import('../js/modules/connection-analysis.ts');

  const promise = showSemanticThreadsDetail();

  resolveFetch({
    ok: true,
    status: 200,
    json: () => Promise.resolve({
      ok: true,
      mode: 'cached_trail_story',
      story: 'This business connects to 12 others through legal and insurance clusters.',
      source: 'semantic-guide-engine',
      cache_age_seconds: 7200  // 2 hours
    })
  });

  await promise;

  assertEqual(
    storyText.textContent,
    'This business connects to 12 others through legal and insurance clusters.',
    'story text rendered'
  );
  assertContains(storySource.textContent, 'semantic-guide-engine', 'source text includes engine name');
  assertContains(storySource.textContent, 'cached', 'source text includes "cached"');
  assertContains(storySource.textContent, '2h ago', 'cache age shown in hours');
  assert(!card.classList.contains('is-synthesizing'), 'is-synthesizing removed after success');
  assert(!storyNote.classList.contains('hidden'), 'story note visible (not hidden)');
  assertEqual(storyNote.getAttribute('aria-hidden'), 'false', 'story note aria-hidden=false');

  console.log('  OK cached story DOM render verified');
}

// ---------------------------------------------------------------------------
// Test 3: Empty story — "still being prepared" render
// ---------------------------------------------------------------------------

async function testEmptyStoryRender() {
  console.log('\n[RENDER] Empty story — "still being prepared" render');

  resetState();
  const { card, storyText, storySource } = setupDOM();

  state.currentSearchSummary = { resultIndices: [0], anchorIndex: 0 };
  state.focusedNode = 0;
  state.points = [{ lead_id: 'LI_001', name: 'Test Biz', city: 'Austin', cluster: 1, status: 'active', what: 'A note' }];

  const { showSemanticThreadsDetail } = await import('../js/modules/connection-analysis.ts');

  const promise = showSemanticThreadsDetail();

  resolveFetch({
    ok: true,
    status: 200,
    json: () => Promise.resolve({
      ok: true,
      mode: 'cached_trail_story',
      story: '',
      source: 'semantic-guide-engine'
    })
  });

  await promise;

  assertEqual(
    storyText.textContent,
    'The connection report is still being prepared. Try again in a moment.',
    'empty story message shown'
  );
  assertEqual(storySource.textContent, '', 'source cleared for empty story');
  assert(!card.classList.contains('is-synthesizing'), 'is-synthesizing removed for empty story');

  console.log('  OK empty story render verified');
}

// ---------------------------------------------------------------------------
// Test 4: Invalid JSON — error render
// ---------------------------------------------------------------------------

async function testInvalidJsonRender() {
  console.log('\n[RENDER] Invalid JSON — error message render');

  resetState();
  const { card, storyText, storySource } = setupDOM();

  state.currentSearchSummary = { resultIndices: [0], anchorIndex: 0 };
  state.focusedNode = 0;
  state.points = [{ lead_id: 'LI_001', name: 'Test Biz', city: 'Austin', cluster: 1, status: 'active', what: 'A note' }];

  const { showSemanticThreadsDetail } = await import('../js/modules/connection-analysis.ts');

  const promise = showSemanticThreadsDetail();

  resolveFetch({
    ok: true,
    status: 200,
    json: () => Promise.reject(new SyntaxError('Unexpected token <'))
  });

  await promise;

  assertStartsWith(storyText.textContent, 'Connection report unavailable:', 'error prefix shown for invalid JSON');
  assertEqual(storySource.textContent, 'Connection report unavailable', 'error source shown');
  assert(!card.classList.contains('is-synthesizing'), 'is-synthesizing removed after error');

  console.log('  OK invalid JSON render verified');
}

// ---------------------------------------------------------------------------
// Test 5: HTTP 500 — error render
// ---------------------------------------------------------------------------

async function testHttp500Render() {
  console.log('\n[RENDER] HTTP 500 — error message render');

  resetState();
  const { card, storyText, storySource } = setupDOM();

  state.currentSearchSummary = { resultIndices: [0], anchorIndex: 0 };
  state.focusedNode = 0;
  state.points = [{ lead_id: 'LI_001', name: 'Test Biz', city: 'Austin', cluster: 1, status: 'active', what: 'A note' }];

  const { showSemanticThreadsDetail } = await import('../js/modules/connection-analysis.ts');

  const promise = showSemanticThreadsDetail();

  resolveFetch({
    ok: false,
    status: 500,
    json: () => Promise.resolve({ ok: false, error: 'Internal server error from API' })
  });

  await promise;

  assertStartsWith(storyText.textContent, 'Connection report unavailable:', 'error prefix shown for 500');
  assert(storyText.textContent.includes('Internal server error from API'), 'server error message included');
  assertEqual(storySource.textContent, 'Connection report unavailable', 'error source shown');
  assert(!card.classList.contains('is-synthesizing'), 'is-synthesizing removed after 500');

  console.log('  OK HTTP 500 render verified');
}

// ---------------------------------------------------------------------------
// Test 6: Abort — state cleanup and no DOM corruption
// ---------------------------------------------------------------------------

async function testAbortStateCleanup() {
  console.log('\n[RENDER] Abort — state cleanup and no DOM corruption');

  resetState();
  const { card, storyText, storySource } = setupDOM();

  state.currentSearchSummary = { resultIndices: [0], anchorIndex: 0 };
  state.focusedNode = 0;
  state.points = [{ lead_id: 'LI_001', name: 'Test Biz', city: 'Austin', cluster: 1, status: 'active', what: 'A note' }];

  const { showSemanticThreadsDetail } = await import('../js/modules/connection-analysis.ts');

  // First call — will be aborted
  const promise1 = showSemanticThreadsDetail();

  // Immediately fire second call, aborting the first
  const promise2 = showSemanticThreadsDetail();

  // Resolve second fetch with a story
  resolveFetch({
    ok: true,
    status: 200,
    json: () => Promise.resolve({
      ok: true,
      mode: 'cached_trail_story',
      story: 'Second call succeeded.',
      source: 'semantic-guide-engine'
    })
  });

  await promise2;

  // Second call's story should be rendered — first call's loading state must not leak
  assertEqual(storyText.textContent, 'Second call succeeded.', 'second call rendered, first aborted');
  assertEqual(storySource.textContent, 'semantic-guide-engine', 'source from second call');
  assert(!card.classList.contains('is-synthesizing'), 'is-synthesizing removed after success');

  console.log('  OK abort state cleanup verified');
}

// ---------------------------------------------------------------------------
// Test 7: Cached gemma story mode (variant of cached_trail_story)
// ---------------------------------------------------------------------------

async function testCachedGemmaStoryRender() {
  console.log('\n[RENDER] Cached gemma story mode variant');

  resetState();
  const { storyText, storySource } = setupDOM();

  state.currentSearchSummary = { resultIndices: [0], anchorIndex: 0 };
  state.focusedNode = 0;
  state.points = [{ lead_id: 'LI_001', name: 'Test Biz', city: 'Austin', cluster: 1, status: 'active', what: 'A note' }];

  const { showSemanticThreadsDetail } = await import('../js/modules/connection-analysis.ts');

  const promise = showSemanticThreadsDetail();

  resolveFetch({
    ok: true,
    status: 200,
    json: () => Promise.resolve({
      ok: true,
      mode: 'cached_gemma_story',
      story: 'Gemma-generated narrative about business connections.',
      source: 'gemma-engine',
      cache_age_seconds: 300
    })
  });

  await promise;

  assertEqual(storyText.textContent, 'Gemma-generated narrative about business connections.', 'gemma story rendered');
  assertContains(storySource.textContent, 'gemma-engine', 'gemma engine source shown');
  assertContains(storySource.textContent, '5m ago', 'cache age in minutes');

  console.log('  OK cached gemma story render verified');
}

// ---------------------------------------------------------------------------
// MAIN
// ---------------------------------------------------------------------------

async function main() {
  console.log('================================================================');
  console.log('connection-analysis-render-state-contract.mjs');
  console.log('Render/state contract: connection-analysis via adapter seam');
  console.log('================================================================');

  try {
    await testAdapterStateSnapshot();
    await testCachedStoryDOMRender();
    await testEmptyStoryRender();
    await testInvalidJsonRender();
    await testHttp500Render();
    await testAbortStateCleanup();
    await testCachedGemmaStoryRender();

    console.log('\n================================================================');
    console.log('ALL TESTS PASSED');
    console.log('================================================================');
    process.exit(0);
  } catch (err) {
    console.error('\nTEST FAILED:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

main();
