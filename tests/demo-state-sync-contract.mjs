/**
 * Contract for the demo/app state synchronization, storage decoupling,
 * and sidebar reveal behaviors.
 *
 * LEGACY PATH (port 8795):
 *   micro-demo.js manages SESSION_STORAGE_KEY, setInfoPanelOpen, __demoReset
 *   event-bindings.js exports revealSelectedBusinessCard
 *
 * SVELTE PATH (port 5173):
 *   demo.ts manages DEMO_SESSION_KEY, DEMO_LIFETIME_KEY, storage guards
 *   DemoChoreography.svelte orchestrates phase transitions and body dataset
 *   Navigation store controls panel surface state
 *
 * This test auto-detects which path is active by checking for Svelte source.
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const svelteDemoStorePath = path.join(ROOT, 'src/lib/stores/demo.ts');
const hasSvelte = fs.existsSync(svelteDemoStorePath);

const microDemoSource = hasSvelte
  ? null
  : fs.readFileSync(path.join(ROOT, 'js/modules/micro-demo.js'), 'utf8');
const eventBindingsSource = hasSvelte
  ? null
  : fs.readFileSync(path.join(ROOT, 'js/modules/event-bindings.js'), 'utf8');
const svelteStoreSource = hasSvelte
  ? fs.readFileSync(svelteDemoStorePath, 'utf8')
  : null;
const svelteComponentSource = hasSvelte
  ? fs.readFileSync(path.join(ROOT, 'src/components/DemoChoreography.svelte'), 'utf8')
  : null;

let passed = 0;
let failed = 0;
let skipped = 0;

function ok(message) {
  console.log(`  ok ${message}`);
  passed += 1;
}

function fail(message) {
  console.log(`  FAIL ${message}`);
  failed += 1;
}

function skip(message) {
  console.log(`  ⊙ SKIP: ${message}`);
  skipped += 1;
}

function test(message, fn) {
  try {
    fn();
    ok(message);
  } catch (error) {
    fail(message);
    console.log(`        ${error.message}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

if (hasSvelte) {
  // ── Svelte Path Checks ──────────────────────────────────────────────────

  console.log('=== Running Svelte Demo State Sync Contract Checks ===\n');

  test('demo.ts uses DEMO_SESSION_KEY of moco_mycelium_demo_session_v1', () => {
    assert(/DEMO_SESSION_KEY\s*=\s*['"]moco_mycelium_demo_session_v1['"]/.test(svelteStoreSource),
      'demo.ts must define DEMO_SESSION_KEY as moco_mycelium_demo_session_v1');
  });

  test('demo.ts uses DEMO_LIFETIME_KEY of moco_mycelium_demo_v1', () => {
    assert(/DEMO_LIFETIME_KEY\s*=\s*['"]moco_mycelium_demo_v1['"]/.test(svelteStoreSource),
      'demo.ts must define DEMO_LIFETIME_KEY as moco_mycelium_demo_v1');
  });

  test('demo.ts has isDemoSuppressedThisSession guard using sessionStorage', () => {
    assert(/export\s+function\s+isDemoSuppressedThisSession/.test(svelteStoreSource),
      'demo.ts must export isDemoSuppressedThisSession');
    assert(/sessionStorage\.getItem\(DEMO_SESSION_KEY\)/.test(svelteStoreSource),
      'isDemoSuppressedThisSession must check sessionStorage with DEMO_SESSION_KEY');
  });

  test('demo.ts has hasDemoBeenSeen guard using localStorage', () => {
    assert(/export\s+function\s+hasDemoBeenSeen/.test(svelteStoreSource),
      'demo.ts must export hasDemoBeenSeen');
    assert(/localStorage\.getItem\(DEMO_LIFETIME_KEY\)/.test(svelteStoreSource),
      'hasDemoBeenSeen must check localStorage with DEMO_LIFETIME_KEY');
  });

  test('demo.ts checks for demo=force parameter in shouldRunDemo', () => {
    const forceMatches = (svelteStoreSource.match(/params\.get\(['"]demo['"]\)\s*===\s*['"]force['"]/g) || []);
    assert(forceMatches.length >= 1, `expected at least one demo=force parameter check, found ${forceMatches.length}`);
  });

  test('demo.ts checks for nodemo=1 parameter in shouldRunDemo', () => {
    assert(/params\.get\(['"]nodemo['"]\)\s*===\s*['"]1['"]/.test(svelteStoreSource),
      'shouldRunDemo must check nodemo=1 parameter');
  });

  test('DemoChoreography.svelte sets body.dataset.demoPhase on transitions', () => {
    assert(/document\.body\.dataset\.demoPhase/.test(svelteComponentSource)
      || /document\.body\.dataset\.demoPhase/.test(svelteStoreSource),
      'DemoChoreography or demo store must set body.dataset.demoPhase');
  });

  test('demo.ts transitionDemo syncs body data attribute', () => {
    assert(/document\.body\.dataset\.demoPhase\s*=\s*to/.test(svelteStoreSource),
      'transitionDemo must set body.dataset.demoPhase to the target phase');
  });

  test('demo.ts markDemoCompleted writes to localStorage', () => {
    assert(/export\s+function\s+markDemoCompleted/.test(svelteStoreSource),
      'demo.ts must export markDemoCompleted');
    assert(/localStorage\.setItem\(DEMO_LIFETIME_KEY/.test(svelteStoreSource),
      'markDemoCompleted must write to localStorage with DEMO_LIFETIME_KEY');
  });

  test('demo.ts markDemoSessionSkipped writes to sessionStorage', () => {
    assert(/export\s+function\s+markDemoSessionSkipped/.test(svelteStoreSource),
      'demo.ts must export markDemoSessionSkipped');
    assert(/sessionStorage\.setItem\(DEMO_SESSION_KEY/.test(svelteStoreSource),
      'markDemoSessionSkipped must write to sessionStorage with DEMO_SESSION_KEY');
  });

  test('DemoChoreography.svelte stores demo completion in localStorage', () => {
    assert(/localStorage\.setItem\(['"]moco_mycelium_demo_v1['"]/.test(svelteComponentSource)
      || /localStorage\.setItem\(DEMO_LIFETIME_KEY/.test(svelteComponentSource)
      || /markDemoCompleted/.test(svelteComponentSource),
      'DemoChoreography must store demo completion in localStorage');
  });

  test('DemoChoreography.svelte stores session skip in sessionStorage', () => {
    assert(/sessionStorage\.setItem\(['"]moco_mycelium_demo_session_v1['"]/.test(svelteComponentSource)
      || /sessionStorage\.setItem\(DEMO_SESSION_KEY/.test(svelteComponentSource)
      || /markDemoSessionSkipped/.test(svelteComponentSource),
      'DemoChoreography must store session skip in sessionStorage');
  });

  test('DemoChoreography.svelte delegates eligibility and storage key ownership to demo store helpers', () => {
    assert(/shouldRunDemo\(\)/.test(svelteComponentSource),
      'DemoChoreography must call shouldRunDemo instead of duplicating eligibility checks');
    assert(/markDemoCompleted\(\)/.test(svelteComponentSource),
      'DemoChoreography must call markDemoCompleted instead of writing lifetime storage directly');
    assert(/markDemoSessionSkipped\(/.test(svelteComponentSource),
      'DemoChoreography must call markDemoSessionSkipped instead of writing session storage directly');
    assert(!/localStorage\.setItem\(['"]moco_mycelium_demo_v1['"]/.test(svelteComponentSource),
      'DemoChoreography must not hardcode the lifetime storage key');
    assert(!/sessionStorage\.setItem\(['"]moco_mycelium_demo_session_v1['"]/.test(svelteComponentSource),
      'DemoChoreography must not hardcode the session storage key');
  });

  test('demo state is decoupled from window globals', () => {
    assert(!/window\.__demoState/.test(svelteStoreSource),
      'demo.ts must not expose state on window.__demoState');
    assert(!/window\.isMicroDemoRunning/.test(svelteStoreSource),
      'demo.ts must not expose isMicroDemoRunning on window');
    assert(!/window\.cancelMicroDemo/.test(svelteStoreSource),
      'demo.ts must not expose cancelMicroDemo on window');
  });

} else {
  // ── Legacy Path Checks ──────────────────────────────────────────────────

  console.log('=== Running Legacy Demo State Sync Contract Checks ===\n');

  test('micro-demo.js uses SESSION_STORAGE_KEY of moco_mycelium_demo_session_v1', () => {
    assert(/SESSION_STORAGE_KEY\s*=\s*['"]moco_mycelium_demo_session_v1['"]/.test(microDemoSource), 'micro-demo.js must define SESSION_STORAGE_KEY as moco_mycelium_demo_session_v1');
  });

  test('micro-demo.js checks for demo=force parameter in shouldRunMicroDemo and startMicroDemo', () => {
    const forceMatches = microDemoSource.match(/params\.get\(['\"]demo['\"]\)\s*===\s*['\"]force['\"]/g) || [];
    assert(forceMatches.length >= 2, `expected at least two demo=force parameter checks, found ${forceMatches.length}`);
  });

  test('micro-demo.js uses setInfoPanelOpen(false) at T=7200ms instead of raw slide-in-left manipulation', () => {
    assert(!/classList\.remove\(['\"]slide-in-left['\"]\)/.test(microDemoSource), 'micro-demo.js must not directly remove slide-in-left class');
    assert(/setInfoPanelOpen\(\s*false\s*\)/.test(microDemoSource), 'micro-demo.js must call setInfoPanelOpen(false) at T=7200ms');
  });

  test('micro-demo.js calls setInfoPanelOpen(true) via __demoReset (called from _resetAppState)', () => {
    assert(/_resetAppState\b[\s\S]*?__demoReset\(\)/.test(microDemoSource), '_resetAppState must call __demoReset()');
    assert(/function __demoReset\(\)[\s\S]*?setInfoPanelOpen\(\s*true\s*\)/.test(microDemoSource), '__demoReset must call setInfoPanelOpen(true)');
    assert(!microDemoSource.includes('window.setInfoPanelOpen'), 'micro-demo.js must use the named setInfoPanelOpen import, not window.setInfoPanelOpen');
  });

  test('event-bindings.js defines revealSelectedBusinessCard', () => {
    assert(/export\s+function\s+revealSelectedBusinessCard/.test(eventBindingsSource), 'event-bindings.js must export revealSelectedBusinessCard');
    assert(/revealSelectedBusinessCard\(\)\s*\{[\s\S]*?setInfoPanelOpen\(\s*true\s*\)/.test(eventBindingsSource), 'revealSelectedBusinessCard must call setInfoPanelOpen(true)');
  });
}

console.log(`\n${'-'.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed, ${skipped} skipped`);
console.log(`${'-'.repeat(50)}\n`);

process.exit(failed > 0 ? 1 : 0);
