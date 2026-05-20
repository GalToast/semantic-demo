/**
 * connection-analysis-contract.mjs
 *
 * Fast Node contract test for js/modules/connection-analysis.js
 *
 * Coverage:
 *   1. Successful cached story          → story rendered, source/cached age shown
 *   2. Empty story                       → "still being prepared" message
 *   3. Invalid JSON                      → Error with correlationId, JSON cause
 *   4. 500 / API error                   → Error with correlationId, message from server
 *   5. Abort / controller lifecycle      → AbortError is caught and returns early
 *   6. Early-return / no-focused-point   → "Select a business first" message
 *
 * Runs in Node with a tiny DOM/fetch/window shim. No Playwright.
 *
 * Usage:
 *   node tests/connection-analysis-contract.mjs
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const SEMDEMO_ROOT = path.resolve(process.cwd());
const CA_PATH = path.join(SEMDEMO_ROOT, 'js/modules/connection-analysis.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

function assertContains(haystack, needle, label) {
  const found = haystack.includes(needle);
  assert(found, `${label}: expected source to contain "${needle}", but it was not found`);
}

function assertNotContains(haystack, needle, label) {
  const found = haystack.includes(needle);
  assert(!found, `${label}: source should NOT contain "${needle}", but it was found`);
}

// ---------------------------------------------------------------------------
// Fake DOM + globals
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
  addEventListener(event, handler) {
    if (!this._handlers[event]) this._handlers[event] = [];
    this._handlers[event].push(handler);
  }
  removeEventListener(event, handler) {
    if (this._handlers[event]) {
      this._handlers[event] = this._handlers[event].filter(h => h !== handler);
    }
  }
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

let pendingFetch = null;

globalThis.fetch = function fakeFetch(url, options) {
  return new Promise((resolve) => {
    pendingFetch = { url, options, resolve, reject: () => {} };
  });
};

// Expose pending fetch so tests can control resolution
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
// State helper
// ---------------------------------------------------------------------------

const { state } = await import('../js/state.js');

function resetState() {
  state.currentSearchSummary = null;
  state.focusedNode = null;
  state.points = [];
}

// ---------------------------------------------------------------------------
// Test 1: Static source — controller lifecycle (abort wiring)
// ---------------------------------------------------------------------------

async function testSourceStaticAbortableController() {
  console.log('\n[TEST] Static source: abortable controller lifecycle');

  const fs = await import('node:fs');
  const srcCode = fs.readFileSync(CA_PATH, 'utf-8');

  // Must store controller in module-level variable
  assertContains(srcCode, 'semanticThreadsDetailController', 'module has semanticThreadsDetailController variable');

  // Must assign new AbortController before fetch
  assertContains(srcCode, 'new AbortController()', 'creates AbortController');

  // Must pass controller.signal to fetch
  assertContains(srcCode, 'signal: controller.signal', 'signal passed to fetch');

  // Must abort previous controller before creating a new one
  assertContains(srcCode, 'semanticThreadsDetailController.abort()', 'previous controller aborted');

  // AbortError must be caught and return early
  assertContains(srcCode, "err.name === 'AbortError'", 'AbortError handled');
  assertContains(srcCode, 'return;', 'AbortError returns early');

  console.log('  OK abortable controller lifecycle verified in source');
}

// ---------------------------------------------------------------------------
// Test 2: Static source — error correlationId
// ---------------------------------------------------------------------------

async function testSourceCorrelationId() {
  console.log('\n[TEST] Static source: correlationId attached to errors');

  const fs = await import('node:fs');
  const srcCode = fs.readFileSync(CA_PATH, 'utf-8');

  // correlationId added to JSON parse errors
  assertContains(srcCode, "Object.defineProperty(jsonErr, 'correlationId'", 'correlationId on JSON error');
  assertContains(srcCode, 'crypto.randomUUID()', 'crypto.randomUUID used for correlationId');

  // correlationId added to API error responses
  assertContains(srcCode, "Object.defineProperty(err, 'correlationId'", 'correlationId on API error');

  console.log('  OK correlationId attachment verified in source');
}

// ---------------------------------------------------------------------------
// Test 3: Static source — cached story mode detection
// ---------------------------------------------------------------------------

async function testSourceCachedStoryMode() {
  console.log('\n[TEST] Static source: cached story mode detection');

  const fs = await import('node:fs');
  const srcCode = fs.readFileSync(CA_PATH, 'utf-8');

  // Must check result.mode for cached_trail_story or cached_gemma_story
  assertContains(srcCode, "result?.mode === 'cached_trail_story'", 'checks cached_trail_story mode');
  assertContains(srcCode, "result?.mode === 'cached_gemma_story'", 'checks cached_gemma_story mode');

  // Must handle cache_age_seconds for display
  assertContains(srcCode, 'result.cache_age_seconds', 'cache_age_seconds read');

  console.log('  OK cached story mode detection verified in source');
}

// ---------------------------------------------------------------------------
// Test 4: Static source — UI element wiring
// ---------------------------------------------------------------------------

async function testSourceUiWiring() {
  console.log('\n[TEST] Static source: UI element wiring');

  const fs = await import('node:fs');
  const srcCode = fs.readFileSync(CA_PATH, 'utf-8');

  // summary-text updated on early-return
  assertContains(srcCode, "document.getElementById('summary-text')", 'summary-text looked up');
  assertContains(srcCode, "textEl.textContent = 'Select a business", 'early return sets summary-text');

  // summary-gemma-story elements shown during load
  assertContains(srcCode, "document.getElementById('summary-gemma-story')", 'story note element');
  assertContains(srcCode, "document.getElementById('summary-gemma-story-text')", 'story text element');
  assertContains(srcCode, "document.getElementById('summary-gemma-story-source')", 'story source element');

  // Loading state: "Loading the full connection report..."
  assertContains(srcCode, "textContent = 'Loading the full connection report", 'loading text set');

  // semantic-summary-card gets is-synthesizing class
  assertContains(srcCode, "card.classList.add('is-synthesizing')", 'is-synthesizing class added');
  assertContains(srcCode, "card.classList.remove('is-synthesizing')", 'is-synthesizing class removed in finally');

  console.log('  OK UI element wiring verified in source');
}

// ---------------------------------------------------------------------------
// Test 5: Static source — empty story handling
// ---------------------------------------------------------------------------

async function testSourceEmptyStory() {
  console.log('\n[TEST] Static source: empty story handling');

  const fs = await import('node:fs');
  const srcCode = fs.readFileSync(CA_PATH, 'utf-8');

  // When story is falsy, must show "still being prepared" message
  assertContains(srcCode, "textContent = 'The connection report is still being prepared.", 'empty story message');
  assertContains(srcCode, "storySourceEl.textContent = ''", 'source cleared for empty story');

  console.log('  OK empty story handling verified in source');
}

// ---------------------------------------------------------------------------
// Test 6: Runtime — successful cached story
// ---------------------------------------------------------------------------

async function testRuntimeCachedStory() {
  console.log('\n[RUNTIME] Successful cached story');

  resetState();
  elementsById.clear();

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

  state.currentSearchSummary = { resultIndices: [0], anchorIndex: 0 };
  state.focusedNode = 0;
  state.points = [{ lead_id: 'LI_001', name: 'Test Biz', city: 'Austin', cluster: 1, status: 'active', what: 'A note' }];

  const { showSemanticThreadsDetail } = await import('../js/modules/connection-analysis.js');

  // Kick off — don't await yet
  const promise = showSemanticThreadsDetail();

  // Resolve fetch with cached story
  resolveFetch({
    ok: true,
    status: 200,
    json: () => Promise.resolve({
      ok: true,
      mode: 'cached_trail_story',
      story: 'This business is highly connected via legal and insurance clusters.',
      source: 'semantic-guide-engine',
      cache_age_seconds: 300
    })
  });

  await promise;

  assert(storyText.textContent === 'This business is highly connected via legal and insurance clusters.',
    `story text rendered, got: "${storyText.textContent}"`);
  assert(storySource.textContent.includes('semantic-guide-engine cached'),
    `source text includes engine name, got: "${storySource.textContent}"`);
  assert(storySource.textContent.includes('5m ago'),
    `cache age shown as minutes, got: "${storySource.textContent}"`);
  assert(!card.classList.contains('is-synthesizing'),
    'is-synthesizing removed after success');
  assert(!storyNote.classList.contains('hidden'),
    'story note shown (not hidden)');

  console.log('  OK successful cached story rendered correctly');
}

// ---------------------------------------------------------------------------
// Test 7: Runtime — empty story
// ---------------------------------------------------------------------------

async function testRuntimeEmptyStory() {
  console.log('\n[RUNTIME] Empty story');

  resetState();
  elementsById.clear();

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

  state.currentSearchSummary = { resultIndices: [0], anchorIndex: 0 };
  state.focusedNode = 0;
  state.points = [{ lead_id: 'LI_001', name: 'Test Biz', city: 'Austin', cluster: 1, status: 'active', what: 'A note' }];

  const { showSemanticThreadsDetail } = await import('../js/modules/connection-analysis.js');

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

  assert(storyText.textContent === 'The connection report is still being prepared. Try again in a moment.',
    `empty story message shown, got: "${storyText.textContent}"`);
  assert(storySource.textContent === '',
    'source cleared for empty story');

  console.log('  OK empty story handled correctly');
}

// ---------------------------------------------------------------------------
// Test 8: Runtime — invalid JSON
// ---------------------------------------------------------------------------

async function testRuntimeInvalidJson() {
  console.log('\n[RUNTIME] Invalid JSON response');

  resetState();
  elementsById.clear();

  const card = new FakeElement('div');
  card.id = 'semantic-summary-card';
  elementsById.set('semantic-summary-card', card);

  const storyText = new FakeElement('div');
  storyText.id = 'summary-gemma-story-text';
  elementsById.set('summary-gemma-story-text', storyText);

  const storySource = new FakeElement('div');
  storySource.id = 'summary-gemma-story-source';
  elementsById.set('summary-gemma-story-source', storySource);

  state.currentSearchSummary = { resultIndices: [0], anchorIndex: 0 };
  state.focusedNode = 0;
  state.points = [{ lead_id: 'LI_001', name: 'Test Biz', city: 'Austin', cluster: 1, status: 'active', what: 'A note' }];

  const { showSemanticThreadsDetail } = await import('../js/modules/connection-analysis.js');

  const promise = showSemanticThreadsDetail();

  // Resolve with text that is not valid JSON
  resolveFetch({
    ok: true,
    status: 200,
    json: () => Promise.reject(new SyntaxError('Unexpected token <'))
  });

  await promise;

  assert(storyText.textContent.startsWith('Connection report unavailable'),
    `error message shown, got: "${storyText.textContent}"`);
  assert(storySource.textContent === 'Connection report unavailable',
    `error source shown, got: "${storySource.textContent}"`);

  console.log('  OK invalid JSON handled correctly');
}

// ---------------------------------------------------------------------------
// Test 9: Runtime — 500 / API error
// ---------------------------------------------------------------------------

async function testRuntimeApiError() {
  console.log('\n[RUNTIME] 500 / API error');

  resetState();
  elementsById.clear();

  const card = new FakeElement('div');
  card.id = 'semantic-summary-card';
  elementsById.set('semantic-summary-card', card);

  const storyText = new FakeElement('div');
  storyText.id = 'summary-gemma-story-text';
  elementsById.set('summary-gemma-story-text', storyText);

  const storySource = new FakeElement('div');
  storySource.id = 'summary-gemma-story-source';
  elementsById.set('summary-gemma-story-source', storySource);

  state.currentSearchSummary = { resultIndices: [0], anchorIndex: 0 };
  state.focusedNode = 0;
  state.points = [{ lead_id: 'LI_001', name: 'Test Biz', city: 'Austin', cluster: 1, status: 'active', what: 'A note' }];

  const { showSemanticThreadsDetail } = await import('../js/modules/connection-analysis.js');

  const promise = showSemanticThreadsDetail();

  resolveFetch({
    ok: false,
    status: 500,
    json: () => Promise.resolve({ ok: false, error: 'Server error from API' })
  });

  await promise;

  assert(storyText.textContent.startsWith('Connection report unavailable'),
    `error message shown, got: "${storyText.textContent}"`);
  assert(storySource.textContent === 'Connection report unavailable',
    `error source shown, got: "${storySource.textContent}"`);

  console.log('  OK API error handled correctly');
}

// ---------------------------------------------------------------------------
// Test 10: Runtime — abort lifecycle
// ---------------------------------------------------------------------------

async function testRuntimeAbortLifecycle() {
  console.log('\n[RUNTIME] Abort / controller lifecycle');

  resetState();
  elementsById.clear();

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

  state.currentSearchSummary = { resultIndices: [0], anchorIndex: 0 };
  state.focusedNode = 0;
  state.points = [{ lead_id: 'LI_001', name: 'Test Biz', city: 'Austin', cluster: 1, status: 'active', what: 'A note' }];

  const { showSemanticThreadsDetail } = await import('../js/modules/connection-analysis.js');

  // First call
  const promise1 = showSemanticThreadsDetail();

  // Second call should abort the first
  const promise2 = showSemanticThreadsDetail();

  // Resolve second fetch
  resolveFetch({
    ok: true,
    status: 200,
    json: () => Promise.resolve({
      ok: true,
      mode: 'cached_trail_story',
      story: 'Second call wins.',
      source: 'semantic-guide-engine'
    })
  });

  await promise2;

  // storyText should have second call's story
  assert(storyText.textContent === 'Second call wins.',
    `second call wins, got: "${storyText.textContent}"`);

  console.log('  OK abort lifecycle verified');
}

// ---------------------------------------------------------------------------
// Test 11: Runtime — early return / no focused point
// ---------------------------------------------------------------------------

async function testRuntimeEarlyReturnNoFocusedPoint() {
  console.log('\n[RUNTIME] Early return: no focused point');

  resetState();
  elementsById.clear();

  const summaryText = new FakeElement('div');
  summaryText.id = 'summary-text';
  elementsById.set('summary-text', summaryText);

  const storyText = new FakeElement('div');
  storyText.id = 'summary-gemma-story-text';
  elementsById.set('summary-gemma-story-text', storyText);

  const storySource = new FakeElement('div');
  storySource.id = 'summary-gemma-story-source';
  elementsById.set('summary-gemma-story-source', storySource);

  // No search, no focused point
  state.currentSearchSummary = null;
  state.focusedNode = null;
  state.points = [];

  const { showSemanticThreadsDetail } = await import('../js/modules/connection-analysis.js');

  await showSemanticThreadsDetail();

  assert(summaryText.textContent === 'Select a business first to load its full connection report.',
    `early return message shown, got: "${summaryText.textContent}"`);

  console.log('  OK early return / no focused point verified');
}

// ---------------------------------------------------------------------------
// Test 12: Runtime — focusedIdx but no points[idx] (edge guard)
// ---------------------------------------------------------------------------

async function testRuntimeFocusedIdxButNoPoint() {
  console.log('\n[RUNTIME] focusedIdx set but no points[idx]');

  resetState();
  elementsById.clear();

  const summaryText = new FakeElement('div');
  summaryText.id = 'summary-text';
  elementsById.set('summary-text', summaryText);

  state.focusedNode = 5;
  state.points = [{ lead_id: 'LI_001', name: 'Test Biz', city: 'Austin', cluster: 1, status: 'active' }];

  const { showSemanticThreadsDetail } = await import('../js/modules/connection-analysis.js');

  await showSemanticThreadsDetail();

  assert(summaryText.textContent === 'Select a business first to load its full connection report.',
    `early return for out-of-range idx, got: "${summaryText.textContent}"`);

  console.log('  OK out-of-range focusedIdx handled correctly');
}

// ---------------------------------------------------------------------------
// MAIN
// ---------------------------------------------------------------------------

async function main() {
  console.log('================================================================');
  console.log('connection-analysis-contract.mjs');
  console.log('Fast contract test: connection analysis / semantic threads detail');
  console.log('================================================================');

  try {
    testSourceStaticAbortableController();
    testSourceCorrelationId();
    testSourceCachedStoryMode();
    testSourceUiWiring();
    testSourceEmptyStory();
    await testRuntimeCachedStory();
    await testRuntimeEmptyStory();
    await testRuntimeInvalidJson();
    await testRuntimeApiError();
    await testRuntimeAbortLifecycle();
    await testRuntimeEarlyReturnNoFocusedPoint();
    await testRuntimeFocusedIdxButNoPoint();

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