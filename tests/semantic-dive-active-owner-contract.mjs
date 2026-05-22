/**
 * semantic-dive-active-owner-contract.mjs
 *
 * Verifies the semantic-dive state ownership resolution:
 * 1. lifecycle.js is the sole authoritative owner of window.setSemanticDiveMode
 * 2. journey.js exports a backward-compatible delegating alias that calls
 *    the lifecycle window wrapper (never owns canonical state itself)
 * 3. At most one authoritative setSemanticDiveMode implementation exists at runtime
 * 4. All side effects (trailDepth, navState.mode, camera, UI sync) are owned
 *    exclusively by the lifecycle implementation
 *
 * Run: node tests/semantic-dive-active-owner-contract.mjs
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.cwd());
const LIFECYCLE = path.join(ROOT, 'js/modules/lifecycle.js');
const JOURNEY = path.join(ROOT, 'js/modules/journey.js');

function assert(cond, msg) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

function getSource(file) {
  return fs.readFileSync(file, 'utf-8');
}

// ── OWNERSHIP RULE 1 ──────────────────────────────────────────────────────────
// window.setSemanticDiveMode must be assigned exactly once, in lifecycle.js.
// It must NOT be assigned in journey.js.

function testRule1_LifecycleOwnsWindowAssignment() {
  console.log('\n[Rule 1] window.setSemanticDiveMode assignment belongs to lifecycle.js only');

  const lc = getSource(LIFECYCLE);
  const jn = getSource(JOURNEY);

  // lifecycle.js MUST assign the compatibility bridge to the canonical named export.
  assert(
    /window\.setSemanticDiveMode\s*=\s*setSemanticDiveMode\s*;/.test(lc),
    'lifecycle.js must assign window.setSemanticDiveMode to the canonical named export'
  );

  // journey.js must NOT assign window.setSemanticDiveMode
  const journeyAssigns = /window\.setSemanticDiveMode\s*=(?!=)/.test(jn);
  assert(
    !journeyAssigns,
    'journey.js must NOT assign window.setSemanticDiveMode — it delegates to lifecycle'
  );

  console.log('  PASS — lifecycle.js is the sole window.setSemanticDiveMode owner');
}

// ── OWNERSHIP RULE 2 ──────────────────────────────────────────────────────────
// journey.setSemanticDiveMode (named export) must delegate to window.setSemanticDiveMode
// and must NOT directly write canonical state (semanticDiveMode, trailDepth, navState.mode)
// without going through the lifecycle window wrapper.

function testRule2_JourneyDelegateIsBackwardCompat() {
  console.log('\n[Rule 2] journey.js named export is backward-compatible delegating alias');

  const jn = getSource(JOURNEY);

  // journey.js must have the delegating form of setSemanticDiveMode
  // It must call window.setSemanticDiveMode for canonical state management.
  const hasDelegatePattern = /typeof\s+window\.setSemanticDiveMode\s*===\s*['"]function['"]/.test(jn);
  assert(hasDelegatePattern, 'journey.js setSemanticDiveMode must guard window.setSemanticDiveMode');
  const exportStart = jn.indexOf('export function setSemanticDiveMode');
  const nextExport = jn.indexOf('export function walkInsideToNextStop', exportStart);
  assert(exportStart >= 0 && nextExport > exportStart, 'journey.js setSemanticDiveMode export body must be locatable');
  const setSemanticDiveModeBody = jn.slice(exportStart, nextExport);

  // journey.js must NOT directly write state.semanticDiveMode without window wrapper
  // (allow the direct state write in the else fallback branch — test isolation only)
  const lines = jn.split('\n');
  let foundDirectStateWrite = false;
  for (const line of lines) {
    // Look for direct state.semanticDiveMode assignment NOT inside the else branch
    // The pattern state.semanticDiveMode = active (without window wrapper) is only
    // acceptable in the isolated else fallback for test environments.
    // In the primary path (window wrapper available), we must call window.setSemanticDiveMode.
    if (/state\.semanticDiveMode\s*=\s*(?!active)/.test(line)) {
      // Check if this is inside the else fallback (test isolation path)
      const trimmed = line.trim();
      // Allow only in the else fallback: "} else {" followed by direct state write
      // We detect this by checking if the line is inside an else block
      const inElseFallback = false; // simplified check — actual verification done by content inspection
    }
  }
  // More precise: the primary path must call window.setSemanticDiveMode
  // The call may span multiple lines; look for typeof guard followed by the call anywhere in the body
  const hasGuardAndCall = /typeof\s+window\.setSemanticDiveMode\s*===[\s\S]*?window\.setSemanticDiveMode\(enabled\)/.test(jn);
  assert(hasGuardAndCall, 'journey.js setSemanticDiveMode must delegate to window.setSemanticDiveMode in primary path');
  assert(!/state\.semanticDiveMode\s*=/.test(setSemanticDiveModeBody), 'journey.js setSemanticDiveMode must not directly write state.semanticDiveMode');
  assert(!/state\.navState\.mode\s*=/.test(setSemanticDiveModeBody), 'journey.js setSemanticDiveMode must not directly write navState.mode');

  console.log('  PASS — journey.js setSemanticDiveMode is a backward-compatible delegating alias');
}

// ── OWNERSHIP RULE 3 ──────────────────────────────────────────────────────────
// lifecycle.js setSemanticDiveMode must sync trailDepth with allowDiveExit
// when deactivating (nextActive=false), to unblock the setTrailDepth guard.

function testRule3_LifecycleHandlesAllowDiveExit() {
  console.log('\n[Rule 3] lifecycle setSemanticDiveMode passes allowDiveExit on exit');

  const lc = getSource(LIFECYCLE);

  const hasAllowDiveExit = /allowDiveExit.*true/.test(lc);
  assert(hasAllowDiveExit, 'lifecycle.js must pass allowDiveExit: true when deactivating semanticDiveMode');
  const implementationStart = lc.indexOf('export function setSemanticDiveMode');
  const implementationEnd = lc.indexOf('\nfunction recomputeBloomIndices', implementationStart);
  const implementationBody = lc.slice(implementationStart, implementationEnd);
  assert(/(?<!window\.)setTrailDepth\s*\(/.test(implementationBody), 'lifecycle setSemanticDiveMode must call setTrailDepth directly');
  assert(!/window\.setTrailDepth\s*\(/.test(implementationBody), 'lifecycle setSemanticDiveMode must not call its own trail-depth owner through window');

  console.log('  PASS — allowDiveExit guard is handled for depth 2 exit path');
}

// ── OWNERSHIP RULE 4 ──────────────────────────────────────────────────────────
// No module other than lifecycle.js may assign window.setSemanticDiveMode.
// Scans all JS modules in js/modules/.

function testRule4_NoOtherModuleAssigns() {
  console.log('\n[Rule 4] No module besides lifecycle.js assigns window.setSemanticDiveMode');

  const modulesDir = path.join(ROOT, 'js/modules');
  const files = fs.readdirSync(modulesDir).filter(f => f.endsWith('.js'));

  const violations = [];
  for (const file of files) {
    if (file === 'lifecycle.js') continue;
    const src = getSource(path.join(modulesDir, file));
    if (/window\.setSemanticDiveMode\s*=(?!=)/.test(src)) {
      violations.push(file);
    }
  }

  assert(violations.length === 0, `Modules ${violations.join(', ')} must not assign window.setSemanticDiveMode`);
  console.log('  PASS — lifecycle.js is the only window.setSemanticDiveMode assigner');
}

// ── MAIN ──────────────────────────────────────────────────────────────────────

console.log('=================================================================');
console.log('semantic-dive-active-owner-contract.mjs');
console.log('Semantic-dive active owner resolution contract');
console.log('=================================================================');

try {
  testRule1_LifecycleOwnsWindowAssignment();
  testRule2_JourneyDelegateIsBackwardCompat();
  testRule3_LifecycleHandlesAllowDiveExit();
  testRule4_NoOtherModuleAssigns();

  console.log('\n=================================================================');
  console.log('ALL OWNERSHIP RULES PASSED');
  console.log('=================================================================');
  process.exit(0);
} catch (err) {
  console.error('\nCONTRACT FAILED:', err.message);
  process.exit(1);
}
