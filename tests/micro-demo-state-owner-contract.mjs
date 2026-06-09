/**
 * micro-demo-state-owner-contract.mjs
 *
 * Enforces that micro-demo.js routes all exploration focus/trail state writes
 * through named orchestration helpers __demoReset and __demoFocusSetup.
 *
 * Direct writes to state.focusedNode, state.selectedPoint, state.navState.*,
 * state.focusCameraAssistActive, state.focusCameraOffset, state.focusTransitionMode,
 * and document.body.dataset.focusTransition / focusTransitionPhase from any other
 * function are a contract violation.
 *
 * Run from semantic-demo root:
 *   node tests/micro-demo-state-owner-contract.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { resolveSource } from './source-path.mjs';

const ROOT = process.cwd();
const microDemoSource = fs.readFileSync(resolveSource('js/modules/micro-demo.ts', ROOT), 'utf8');

let passed = 0;
let failed = 0;

function ok(message) {
  console.log(`  ok ${message}`);
  passed += 1;
}

function fail(message, detail) {
  console.log(`  FAIL ${message}`);
  if (detail) console.log(`        ${detail}`);
  failed += 1;
}

function test(message, fn) {
  try {
    fn();
    ok(message);
  } catch (error) {
    fail(message, error.message);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

console.log('=== Running Micro-Demo State Ownership Contract Checks ===');

// --- Helper: find all function bodies in source ---
// Extracts function name -> body text map
function extractFunctionBodies(source) {
  const bodies = {};
  // Match `function name(...) { ... }` (non-greedy, handles inner braces)
  const funcRegex = /function\s+(\w+)\s*\([^)]*\)\s*\{/g;
  let match;
  while ((match = funcRegex.exec(source)) !== null) {
    const name = match[1];
    const start = match.index + match[0].length;
    let braceCount = 1;
    let end = start;
    while (braceCount > 0 && end < source.length) {
      if (source[end] === '{') braceCount++;
      else if (source[end] === '}') braceCount--;
      end++;
    }
    bodies[name] = source.slice(start, end - 1);
  }
  return bodies;
}

const funcBodies = extractFunctionBodies(microDemoSource);

// --- Contract 1: __demoReset exists and is called by _resetAppState ---
test('__demoReset exists and is called by _resetAppState', () => {
  assert('__demoReset' in funcBodies, '__demoReset must be defined');
  assert(funcBodies._resetAppState?.includes('__demoReset'), '_resetAppState must call __demoReset()');
});

// --- Contract 2: __demoFocusSetup exists and is called from the T=2400ms timer ---
test('__demoFocusSetup exists and is called from the T=2400ms timer block', () => {
  assert('__demoFocusSetup' in funcBodies, '__demoFocusSetup must be defined');
  // Verify T=2400ms timer block calls __demoFocusSetup
  // Use multiline comment + first __demoFocusSetup call after it as anchor
  const t2400Idx = microDemoSource.indexOf('// T = 2400ms:');
  assert(t2400Idx >= 0, 'T=2400ms comment must be present');
  const afterComment = microDemoSource.slice(t2400Idx, t2400Idx + 500);
  assert(afterComment.includes('__demoFocusSetup(demoNode)'), 'T=2400ms block must call __demoFocusSetup(demoNode)');
});

// --- Contract 3: __demoReset clears focusedNode, selectedPoint, navState fields ---
test('__demoReset resets selectedPoint, derived focus index, navState.mode, and trail/walk fields', () => {
  const body = funcBodies.__demoReset;
  assert(body, '__demoReset body must exist');
  assert(/\bselectedPoint\s*=\s*null\b/.test(body), '__demoReset must reset selectedPoint = null');
  assert(/\bnavState\.mode\s*=\s*['"]overview['"]/.test(body), '__demoReset must set navState.mode = "overview"');
  assert(/\bnavState\.focusedIndex\s*=\s*null\b/.test(body), '__demoReset must reset focusedIndex = null');
  assert(/\bnavState\.walkHistoryIndices\s*=\s*\[\]/.test(body), '__demoReset must reset walkHistoryIndices = []');
  assert(/\bnavState\.trailCursor\s*=\s*-1\b/.test(body), '__demoReset must reset trailCursor = -1');
  assert(/\bfocusCameraAssistActive\s*=\s*false\b/.test(body), '__demoReset must reset focusCameraAssistActive = false');
  assert(/\bfocusTransitionMode\s*=\s*['"]idle['"]/.test(body), '__demoReset must reset focusTransitionMode = "idle"');
});

// --- Contract 4: __demoFocusSetup sets focusedNode, selectedPoint, navState fields ---
test('__demoFocusSetup sets selectedPoint, derived focus index, navState.mode, focusedIndex, walkHistoryIndices', () => {
  const body = funcBodies.__demoFocusSetup;
  assert(body, '__demoFocusSetup body must exist');
  assert(/\bselectedPoint\s*=\s*point\b/.test(body), '__demoFocusSetup must set selectedPoint = point');
  assert(/\bnavState\.mode\s*=\s*['"]focus['"]/.test(body), '__demoFocusSetup must set navState.mode = "focus"');
  assert(/\bnavState\.focusedIndex\s*=\s*demoNode\b/.test(body), '__demoFocusSetup must set focusedIndex = demoNode');
  assert(/\bnavState\.walkHistoryIndices\s*=\s*\[\s*demoNode\s*\]/.test(body), '__demoFocusSetup must set walkHistoryIndices = [demoNode]');
});

// --- Contract 5: No other function writes to state.focusedNode ---
test('no function other than __demoReset and __demoFocusSetup writes to state.focusedNode', () => {
  const writeFocusedNode = (body) => /\bfocusedNode\s*=[^=]/.test(body);
  const illegalWriters = Object.keys(funcBodies).filter(name =>
    name !== '__demoReset' &&
    name !== '__demoFocusSetup' &&
    writeFocusedNode(funcBodies[name])
  );
  if (illegalWriters.length > 0) {
    throw new Error(`Illegal focusedNode writes in: ${illegalWriters.join(', ')}`);
  }
});

// --- Contract 6: No other function writes to state.selectedPoint ---
test('no function other than __demoReset and __demoFocusSetup writes to state.selectedPoint', () => {
  const writeSelectedPoint = (body) => /\bselectedPoint\s*=[^=]/.test(body);
  const illegalWriters = Object.keys(funcBodies).filter(name =>
    name !== '__demoReset' &&
    name !== '__demoFocusSetup' &&
    writeSelectedPoint(funcBodies[name])
  );
  if (illegalWriters.length > 0) {
    throw new Error(`Illegal selectedPoint writes in: ${illegalWriters.join(', ')}`);
  }
});

// --- Contract 7: No other function writes to navState.mode ---
test('no function other than __demoReset and __demoFocusSetup writes to state.navState.mode', () => {
  const writeNavMode = (body) => /\bnavState\.mode\s*=[^=]/.test(body);
  const illegalWriters = Object.keys(funcBodies).filter(name =>
    name !== '__demoReset' &&
    name !== '__demoFocusSetup' &&
    writeNavMode(funcBodies[name])
  );
  if (illegalWriters.length > 0) {
    throw new Error(`Illegal navState.mode writes in: ${illegalWriters.join(', ')}`);
  }
});

// --- Contract 8: No other function writes to navState.trailCursor, trailSeedIndex, or trailNeighborIndices ---
test('no function other than __demoReset writes to trail state fields', () => {
  const writeTrail = (body) => /\bnavState\.(trailCursor|trailSeedIndex|trailNeighborIndices)\s*=[^=]/.test(body);
  const illegalWriters = Object.keys(funcBodies).filter(name =>
    name !== '__demoReset' &&
    writeTrail(funcBodies[name])
  );
  if (illegalWriters.length > 0) {
    throw new Error(`Illegal trail state writes in: ${illegalWriters.join(', ')}`);
  }
});

// --- Contract 9: No other function writes to state.focusCameraAssistActive, focusCameraOffset, focusTransitionMode ---
test('no function other than __demoReset writes to focusCameraAssistActive, focusCameraOffset, focusTransitionMode', () => {
  const writeFocusCamera = (body) =>
    /\bfocusCameraAssistActive\s*=[^=]/.test(body) ||
    /\bfocusCameraOffset\s*=[^=]/.test(body) ||
    /\bfocusTransitionMode\s*=[^=]/.test(body);
  const illegalWriters = Object.keys(funcBodies).filter(name =>
    name !== '__demoReset' &&
    writeFocusCamera(funcBodies[name])
  );
  if (illegalWriters.length > 0) {
    throw new Error(`Illegal focusCamera state writes in: ${illegalWriters.join(', ')}`);
  }
});

// --- Contract 10: No other function writes to document.body.dataset.focusTransition or focusTransitionPhase ---
test('no function other than __demoReset writes to document.body.dataset.focusTransition or focusTransitionPhase', () => {
  const writeFocusDataset = (body) =>
    /document\.body\.dataset\.focusTransition\s*=[^=]/.test(body) ||
    /document\.body\.dataset\.focusTransitionPhase\s*=[^=]/.test(body);
  const illegalWriters = Object.keys(funcBodies).filter(name =>
    name !== '__demoReset' &&
    writeFocusDataset(funcBodies[name])
  );
  if (illegalWriters.length > 0) {
    throw new Error(`Illegal focusTransition dataset writes in: ${illegalWriters.join(', ')}`);
  }
});

// --- Contract 11: __demoReset and __demoFocusSetup are the only functions that write navState.focusedIndex ---
test('no function other than __demoReset and __demoFocusSetup writes to navState.focusedIndex', () => {
  const writeFocusedIndex = (body) => /\bnavState\.focusedIndex\s*=[^=]/.test(body);
  const illegalWriters = Object.keys(funcBodies).filter(name =>
    name !== '__demoReset' &&
    name !== '__demoFocusSetup' &&
    writeFocusedIndex(funcBodies[name])
  );
  if (illegalWriters.length > 0) {
    throw new Error(`Illegal focusedIndex writes in: ${illegalWriters.join(', ')}`);
  }
});

// --- Contract 12: __demoReset and __demoFocusSetup are the only functions that write navState.walkHistoryIndices ---
test('no function other than __demoReset and __demoFocusSetup writes to navState.walkHistoryIndices', () => {
  const writeWalkHistory = (body) => /\bnavState\.walkHistoryIndices\s*=[^=]/.test(body);
  const illegalWriters = Object.keys(funcBodies).filter(name =>
    name !== '__demoReset' &&
    name !== '__demoFocusSetup' &&
    writeWalkHistory(funcBodies[name])
  );
  if (illegalWriters.length > 0) {
    throw new Error(`Illegal walkHistoryIndices writes in: ${illegalWriters.join(', ')}`);
  }
});

// --- Contract 13: __demoFocusSetup calls applyLocalNeighborhoodFocus ---
test('__demoFocusSetup calls applyLocalNeighborhoodFocus(demoNode)', () => {
  const body = funcBodies.__demoFocusSetup;
  assert(/\bapplyLocalNeighborhoodFocus\s*\(\s*demoNode\s*\)/.test(body), '__demoFocusSetup must call applyLocalNeighborhoodFocus(demoNode)');
});

console.log(`\n${'-'.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log(`${'-'.repeat(50)}\n`);

process.exit(failed > 0 ? 1 : 0);
