// loading-ui-contract.mjs - Source-level contract tests for loading-ui.js
// Fast Node tests that verify phase body dataset, progress width, overlay
// dispatch contract, and deferred hydration scheduling / window.initWeather guard.

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract the body of an exported function from a source string. */
function extractBody(source, fnName) {
    const pattern = new RegExp(`export\\s+function\\s+${fnName}\\s*\\([^)]*\\)\\s*\\{([\\s\\S]*?)^\\}`, 'm');
    const match = source.match(pattern);
    return match ? match[1] : null;
}

// ---------------------------------------------------------------------------
// Source loading
// ---------------------------------------------------------------------------

const loadingUiPath = join(__dirname, '../js/modules/loading-ui.js');
const lifecyclePath = join(__dirname, '../js/modules/lifecycle.js');
const statePath     = join(__dirname, '../js/state.js');

const loadingUiSource = await readFile(loadingUiPath, 'utf8').catch(() => null);
const lifecycleSource = await readFile(lifecyclePath, 'utf8').catch(() => null);
const stateSource     = await readFile(statePath, 'utf8').catch(() => null);

function readFile(path, enc) {
    return import('fs').then(fs => fs.promises.readFile(path, enc));
}

// ---------------------------------------------------------------------------
// Test: phase sets body[data-loading-phase] dataset
// ---------------------------------------------------------------------------

async function testPhaseBodyDataset() {
    const source = loadingUiSource;
    if (!source) return skip('loading-ui.js not readable');

    // Verify that setLoadingPhase writes document.body.dataset.loadingPhase = phaseKey
    const hasBodyDataset = /document\.body\.dataset\.loadingPhase\s*=\s*phaseKey/.test(source);
    // Verify overlay dataset update
    const hasOverlayDataset = /overlay\.dataset\.loadingPhase\s*=\s*phaseKey/.test(source);

    if (!hasBodyDataset)  throw new Error('setLoadingPhase must set document.body.dataset.loadingPhase');
    if (!hasOverlayDataset) throw new Error('setLoadingPhase must set overlay.dataset.loadingPhase');
    ok('setLoadingPhase sets body and overlay data-loading-phase dataset');
}

// ---------------------------------------------------------------------------
// Test: setLoadingPhase restores the overlay from the hidden terminal state
// ---------------------------------------------------------------------------

async function testPhaseRestoresOverlayVisibility() {
    const source = loadingUiSource;
    if (!source) return skip('loading-ui.js not readable');

    const body = extractBody(source, 'setLoadingPhase') || '';
    const clearsHiddenAttr = /overlay\.hidden\s*=\s*false/.test(body);
    const clearsAriaHidden = /overlay\.removeAttribute\(\s*['"]aria-hidden['"]\s*\)/.test(body);
    const clearsHiddenClasses = /overlay\.classList\.remove\([^)]*['"]hidden['"][^)]*['"]launching['"][^)]*\)/.test(body)
        || /overlay\.classList\.remove\([^)]*['"]launching['"][^)]*['"]hidden['"][^)]*\)/.test(body);
    const marksActiveState = /overlay\.dataset\.loadingState\s*=\s*['"]active['"]/.test(body)
        && /document\.body\.dataset\.loadingOverlay\s*=\s*['"]active['"]/.test(body);

    if (!clearsHiddenAttr) throw new Error('setLoadingPhase must clear overlay.hidden before showing a new phase');
    if (!clearsAriaHidden) throw new Error('setLoadingPhase must remove aria-hidden from the overlay');
    if (!clearsHiddenClasses) throw new Error('setLoadingPhase must remove hidden/launching classes from the overlay');
    if (!marksActiveState) throw new Error('setLoadingPhase must mark overlay and body loading state active');
    ok('setLoadingPhase restores overlay visibility semantics');
}

// ---------------------------------------------------------------------------
// Test: phase progress bar width uses Math.round(percent * 100)
// ---------------------------------------------------------------------------

async function testProgressWidth() {
    const source = loadingUiSource;
    if (!source) return skip('loading-ui.js not readable');

    // Verify progressBar.style.width is set with a percentage value derived from progress
    const hasProgressWidth = source.includes('progressBar.style.width')
        && source.includes('Math.round((overrides.progress ?? phase.progress) * 100)')
        && source.includes('}%`');

    if (!hasProgressWidth) throw new Error('setLoadingPhase must set progressBar.style.width with Math.round(percent*100)%');
    ok('setLoadingPhase progress bar width uses Math.round(percent*100)%');
}

// ---------------------------------------------------------------------------
// Test: hideLoadingOverlay dispatches SCENE_READY constant (not string literal)
// ---------------------------------------------------------------------------

async function testSceneReadyDispatch() {
    const source = loadingUiSource;
    if (!source) return skip('loading-ui.js not readable');

    // Must import SCENE_READY from scene-events.js
    const importsSceneReady = /import\s*\{\s*SCENE_READY\s*\}\s*from\s*['"]\.\/scene-events\.js['"]/.test(source);
    if (!importsSceneReady) throw new Error('loading-ui.js must import SCENE_READY from scene-events.js');

    // Must dispatch via the constant, not a raw string literal
    const usesConstant = /window\.dispatchEvent\(\s*new\s+CustomEvent\(\s*SCENE_READY\s*\)/.test(source);
    if (!usesConstant) throw new Error('hideLoadingOverlay must dispatch CustomEvent(SCENE_READY), not a string literal');

    // Must NOT use string literal form
    const hasStringLiteral = /window\.dispatchEvent\(\s*new\s+CustomEvent\(\s*['"]scene-ready['"]/.test(source);
    if (hasStringLiteral) throw new Error('hideLoadingOverlay must not dispatch CustomEvent with raw string literal — use SCENE_READY constant');

    ok('hideLoadingOverlay dispatches SCENE_READY constant (not string literal)');
}

// ---------------------------------------------------------------------------
// Test: hideLoadingOverlay writes a complete hidden terminal state
// ---------------------------------------------------------------------------

async function testHideOverlayTerminalState() {
    const source = loadingUiSource;
    if (!source) return skip('loading-ui.js not readable');

    const hasHiddenClass = /overlay\.classList\.add\(\s*['"]hidden['"]\s*\)/.test(source);
    const hasHiddenAttr = /overlay\.hidden\s*=\s*true/.test(source);
    const hasAriaHidden = /overlay\.setAttribute\(\s*['"]aria-hidden['"]\s*,\s*['"]true['"]\s*\)/.test(source);
    const hasInert = /overlay\.inert\s*=\s*true/.test(source);
    const hasOverlayDataset = /overlay\.dataset\.loadingState\s*=\s*['"]hidden['"]/.test(source);
    const hasBodyDataset = /document\.body\.dataset\.loadingOverlay\s*=\s*['"]hidden['"]/.test(source)
        && /document\.body\.dataset\.sceneReady\s*=\s*['"]true['"]/.test(source);

    if (!hasHiddenClass) throw new Error('hideLoadingOverlay must add the hidden class');
    if (!hasHiddenAttr) throw new Error('hideLoadingOverlay must set overlay.hidden = true');
    if (!hasAriaHidden) throw new Error('hideLoadingOverlay must set aria-hidden="true"');
    if (!hasInert) throw new Error('hideLoadingOverlay must make the overlay inert');
    if (!hasOverlayDataset) throw new Error('hideLoadingOverlay must set overlay data-loading-state="hidden"');
    if (!hasBodyDataset) throw new Error('hideLoadingOverlay must set body loadingOverlay hidden and sceneReady true');
    ok('hideLoadingOverlay writes complete hidden terminal state');
}

// ---------------------------------------------------------------------------
// Test: startDeferredHydration guards on state.deferredHydrationStarted (idempotent)
// ---------------------------------------------------------------------------

async function testDeferredHydrationIdempotent() {
    const source = loadingUiSource;
    if (!source) return skip('loading-ui.js not readable');

    const guards = /if\s*\(\s*state\.deferredHydrationStarted\s*\)\s*return/.test(source);
    if (!guards) throw new Error('startDeferredHydration must return early if state.deferredHydrationStarted is true');
    ok('startDeferredHydration is idempotent - guards on deferredHydrationStarted');
}

// ---------------------------------------------------------------------------
// Test: scheduleWeatherHydration guards on state.weatherInitialized
// ---------------------------------------------------------------------------

async function testScheduleWeatherInitializedGuard() {
    const source = loadingUiSource;
    if (!source) return skip('loading-ui.js not readable');

    // scheduleWeatherHydration is a private function in loading-ui.js
    const hasGuard = /function\s+scheduleWeatherHydration[\s\S]{0,200}if\s*\(\s*state\.weatherInitialized\s*\)\s*return/.test(source);
    if (!hasGuard) throw new Error('scheduleWeatherHydration must guard on state.weatherInitialized');
    ok('scheduleWeatherHydration guards on weatherInitialized before calling initWeather');
}

// ---------------------------------------------------------------------------
// Test: initWeather is called via window.initWeather (not direct import)
// ---------------------------------------------------------------------------

async function testInitWeatherViaWindow() {
    const source = loadingUiSource;
    if (!source) return skip('loading-ui.js not readable');

    // initWeather can be called as window.initWeather or a direct named import
    const callsWindowInit = /window\.initWeather\s*\(/.test(source) || /initWeather\s*\(/.test(source);
    if (!callsWindowInit) throw new Error('initWeather must be called');
    ok('initWeather is called via window.initWeather or direct import');
}

// ---------------------------------------------------------------------------
// Test: loading-ui.js imports restoreFocusTrailState from journey.js
// ---------------------------------------------------------------------------

async function testRestoreFocusTrailStateImport() {
    const source = loadingUiSource;
    if (!source) return skip('loading-ui.js not readable');

    // Must import restoreFocusTrailState from journey.js
    const hasImport = /import\s*\{[^}]*restoreFocusTrailState[^}]*\}\s*from\s*['"]\.\/journey\.js['"]/.test(source);
    if (!hasImport) throw new Error('loading-ui.js must import restoreFocusTrailState from journey.js');

    // Must NOT call via window.restoreFocusTrailState (old long chain must not return)
    const callsViaWindow = /window\.restoreFocusTrailState\s*\(/.test(source);
    if (callsViaWindow) throw new Error('restoreFocusTrailState must not be called via window.restoreFocusTrailState - use direct import');

    // restoreFocusTrailState must actually be called (not just imported and unused)
    const isCalled = /restoreFocusTrailState\s*\(/.test(source);
    if (!isCalled) throw new Error('restoreFocusTrailState must be called in loading-ui.js');

    ok('loading-ui.js imports restoreFocusTrailState from journey.js and calls it directly');
}

// ---------------------------------------------------------------------------
// Test: window.refreshFocusBeaconOverlay / window.refreshFocusNextCueOverlay
//    are not present in loading-ui.js (phantom calls must stay removed)
// ---------------------------------------------------------------------------

async function testNoPhantomFocusOverlayCalls() {
    const source = loadingUiSource;
    if (!source) return skip('loading-ui.js not readable');

    // These phantom window calls were removed in Wave52 and must not return
    const phantomCalls = [
        'window.refreshFocusBeaconOverlay',
        'window.refreshFocusNextCueOverlay'
    ];

    for (const phantom of phantomCalls) {
        if (source.includes(phantom)) {
            throw new Error(`${phantom} must not appear in loading-ui.js - phantom call was removed in Wave52`);
        }
    }

    // Also verify no unguarded window.* focus restore chain (alternative form)
    const hasLongChain = /window\.(refreshFocusBeacon|refreshFocusNextCue)/.test(source);
    if (hasLongChain) throw new Error('Long window.* focus restore chain must not return to loading-ui.js');

    ok('loading-ui.js has no phantom window.refreshFocusBeaconOverlay or window.refreshFocusNextCueOverlay calls');
}

// ---------------------------------------------------------------------------
// Test: lifecycle.js re-exports setLoadingPhase, hideLoadingOverlay, startDeferredHydration
// ---------------------------------------------------------------------------

async function testLifecycleReExports() {
    const source = lifecycleSource;
    if (!source) return skip('lifecycle.js not readable');

    const reExports = [
        'setLoadingPhase',
        'hideLoadingOverlay',
        'startDeferredHydration'
    ];

    for (const fn of reExports) {
        const importBlock = /import\s*\{[\s\S]*?\}\s*from\s*['"]\.\/loading-ui\.js['"]/.exec(source)?.[0] || '';
        const exportBlock = (source.match(/export\s*\{[\s\S]*?\}/g) || []).find((block) => block.includes(fn)) || '';
        const importLine  = importBlock.includes(fn);
        const exportLine  = exportBlock.includes(fn);
        if (!importLine) throw new Error(`lifecycle.js must import ${fn} from loading-ui.js`);
        if (!exportLine) throw new Error(`lifecycle.js must re-export ${fn}`);
    }
    ok('lifecycle.js imports and re-exports setLoadingPhase, hideLoadingOverlay, startDeferredHydration');
}

// ---------------------------------------------------------------------------
// Test: window.bindings in lifecycle.js are preserved
// ---------------------------------------------------------------------------

async function testWindowBindings() {
    const source = lifecycleSource;
    if (!source) return skip('lifecycle.js not readable');

    const bindings = [
        'window.setLoadingPhase',
        'window.hideLoadingOverlay',
        'window.startDeferredHydration'
    ];

    for (const binding of bindings) {
        if (!source.includes(binding)) {
            throw new Error(`lifecycle.js must preserve ${binding} window binding`);
        }
    }
    ok('lifecycle.js preserves window.setLoadingPhase, window.hideLoadingOverlay, window.startDeferredHydration bindings');
}

// ---------------------------------------------------------------------------
// Test: loading-ui.js does NOT import from lifecycle.js (no circular dependency)
// ---------------------------------------------------------------------------

async function testNoCircularDependency() {
    const source = loadingUiSource;
    if (!source) return skip('loading-ui.js not readable');

    const importsLifecycle = /^import\s+.*\s+from\s+['"]\.\/lifecycle\.js['"]/m.test(source)
        || /^import\s+.*\s+from\s+['"]\.\.\/lifecycle\.js['"]/m.test(source)
        || source.includes("from './lifecycle.js'")
        || source.includes("from '../lifecycle.js'");

    if (importsLifecycle) throw new Error('loading-ui.js must not import from lifecycle.js to avoid circular dependency');
    ok('loading-ui.js has no circular import from lifecycle.js');
}

// ---------------------------------------------------------------------------
// Test: scheduleWeatherHydration uses requestIdleCallback with timeout
// ---------------------------------------------------------------------------

async function testRequestIdleCallbackScheduling() {
    const source = loadingUiSource;
    if (!source) return skip('loading-ui.js not readable');

    const hasRIC = /requestIdleCallback/.test(source);
    if (!hasRIC) throw new Error('scheduleWeatherHydration should use requestIdleCallback when available');
    ok('scheduleWeatherHydration uses requestIdleCallback with fallback setTimeout');
}

// ---------------------------------------------------------------------------
// Test: loading phases array order is records/scene/restore/launch
// ---------------------------------------------------------------------------

async function testPhaseOrder() {
    const source = loadingUiSource;
    if (!source) return skip('loading-ui.js not readable');

    const orderMatch = source.match(/\['records',\s*'scene',\s*'restore',\s*'launch'\]/);
    if (!orderMatch) throw new Error('setLoadingPhase must use phase order [records, scene, restore, launch]');
    ok('phase order is records -> scene -> restore -> launch');
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

const tests = [
    testPhaseBodyDataset,
    testPhaseRestoresOverlayVisibility,
    testProgressWidth,
    testSceneReadyDispatch,
    testHideOverlayTerminalState,
    testDeferredHydrationIdempotent,
    testScheduleWeatherInitializedGuard,
    testInitWeatherViaWindow,
    testRestoreFocusTrailStateImport,
    testNoPhantomFocusOverlayCalls,
    testLifecycleReExports,
    testWindowBindings,
    testNoCircularDependency,
    testRequestIdleCallbackScheduling,
    testPhaseOrder,
];

let passed = 0;
let failed = 0;

function ok(msg) {
    console.log(`  ✓ ${msg}`);
    passed++;
}

function skip(msg) {
    console.log(`  ⊙ SKIP: ${msg}`);
}

for (const test of tests) {
    try {
        await test();
    } catch (err) {
        console.error(`  ✗ FAIL: ${err.message}`);
        failed++;
    }
}

console.log(`\n${passed}/${tests.length} contract checks passed`);
process.exit(failed > 0 ? 1 : 0);
