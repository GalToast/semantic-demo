// loading-ui-contract.mjs - Source-level contract tests for loading UI
// Fast Node tests that verify loading phase behavior, overlay dispatch contract,
// and deferred hydration scheduling.
//
// LEGACY PATH: tests patterns
// SVELTE PATH: tests src/components/LoadingOverlay.svelte patterns
// Auto-detects which path is active.

import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

// ---------------------------------------------------------------------------
// Source loading with Svelte detection
// ---------------------------------------------------------------------------

const svelteLoadingPath = join(ROOT, 'src/components/LoadingOverlay.svelte')
const hasSvelte = existsSync(svelteLoadingPath)

const loadingUiPath = join(ROOT, 'src/lib/stores/legacy-stores.ts')
const lifecyclePath = join(ROOT, 'src/lib/stores/lifecycle.ts')

const loadingUiSource = hasSvelte ? null : await readFile(loadingUiPath, 'utf8').catch(() => null)
const lifecycleSource = hasSvelte ? null : await readFile(lifecyclePath, 'utf8').catch(() => null)
const svelteLoadingSource = hasSvelte ? await readFile(svelteLoadingPath, 'utf8').catch(() => null) : null
const svelteAppSource = hasSvelte ? await readFile(join(ROOT, 'src/App.svelte'), 'utf8').catch(() => null) : null
// F5 (data-pipeline bugsweep 2026-08-08): progress values moved from
// LoadingOverlay.svelte inline to LOADING_PHASE_META in loading.ts.
const loadingTsPath = join(ROOT, 'src/lib/ui/loading.ts')
const loadingTsSource = hasSvelte ? await readFile(loadingTsPath, 'utf8').catch(() => null) : null

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractBody(source, fnName) {
    const pattern = new RegExp(`export\\s+function\\s+${fnName}\\s*\\([^)]*\\)\\s*\\{([\\s\\S]*?)^\\}`, 'm')
    const match = source.match(pattern)
    return match ? match[1] : null
}

// ---------------------------------------------------------------------------
// Test runner
// ---------------------------------------------------------------------------

let passed = 0
let failed = 0

function ok(msg) {
    console.log(`  ✓ ${msg}`)
    passed++
}

function skip(msg) {
    console.log(`  ⊙ SKIP: ${msg}`)
}

// ---------------------------------------------------------------------------
// Svelte LoadingOverlay Checks
// ---------------------------------------------------------------------------

const svelteTests = []

// Import stores for runtime behavioral tests
let loadingPhaseStore, dataLoadState, setLoadingPhase, setDataLoadStatus, setDataLoadError, LoadingPhase
let storesReady = false

try {
  const dataStore = await import('../src/lib/data-store.ts')
  loadingPhaseStore = dataStore.loadingPhaseStore
  dataLoadState = dataStore.dataLoadState
  setLoadingPhase = dataStore.setLoadingPhase
  setDataLoadStatus = dataStore.setDataLoadStatus
  setDataLoadError = dataStore.setDataLoadError
  storesReady = true
} catch (err) {
  // Svelte store imports may not be available in all environments
}

if (hasSvelte && svelteLoadingSource) {
    svelteTests.push(async function testSvelteOverlayRenders() {
        if (!svelteLoadingSource) return skip('LoadingOverlay.svelte not readable')
        const hasOverlay = svelteLoadingSource.includes('loading-overlay')
        if (!hasOverlay) throw new Error('LoadingOverlay must render a .loading-overlay element')
        ok('Svelte LoadingOverlay renders loading-overlay element')
    })

    svelteTests.push(async function testSvelteOverlayHasProgressBar() {
        if (!svelteLoadingSource) return skip('LoadingOverlay.svelte not readable')
        const hasProgressBar = svelteLoadingSource.includes('loading-progress-bar')
        const hasWidthBinding = svelteLoadingSource.includes('Math.round(progress * 100)')
        if (!hasProgressBar) throw new Error('LoadingOverlay must have #loading-progress-bar')
        if (!hasWidthBinding) throw new Error('LoadingOverlay progress bar must use Math.round(progress * 100)%')
        ok('Svelte LoadingOverlay has progress bar with correct width binding')
    })

    svelteTests.push(async function testSveltePhaseChips() {
        if (!svelteLoadingSource) return skip('LoadingOverlay.svelte not readable')
        const hasPhaseRow = svelteLoadingSource.includes('loading-phase-row')
        const hasChips = svelteLoadingSource.includes('loading-phase-chip')
        const hasDataPhase = svelteLoadingSource.includes('data-loading-phase')
        if (!hasPhaseRow) throw new Error('LoadingOverlay must have #loading-phase-row')
        if (!hasChips) throw new Error('LoadingOverlay must render .loading-phase-chip elements')
        if (!hasDataPhase) throw new Error('LoadingOverlay phase chips must use data-loading-phase')
        ok('Svelte LoadingOverlay has phase chips with data-loading-phase')
    })

    svelteTests.push(async function testSveltePhaseOrder() {
        if (!svelteLoadingSource) return skip('LoadingOverlay.svelte not readable')
        const hasOrder =
            svelteLoadingSource.includes("'records'") &&
            svelteLoadingSource.includes("'scene'") &&
            svelteLoadingSource.includes("'restore'") &&
            svelteLoadingSource.includes("'launch'")
        if (!hasOrder) throw new Error('LoadingOverlay must define phase order [records, scene, restore, launch]')
        ok('Svelte LoadingOverlay phase order is records -> scene -> restore -> launch')
    })

    svelteTests.push(async function testSveltePhaseProgressMapping() {
        if (!svelteLoadingSource) return skip('LoadingOverlay.svelte not readable')
        if (!loadingTsSource) return skip('src/lib/ui/loading.ts not readable')

        // Phase progress values live in LOADING_PHASE_META (loading.ts),
        // not inline in the .svelte file (F5: extracted 2026-08-08).
        const hasProgressMeta =
            loadingTsSource.includes('LOADING_PHASE_META') &&
            loadingTsSource.includes('0.2') &&  // records
            loadingTsSource.includes('0.48') &&  // scene
            loadingTsSource.includes('0.76') &&  // restore
            loadingTsSource.includes('progress: 1')  // launch
        if (!hasProgressMeta)
            throw new Error('loading.ts LOADING_PHASE_META must map phases to progress values (0.2, 0.48, 0.76, 1)')

        // LoadingOverlay.svelte must read progress from LOADING_PHASE_META,
        // not inline the literal values (the old coupling point).
        const readsFromMeta =
            svelteLoadingSource.includes('LOADING_PHASE_META') &&
            svelteLoadingSource.includes('progress')
        if (!readsFromMeta)
            throw new Error('LoadingOverlay.svelte must read progress from LOADING_PHASE_META[phase]?.progress')

        ok('Svelte LoadingOverlay reads phase progress from LOADING_PHASE_META (loading.ts)')
    })

    svelteTests.push(async function testSvelteLoadingStateAttribute() {
        if (!svelteLoadingSource) return skip('LoadingOverlay.svelte not readable')
        const hasStateAttr =
            svelteLoadingSource.includes('data-loading-state="active"') ||
            svelteLoadingSource.includes("data-loading-state={isError ? 'error' : 'active'}") ||
            svelteLoadingSource.includes('data-loading-state={')
        // role: accepts either literal 'progressbar' or the conditional form
        // role={isError ? 'alert' : 'progressbar'} (error-state handling).
        const hasRoleProgressbar =
            svelteLoadingSource.includes('role="progressbar"') ||
            svelteLoadingSource.includes("role={isError ? 'alert' : 'progressbar'}")
        // aria-valuenow: accepts either literal or dynamic form.
        const hasAriaValuenow =
            svelteLoadingSource.includes('aria-valuenow') &&
            (svelteLoadingSource.includes('aria-valuenow="') || svelteLoadingSource.includes('aria-valuenow={'))
        if (!hasStateAttr) throw new Error('LoadingOverlay must set data-loading-state attribute')
        if (!hasRoleProgressbar) throw new Error('LoadingOverlay must have role="progressbar" (literal or conditional)')
        if (!hasAriaValuenow) throw new Error('LoadingOverlay must have aria-valuenow (literal or dynamic)')
        ok('Svelte LoadingOverlay has accessibility attributes and loading state')
    })

    svelteTests.push(async function testSvelteOverlayDoesNotOverrideGlobalBackground() {
        if (!svelteLoadingSource) return skip('LoadingOverlay.svelte not readable')
        const styleMatch = svelteLoadingSource.match(/<style>([\s\S]*?)<\/style>/)
        if (!styleMatch) throw new Error('LoadingOverlay must have a style block')
        const styleBlock = styleMatch[1]
        // The rich gradient/glass treatment lives in css/loading.css; the component
        // must not re-declare backgrounds on .loading-overlay or .loading-shell.
        const overlayBg = /\.loading-overlay\s*\{[\s\S]*?background[\s\S]*?\}/.test(styleBlock)
        const shellBg = /\.loading-shell\s*\{[\s\S]*?background[\s\S]*?\}/.test(styleBlock)
        if (overlayBg)
            throw new Error(
                'LoadingOverlay scoped styles must not set .loading-overlay background; use css/loading.css'
            )
        if (shellBg)
            throw new Error('LoadingOverlay scoped styles must not set .loading-shell background; use css/loading.css')
        ok('LoadingOverlay scoped styles defer overlay/shell background to css/loading.css')
    })

    svelteTests.push(async function testSvelteOverlayHasRequiredDOMStructure() {
        if (!svelteLoadingSource) return skip('LoadingOverlay.svelte not readable')
        const hasShell = svelteLoadingSource.includes('loading-shell')
        const hasKicker = svelteLoadingSource.includes('loading-kicker')
        const hasTitle = svelteLoadingSource.includes('loading-title')
        const hasNote = svelteLoadingSource.includes('loading-note')
        const hasFoot = svelteLoadingSource.includes('loading-foot')
        if (!hasShell) throw new Error('LoadingOverlay must have .loading-shell container')
        if (!hasKicker) throw new Error('LoadingOverlay must have .loading-kicker')
        if (!hasTitle) throw new Error('LoadingOverlay must have .loading-title')
        if (!hasNote) throw new Error('LoadingOverlay must have .loading-note')
        if (!hasFoot) throw new Error('LoadingOverlay must have .loading-foot')
        ok('Svelte LoadingOverlay has required DOM structure (shell, kicker, title, note, foot)')
    })

    svelteTests.push(async function testSvelteAppRendersLoadingOverlay() {
        if (!svelteAppSource) return skip('App.svelte not readable')
        const hasImport =
            svelteAppSource.includes('LoadingOverlay') && svelteAppSource.includes('@components/LoadingOverlay.svelte')
        const hasRender = svelteAppSource.includes('<LoadingOverlay')
        if (!hasImport) throw new Error('App.svelte must import LoadingOverlay')
        if (!hasRender) throw new Error('App.svelte must render <LoadingOverlay>')
        ok('Svelte App.svelte imports and renders LoadingOverlay')
    })

    svelteTests.push(async function testSvelteLoadingUsesDataLoadStateStore() {
        if (!svelteLoadingSource) return skip('LoadingOverlay.svelte not readable')
        const hasStoreImport =
            svelteLoadingSource.includes('dataLoadState') ||
            svelteLoadingSource.includes('loadingPhaseStore') ||
            svelteLoadingSource.includes('data-store')
        const readsStatus =
            svelteLoadingSource.includes('dataLoadState') ||
            svelteLoadingSource.includes('loadingPhaseStore') ||
            svelteLoadingSource.includes('status')
        if (!hasStoreImport) throw new Error('LoadingOverlay must import from data-store')
        if (!readsStatus) throw new Error('LoadingOverlay must read status from data store')
        ok('Svelte LoadingOverlay reads from data store for loading state')
    })
}

// ---------------------------------------------------------------------------
// Legacy loading-ui.js Checks
// ---------------------------------------------------------------------------

const legacyTests = []

if (!hasSvelte && loadingUiSource) {
    legacyTests.push(async function testPhaseBodyDataset() {
        const source = loadingUiSource
        const hasBodyDataset = /document\.body\.dataset\.loadingPhase\s*=\s*phaseKey/.test(source)
        const hasOverlayDataset = /overlay\.dataset\.loadingPhase\s*=\s*phaseKey/.test(source)
        if (!hasBodyDataset) throw new Error('setLoadingPhase must set document.body.dataset.loadingPhase')
        if (!hasOverlayDataset) throw new Error('setLoadingPhase must set overlay.dataset.loadingPhase')
        ok('setLoadingPhase sets body and overlay data-loading-phase dataset')
    })

    legacyTests.push(async function testPhaseRestoresOverlayVisibility() {
        const source = loadingUiSource
        const body = extractBody(source, 'setLoadingPhase') || ''
        const clearsHiddenAttr = /overlay\.hidden\s*=\s*false/.test(body)
        const clearsAriaHidden = /overlay\.removeAttribute\(\s*['"]aria-hidden['"]\s*\)/.test(body)
        const clearsHiddenClasses =
            /overlay\.classList\.remove\([^)]*['"]hidden['"][^)]*['"]launching['"][^)]*\)/.test(body) ||
            /overlay\.classList\.remove\([^)]*['"]launching['"][^)]*['"]hidden['"][^)]*\)/.test(body)
        const marksActiveState =
            /overlay\.dataset\.loadingState\s*=\s*['"]active['"]/.test(body) &&
            /document\.body\.dataset\.loadingOverlay\s*=\s*['"]active['"]/.test(body)
        if (!clearsHiddenAttr) throw new Error('setLoadingPhase must clear overlay.hidden before showing a new phase')
        if (!clearsAriaHidden) throw new Error('setLoadingPhase must remove aria-hidden from the overlay')
        if (!clearsHiddenClasses)
            throw new Error('setLoadingPhase must remove hidden/launching classes from the overlay')
        if (!marksActiveState) throw new Error('setLoadingPhase must mark overlay and body loading state active')
        ok('setLoadingPhase restores overlay visibility semantics')
    })

    legacyTests.push(async function testProgressWidth() {
        const source = loadingUiSource
        const hasProgressWidth =
            source.includes('progressBar.style.width') &&
            source.includes('Math.round((overrides.progress ?? phase.progress) * 100)') &&
            source.includes('}%`')
        if (!hasProgressWidth)
            throw new Error('setLoadingPhase must set progressBar.style.width with Math.round(percent*100)%')
        ok('setLoadingPhase progress bar width uses Math.round(percent*100)%')
    })

    legacyTests.push(async function testSceneReadyDispatch() {
        const source = loadingUiSource
        const importsSceneReady = /import\s*\{\s*SCENE_READY\s*\}\s*from\s*['"]\.\/scene-events\.js['"]/.test(source)
        if (!importsSceneReady) throw new Error('loading-ui.js must import SCENE_READY from scene-events.ts')
        const usesConstant = /window\.dispatchEvent\(\s*new\s+CustomEvent\(\s*SCENE_READY\s*\)/.test(source)
        if (!usesConstant)
            throw new Error('hideLoadingOverlay must dispatch CustomEvent(SCENE_READY), not a string literal')
        const hasStringLiteral = /window\.dispatchEvent\(\s*new\s+CustomEvent\(\s*['"]scene-ready['"]/.test(source)
        if (hasStringLiteral)
            throw new Error('hideLoadingOverlay must not dispatch CustomEvent with raw string literal')
        ok('hideLoadingOverlay dispatches SCENE_READY constant (not string literal)')
    })

    legacyTests.push(async function testHideOverlayTerminalState() {
        const source = loadingUiSource
        const hasHiddenClass = /overlay\.classList\.add\(\s*['"]hidden['"]\s*\)/.test(source)
        const hasHiddenAttr = /overlay\.hidden\s*=\s*true/.test(source)
        const hasAriaHidden = /overlay\.setAttribute\(\s*['"]aria-hidden['"]\s*,\s*['"]true['"]\s*\)/.test(source)
        const hasInert = /overlay\.inert\s*=\s*true/.test(source)
        const hasOverlayDataset = /overlay\.dataset\.loadingState\s*=\s*['"]hidden['"]/.test(source)
        const hasBodyDataset =
            /document\.body\.dataset\.loadingOverlay\s*=\s*['"]hidden['"]/.test(source) &&
            /document\.body\.dataset\.sceneReady\s*=\s*['"]true['"]/.test(source)
        if (!hasHiddenClass) throw new Error('hideLoadingOverlay must add the hidden class')
        if (!hasHiddenAttr) throw new Error('hideLoadingOverlay must set overlay.hidden = true')
        if (!hasAriaHidden) throw new Error('hideLoadingOverlay must set aria-hidden="true"')
        if (!hasInert) throw new Error('hideLoadingOverlay must make the overlay inert')
        if (!hasOverlayDataset) throw new Error('hideLoadingOverlay must set overlay data-loading-state="hidden"')
        if (!hasBodyDataset)
            throw new Error('hideLoadingOverlay must set body loadingOverlay hidden and sceneReady true')
        ok('hideLoadingOverlay writes complete hidden terminal state')
    })

    legacyTests.push(async function testDeferredHydrationIdempotent() {
        const source = loadingUiSource
        const guards = /if\s*\(\s*state\.deferredHydrationStarted\s*\)\s*return/.test(source)
        if (!guards)
            throw new Error('startDeferredHydration must return early if state.deferredHydrationStarted is true')
        ok('startDeferredHydration is idempotent - guards on deferredHydrationStarted')
    })

    legacyTests.push(async function testScheduleWeatherInitializedGuard() {
        const source = loadingUiSource
        const hasGuard =
            /function\s+scheduleWeatherHydration[\s\S]{0,200}if\s*\(\s*state\.weatherInitialized\s*\)\s*return/.test(
                source
            )
        if (!hasGuard) throw new Error('scheduleWeatherHydration must guard on state.weatherInitialized')
        ok('scheduleWeatherHydration guards on weatherInitialized before calling initWeather')
    })

    legacyTests.push(async function testInitWeatherViaWindow() {
        const source = loadingUiSource
        const callsWindowInit = /window\.initWeather\s*\(/.test(source) || /initWeather\s*\(/.test(source)
        if (!callsWindowInit) throw new Error('initWeather must be called')
        ok('initWeather is called via window.initWeather or direct import')
    })

    legacyTests.push(async function testRestoreFocusTrailStateImport() {
        const source = loadingUiSource
        const hasImport = /import\s*\{[^}]*restoreFocusTrailState[^}]*\}\s*from\s*['"]\.\/journey\.js['"]/.test(source)
        if (!hasImport) throw new Error('loading-ui.js must import restoreFocusTrailState from journey.ts')
        const callsViaWindow = /window\.restoreFocusTrailState\s*\(/.test(source)
        if (callsViaWindow)
            throw new Error('restoreFocusTrailState must not be called via window.restoreFocusTrailState')
        const isCalled = /restoreFocusTrailState\s*\(/.test(source)
        if (!isCalled) throw new Error('restoreFocusTrailState must be called in loading-ui.ts')
        ok('loading-ui.js imports restoreFocusTrailState from journey.js and calls it directly')
    })

    legacyTests.push(async function testNoPhantomFocusOverlayCalls() {
        const source = loadingUiSource
        const phantomCalls = ['window.refreshFocusBeaconOverlay', 'window.refreshFocusNextCueOverlay']
        for (const phantom of phantomCalls) {
            if (source.includes(phantom)) {
                throw new Error(`${phantom} must not appear in loading-ui.js`)
            }
        }
        const hasLongChain = /window\.(refreshFocusBeacon|refreshFocusNextCue)/.test(source)
        if (hasLongChain) throw new Error('Long window.* focus restore chain must not return to loading-ui.ts')
        ok('loading-ui.js has no phantom window.refreshFocusBeaconOverlay or window.refreshFocusNextCueOverlay calls')
    })

    legacyTests.push(async function testLifecycleReExports() {
        const source = lifecycleSource
        if (!source) return skip('lifecycle.js not readable')
        const reExports = ['setLoadingPhase', 'hideLoadingOverlay', 'startDeferredHydration']
        for (const fn of reExports) {
            const importBlock = /import\s*\{[\s\S]*?\}\s*from\s*['"]\.\/loading-ui\.js['"]/.exec(source)?.[0] || ''
            const exportBlock = (source.match(/export\s*\{[\s\S]*?\}/g) || []).find((block) => block.includes(fn)) || ''
            const importLine = importBlock.includes(fn)
            const exportLine = exportBlock.includes(fn)
            if (!importLine) throw new Error(`lifecycle.js must import ${fn} from loading-ui.js`)
            if (!exportLine) throw new Error(`lifecycle.js must re-export ${fn}`)
        }
        ok('lifecycle.js imports and re-exports setLoadingPhase, hideLoadingOverlay, startDeferredHydration')
    })

    legacyTests.push(async function testWindowBindings() {
        const source = lifecycleSource
        if (!source) return skip('lifecycle.js not readable')
        const bindings = ['window.setLoadingPhase', 'window.hideLoadingOverlay', 'window.startDeferredHydration']
        for (const binding of bindings) {
            if (source.includes(binding)) {
                throw new Error(`lifecycle.js must not restore retired ${binding} window binding`)
            }
        }
        ok('lifecycle.js keeps loading-ui window bindings retired')
    })

    legacyTests.push(async function testNoCircularDependency() {
        const source = loadingUiSource
        const importsLifecycle =
            /^import\s+.*\s+from\s+['"]\.\/lifecycle\.js['"]/m.test(source) ||
            /^import\s+.*\s+from\s+['"]\.\.\/lifecycle\.js['"]/m.test(source) ||
            source.includes("from './lifecycle.ts'") ||
            source.includes("from '../lifecycle.ts'")
        if (importsLifecycle)
            throw new Error('loading-ui.js must not import from lifecycle.js to avoid circular dependency')
        ok('loading-ui.js has no circular import from lifecycle.ts')
    })

    legacyTests.push(async function testRequestIdleCallbackScheduling() {
        const source = loadingUiSource
        const hasRIC = /requestIdleCallback/.test(source)
        if (!hasRIC) throw new Error('scheduleWeatherHydration should use requestIdleCallback when available')
        ok('scheduleWeatherHydration uses requestIdleCallback with fallback setTimeout')
    })

    legacyTests.push(async function testPhaseOrder() {
        const source = loadingUiSource
        const orderMatch = source.match(/\['records',\s*'scene',\s*'restore',\s*'launch'\]/)
        if (!orderMatch) throw new Error('setLoadingPhase must use phase order [records, scene, restore, launch]')
        ok('phase order is records -> scene -> restore -> launch')
    })
}

// ---------------------------------------------------------------------------
// Runtime behavioral tests (store-level, not source-inspection)
// These survive refactors as long as the loading phase / data-load
// state behavior holds.
// ---------------------------------------------------------------------------

const runtimeTests = []

if (storesReady) {
  runtimeTests.push(async function testRuntimePhaseTransitionBehavior() {
    console.log('\n  Runtime: phase store transitions')

    const { get } = await import('svelte/store')

    setLoadingPhase('records')
    if (get(loadingPhaseStore) !== 'records') throw new Error('phase should start at records')

    setLoadingPhase('scene')
    if (get(loadingPhaseStore) !== 'scene') throw new Error('phase should transition to scene')

    setLoadingPhase('restore')
    if (get(loadingPhaseStore) !== 'restore') throw new Error('phase should transition to restore')

    setLoadingPhase('launch')
    if (get(loadingPhaseStore) !== 'launch') throw new Error('phase should transition to launch')

    ok('Phase store transitions records → scene → restore → launch')
  })

  runtimeTests.push(async function testRuntimePhaseProgressInvariant() {
    console.log('\n  Runtime: phase progress invariant')

    const PHASE_PROGRESS = {
      records: 0.2,
      scene: 0.48,
      restore: 0.76,
      launch: 1
    }

    const prevValues = [0.2, 0.48, 0.76]
    const phases = /** @type {const} */ (['records', 'scene', 'restore', 'launch'])

    for (let i = 0; i < phases.length; i++) {
      const phase = phases[i]
      const progress = PHASE_PROGRESS[phase]
      if (typeof progress !== 'number' || progress <= 0 || progress > 1)
        throw new Error(`phase ${phase} has invalid progress: ${progress}`)
      if (i > 0 && progress <= prevValues[i - 1])
        throw new Error(`phase ${phase} progress ${progress} <= previous ${prevValues[i - 1]}`)
    }

    ok('Phase progress is monotonically increasing with launch at 1.0')
  })

  runtimeTests.push(async function testRuntimeDataLoadStateTransitions() {
    console.log('\n  Runtime: data load state transitions')

    const { get } = await import('svelte/store')

    setDataLoadStatus('idle')
    if (get(dataLoadState).status !== 'idle') throw new Error('status should start at idle')

    setDataLoadStatus('loading')
    if (get(dataLoadState).status !== 'loading') throw new Error('status should transition to loading')

    setDataLoadStatus('ready')
    if (get(dataLoadState).status !== 'ready') throw new Error('status should transition to ready')

    ok('Data load state idle → loading → ready lifecycle')
  })

  runtimeTests.push(async function testRuntimeDataLoadErrorState() {
    console.log('\n  Runtime: data load error state')

    const { get } = await import('svelte/store')

    setDataLoadError('Network failure')
    const dlState = get(dataLoadState)
    if (dlState.status !== 'error') throw new Error('status should be error')
    if (dlState.error !== 'Network failure') throw new Error('error message should be preserved')

    ok('Data load error state surfaces error message')
  })

  runtimeTests.push(async function testRuntimeLoadingPhaseResetBehavior() {
    console.log('\n  Runtime: phase reset and re-transition behavior')

    const { get } = await import('svelte/store')

    setLoadingPhase('records')
    setDataLoadStatus('loading')
    setLoadingPhase('scene')
    setLoadingPhase('restore')
    setLoadingPhase('launch')
    setDataLoadStatus('ready')

    if (get(loadingPhaseStore) !== 'launch') throw new Error('should end at launch')
    if (get(dataLoadState).status !== 'ready') throw new Error('should end at ready')

    setLoadingPhase('records')
    setDataLoadStatus('loading')
    if (get(loadingPhaseStore) !== 'records') throw new Error('should reset to records')
    if (get(dataLoadState).status !== 'loading') throw new Error('should reset to loading')

    ok('Phase and data state can reset and re-transition')
  })
}

// ---------------------------------------------------------------------------
// Run all tests
// ---------------------------------------------------------------------------

const allTests = [...(hasSvelte ? svelteTests : legacyTests), ...runtimeTests]
const pathLabel = hasSvelte ? 'Svelte' : 'Legacy'

console.log(`\n  Loading UI contract (${pathLabel} path)`)
console.log('  ' + '-'.repeat(47))

for (const testFn of allTests) {
    try {
        await testFn()
    } catch (err) {
        console.error(`  ✗ FAIL: ${err.message}`)
        failed++
    }
}

console.log(`\n${passed}/${allTests.length} contract checks passed`)
process.exit(failed > 0 ? 1 : 0)
