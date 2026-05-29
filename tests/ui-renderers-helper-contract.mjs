import './helpers/node-window-shim.mjs';

/**
 * Contract: selected-business narrative helpers live in ui-renderers.
 *
 * Source-only and Node-safe. Proves helper behavior and verifies lifecycle
 * imports helper owners directly instead of exposing lifecycle window aliases.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { state } from '../js/state.js';
import {
  buildSelectedMatchNarrative,
  getInterestingBusinessNote
} from '../js/modules/ui-renderers.js';

const ROOT = process.cwd();
const UI_RENDERERS = join(ROOT, 'js/modules/ui-renderers.js');
const LIFECYCLE = join(ROOT, 'js/modules/lifecycle.js');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function read(path) {
  return readFileSync(path, 'utf8');
}

function testInterestingBusinessNote() {
  assert(getInterestingBusinessNote(null) === null, 'null point returns null');
  assert(getInterestingBusinessNote({ trivia: 'Pending research.' }) === null, 'pending research suppressed');
  assert(getInterestingBusinessNote({ trivia: 'SearXNG returned insufficient evidence for this lead.' }) === null, 'SearXNG details suppressed');
  assert(getInterestingBusinessNote({ trivia: 'Texas Comptroller record confirms exact entity name.' }) === null, 'verification metadata suppressed');
  assert(getInterestingBusinessNote({ trivia: 'No verifiable official site was found.' }) === null, 'negative placeholder suppressed');
  assert(getInterestingBusinessNote({ email: 'a@example.com', phone: '555-555-5555' }) === null, 'generic contact fallback suppressed');

  const useful = 'Family-owned storefront with community classes and seasonal repair events.';
  assert(getInterestingBusinessNote({ trivia: useful }) === useful, 'useful public trivia survives');
}

function testSelectedMatchNarrative() {
  const previous = state.currentSearchSummary;
  try {
    state.currentSearchSummary = null;
    assert(buildSelectedMatchNarrative({ name: 'Example' }) === '', 'empty narrative without search reason');
    assert(buildSelectedMatchNarrative(null) === '', 'empty narrative without point');

    state.currentSearchSummary = { reason: 'Matched the search because the record mentions emergency repair.' };
    assert(
      buildSelectedMatchNarrative({ name: 'Example' }) === state.currentSearchSummary.reason,
      'narrative uses current search reason'
    );
  } finally {
    state.currentSearchSummary = previous;
  }
}

function testSourceCanonicality() {
  const uiSrc = read(UI_RENDERERS);
  const lifeSrc = read(LIFECYCLE);

  assert(uiSrc.includes('export function buildSelectedMatchNarrative'), 'ui-renderers exports narrative builder');
  assert(uiSrc.includes('export function getInterestingBusinessNote'), 'ui-renderers exports note filter');

  assert(lifeSrc.includes("from './ui-renderers.js'"), 'lifecycle imports from ui-renderers');
  assert(!lifeSrc.includes('window.buildSelectedMatchNarrative'), 'lifecycle does not use window for narrative');
}

testInterestingBusinessNote();
testSelectedMatchNarrative();
testSourceCanonicality();

console.log('PASS: ui-renderers narrative helpers verified');
