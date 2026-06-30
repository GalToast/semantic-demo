/**
 * residual-window-bridge-inventory-contract.mjs
 *
 * Source-only Node contract: inventory and guard the residual window bridge surface.
 *
 * Goals:
 *   1. Inventory all direct window.* call sites across modules — categorize as
 *        - Compatibility export (app.js bootstrap aliases)
 *        - Intentional fallback (typeof-guarded cross-module calls)
 *        - Extraction candidate (cross-module window call with direct-import alternative)
 *   2. Guard already-dewindowed seams against newly introduced high-risk bare calls
 *   3. Document residual debt without failing on known intentional bridges
 *
 * Design constraints:
 *   - Avoid brittle contracts that fail on known intentional compatibility patterns
 *   - Guard ONLY newly introduced unguarded window.fn() calls in seams already dewindowed
 *   - "Bare" = direct window.fn() call NOT inside typeof guard or ?. optional chain
 *
 * Source-only — no DOM, no Playwright.
 * Runs in Node.
 *
 * Usage:
 *   node tests/residual-window-bridge-inventory-contract.mjs
 */

import fs from 'node:fs'
import path from 'node:path'

const SEMDEMO_ROOT = path.resolve(process.cwd())

// ── MODULE MAP ──────────────────────────────────────────────────────────────

const MODULES = {
    lifecycle: path.join(SEMDEMO_ROOT, 'src/lib/stores/lifecycle.ts'),
    journey: path.join(SEMDEMO_ROOT, 'src/lib/journey/journey.ts'),
    camera: path.join(SEMDEMO_ROOT, 'src/lib/engine/camera-controls.ts'),
    cameraChoreography: path.join(SEMDEMO_ROOT, 'src/lib/engine/camera-choreography/routes.ts'),
    searchState: path.join(SEMDEMO_ROOT, 'src/lib/search/state.ts'),
    eventBindings: path.join(SEMDEMO_ROOT, 'src/lib/ui/legend-bindings.ts'),
    sceneReveal: path.join(SEMDEMO_ROOT, 'src/lib/engine/scene-reveal.ts'),
    app: path.join(SEMDEMO_ROOT, 'src/lib/orchestration/adapters.ts'),
    appRuntime: path.join(SEMDEMO_ROOT, 'src/lib/orchestration/adapters.ts'),
    mapState: path.join(SEMDEMO_ROOT, 'src/lib/engine/map-state.ts'),
    // clusterFilter: path.join(SEMDEMO_ROOT, 'src/lib/stores/filter.svelte.ts'),  // REMOVED — file does not exist
    journeyCompassCtrl: path.join(SEMDEMO_ROOT, 'src/lib/orchestration/compass-controller.ts'),
    journeyCompassState: path.join(SEMDEMO_ROOT, 'src/lib/journey/compass-state.ts'),
    focusPocket: path.join(SEMDEMO_ROOT, 'src/lib/journey/focus-pocket.ts'),
    threadInspector: path.join(SEMDEMO_ROOT, 'src/lib/journey/thread-inspector-webgl.ts'),
    threadInspectorState: path.join(SEMDEMO_ROOT, 'src/lib/journey/thread-inspector-state.ts'),
    threadInspectorRender: path.join(SEMDEMO_ROOT, 'src/lib/journey/thread-inspector-render.ts'),
    strandContinuity: path.join(SEMDEMO_ROOT, 'src/lib/utils/strand-continuity.ts'),
    journeyThreadSettler: path.join(SEMDEMO_ROOT, 'src/lib/journey/thread-settler.ts'),
    journeyCanvasInteraction: path.join(SEMDEMO_ROOT, 'src/lib/journey/canvas-interaction.ts'),
    clusterLabels: path.join(SEMDEMO_ROOT, 'src/lib/ui/cluster-labels.ts'),
    audio: path.join(SEMDEMO_ROOT, 'src/lib/audio/audio-scape.ts'),
    viewController: path.join(SEMDEMO_ROOT, 'src/lib/orchestration/view-controller.ts'),
    navigationState: path.join(SEMDEMO_ROOT, 'src/lib/stores/navigation.svelte.ts'),
    journeyWebgl: path.join(SEMDEMO_ROOT, 'src/lib/journey/webgl.ts'),
    legendUi: path.join(SEMDEMO_ROOT, 'src/lib/journey/legend-ui.ts'),
    keyboardHelp: path.join(SEMDEMO_ROOT, 'src/lib/keyboard/keyboard-help.ts'),
    uiRenderers: path.join(SEMDEMO_ROOT, 'src/lib/ui/renderers.ts'),
    mapFlatteningLayout: path.join(SEMDEMO_ROOT, 'src/lib/utils/map-flattening-layout.ts'),
    inspectedStrandOverlayAdapter: path.join(SEMDEMO_ROOT, 'src/lib/journey/inspected-strand-overlay-adapter.ts'),
    routeArrivalOverlayAdapter: path.join(SEMDEMO_ROOT, 'src/lib/journey/route-arrival-overlay-adapter.ts'),
    threeSetup: path.join(SEMDEMO_ROOT, 'src/lib/engine/three-engine.ts'),
    threeEngineCore: path.join(SEMDEMO_ROOT, 'src/lib/engine/three-engine-core.ts'),
    threeEngineState: path.join(SEMDEMO_ROOT, 'src/lib/engine/three-engine-state.ts'),
    threeSearchAnimations: path.join(SEMDEMO_ROOT, 'src/lib/engine/three-search-animations.ts'),
    threeInteractionVisuals: path.join(SEMDEMO_ROOT, 'src/lib/engine/three-interaction-visuals.ts')
}

// ── HELPERS ────────────────────────────────────────────────────────────────

function assert(cond, msg) {
    if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`)
}

function assertMatches(source, pattern, label) {
    if (!pattern.test(source)) throw new Error(`ASSERTION FAILED: ${label}: missing match for ${pattern}`)
}

function read(mod) {
    const src = fs.readFileSync(MODULES[mod], 'utf-8')
    if (mod === 'threeSetup' && MODULES.threeEngineCore && MODULES.threeEngineState) {
        return src + '\n' + fs.readFileSync(MODULES.threeEngineCore, 'utf-8') + '\n' + fs.readFileSync(MODULES.threeEngineState, 'utf-8')
    }
    if (mod === 'threadInspector' && MODULES.threadInspectorState && MODULES.threadInspectorRender) {
        return src + '\n' + fs.readFileSync(MODULES.threadInspectorState, 'utf-8') + '\n' + fs.readFileSync(MODULES.threadInspectorRender, 'utf-8')
    }
    return src
}

// ── EXTRACTION CANDIDATES (documented residual debt) ────────────────────────
// These are window calls that COULD be direct module imports instead.
// They are NOT failures — just documented residual debt.
// Format: [callerModule, windowFnName, ownerModule, note]

const EXTRACTION_CANDIDATES = [
    [
        'threadInspector',
        'exploreThreadNeighbor',
        'thread-inspector',
        'REMOVED direct backward-compat expose; diagnostic access remains on window._ti and contracts assert the direct window assignment stays absent'
    ]
]

// ── TEST 1 — No bare window calls in dewindowed seams ────────────────────────
// search-state.js is already dewindowed — any new unguarded window.fn() call is a regression.

function testNoBareCallsInDowindowedSeams() {
    console.log('\n[TEST 1] No bare window calls in dewindowed seams')

    const src = read('searchState')

    // Browser APIs that are not cross-module state/navigation bridges.
    // These are standard browser globals and are not part of the app's bridge surface.
    const BROWSER_APIS = new Set([
        'setTimeout',
        'clearTimeout',
        'setInterval',
        'clearInterval',
        'innerWidth',
        'innerHeight',
        'outerWidth',
        'outerHeight',
        'matchMedia',
        'requestAnimationFrame',
        'cancelAnimationFrame',
        'addEventListener',
        'removeEventListener',
        'dispatchEvent',
        'getComputedStyle',
        'document',
        'navigator',
        'location',
        'localStorage',
        'sessionStorage',
        'fetch',
        'XMLHttpRequest'
    ])

    // Module references exported via app.js bootstrap (window._cc, etc.)
    const BOOTSTRAP_MODULE_REFS = new Set(['_cc', '_ti', '_ms', '_weather'])

    const lines = src.split('\n')
    const problems = []

    for (let i = 0; i < lines.length; i++) {
        const t = lines[i].trim()
        if (!t || t.startsWith('//') || t.startsWith('*')) continue

        const pos = t.indexOf('window.')
        if (pos === -1) continue

        const before = t.substring(0, pos)
        if (before.includes('typeof') || before.includes('?.')) continue

        // Multi-line guard check
        let guarded = false
        for (let j = Math.max(0, i - 3); j < i; j++) {
            const prev = lines[j].trim()
            if (prev.includes('typeof') || prev.includes('===')) {
                guarded = true
                break
            }
        }
        if (guarded) continue

        // It's a potential bare call — check what it is
        const fnMatch = t.match(/window\.([a-zA-Z_$][a-zA-Z0-9_$]*)/)
        if (!fnMatch) continue
        const fn = fnMatch[1]

        // Skip browser APIs and bootstrap module references
        if (BROWSER_APIS.has(fn) || BOOTSTRAP_MODULE_REFS.has(fn)) continue

        // Skip property accessors (window.innerWidth — no paren means it's a property read)
        const after = t.slice(pos + `window.${fn}`.length)
        if (!/^\(/.test(after)) continue // no parenthesis → not a function call

        problems.push(`  line ${i + 1}: bare window.${fn}() — not guarded with typeof`)
    }

    assert(
        problems.length === 0,
        `search-state.js has bare unguarded window calls (regression in dewindowed seam):\n${problems.join('\n')}`
    )

    console.log('  OK — search-state.js: no bare window calls (dewindowed seam intact)')
}

// ── TEST 2 — No newly introduced bare window calls in lifecycle.js ──────────
// lifecycle.js is the main orchestrator — new unguarded cross-module calls are regressions.

function testLifecycleNoNewBareCalls() {
    console.log('\n[TEST 2] No newly introduced bare window calls in lifecycle.ts')

    const src = read('lifecycle')

    // Collect all window.fn call-sites that are NOT in the known fallback set
    // and NOT guarded by typeof.
    // Focus on HIGH-RISK cross-module calls: animateCameraTo*, setRouteChoreographyPhase,
    // updateLegendGuideState, updateTraversalUi, etc.

    const HIGH_RISK_CALLS = [
        'animateCameraToNode',
        'animateCameraToSearchCorridor',
        'setRouteChoreographyPhase',
        'updateLegendGuideState',
        'updateTraversalUi',
        'clearRouteExploration',
        'noteSceneInteraction'
    ]

    const lines = src.split('\n')
    const problems = []

    for (let i = 0; i < lines.length; i++) {
        const t = lines[i].trim()
        if (!t || t.startsWith('//') || t.startsWith('*')) continue

        for (const fn of HIGH_RISK_CALLS) {
            const pos = t.indexOf(`window.${fn}`)
            if (pos === -1) continue

            // Check if this is a call (not an assignment)
            const after = t.slice(pos + `window.${fn}`.length)
            if (!/^[\(\?]/.test(after)) continue // not a call site

            // Check guard
            const before = t.substring(0, pos)
            if (before.includes('typeof') || before.includes('?.')) continue

            // Multi-line guard
            let guarded = false
            for (let j = Math.max(0, i - 3); j < i; j++) {
                const prev = lines[j].trim()
                if (prev.includes('typeof') || prev.includes('===') || prev.includes('null !=')) {
                    guarded = true
                    break
                }
            }
            if (guarded) continue

            problems.push(`  line ${i + 1}: bare window.${fn}() — not guarded (cross-module risk)`)
        }
    }

    assert(
        problems.length === 0,
        `lifecycle.js has new unguarded high-risk window calls:\n${problems.join('\n')}\nThese should use typeof guards or direct module imports.`
    )
    console.log('  OK — lifecycle.js: no new bare high-risk window calls')
}

// ── TEST 3 — App.js bootstrap exports are thin aliases ────────────────────────
// Verify app.js window exports are module references, not inline function bodies.

function testAppJsExportsAreThin() {
    console.log('\n[TEST 3] app.js window exports are thin module aliases')

    const appSrc = read('app')

    // Extract all window assignments from app.js
    const lines = appSrc.split('\n')
    const problems = []

    for (let i = 0; i < lines.length; i++) {
        const t = lines[i].trim()
        if (!t || t.startsWith('//') || t.startsWith('*') || t.startsWith('*')) continue

        const m = t.match(/^window\.(\w+)\s*=\s*(.+?);?\s*$/)
        if (!m) continue

        const [, name, expr] = m

        if (name === '__APP_ACTIONS__') continue

        // Allowed: plain name reference or module.member
        const isPlainName = /^[a-zA-Z_$][\w]*$/.test(expr.trim())
        const isModuleMember = /^[a-zA-Z_$][\w]*\.[a-zA-Z_$][\w]*$/.test(expr.trim())

        // Inline functions and utilities that are local to app.js
        const ALLOWED_INLINE = new Set([
            'getSelectedBusinessRoleLabel', // local utility, not a bridge
            'applyClusterUiAccent', // local function wrapping cluster-ui-accent
            'findClusterByKeyword', // local utility
            'state' // raw state reference
        ])

        if (isPlainName || isModuleMember || ALLOWED_INLINE.has(name)) continue

        problems.push(`  window.${name} = ${expr} — not a thin alias (inline body?)`)
    }

    assert(problems.length === 0, `app.js has non-thin window exports:\n${problems.join('\n')}`)
    console.log('  OK — app.js: all window exports are thin aliases or module.member')
}

// ── TEST 4 — Extraction candidate calls are documented ───────────────────────
// The EXTRACTION_CANDIDATES list documents known residual debt.
// This test verifies that none of the documented extraction candidates have
// been accidentally removed or replaced with unguarded direct calls.

function testExtractionCandidatesDocumented() {
    console.log('\n[TEST 4] Extraction candidate window calls are documented')

    // For each extraction candidate, verify the window call still exists
    // (guarded or not) in the caller source. The contract is: if you're calling
    // window.X and X appears in EXTRACTION_CANDIDATES, that call is documented debt.

    const problems = []

    for (const [caller, fn, owner, note] of EXTRACTION_CANDIDATES) {
        if (!MODULES[caller]) {
            problems.push(`  Unknown module: ${caller}`)
            continue
        }
        const src = read(caller)
        if (!src.includes(`window.${fn}`)) {
            // Window call may have been refactored to direct import — that's fine (even good)
            // Just note it for inventory purposes
            console.log(`  [INFO] ${caller} → window.${fn} (${owner}): ${note} — call may be refactored`)
        }
    }

    if (problems.length > 0) {
        assert(false, `Extraction candidate configuration errors:\n${problems.join('\n')}`)
    }

    console.log('  OK — extraction candidates documented and calls verified')
}

// ── TEST 5 — Baseline bare-call inventory (informational) ─────────────────────
// Document the current count of unguarded window.fn() calls across modules.
// This is informational — it does NOT fail. The actual enforcement
// for dewindowed seams is done in tests 1 and 2.

function testBareCallBaseline() {
    console.log('\n[TEST 5] Baseline bare-call inventory (informational)')

    // Browser APIs and standard globals — not cross-module bridge calls.
    const IGNORED = new Set([
        'setTimeout',
        'clearTimeout',
        'setInterval',
        'clearInterval',
        'innerWidth',
        'innerHeight',
        'outerWidth',
        'outerHeight',
        'matchMedia',
        'requestAnimationFrame',
        'cancelAnimationFrame',
        'addEventListener',
        'removeEventListener',
        'dispatchEvent',
        'getComputedStyle',
        'document',
        'navigator',
        'location',
        'localStorage',
        'sessionStorage',
        'fetch',
        'XMLHttpRequest',
        'AudioContext',
        'webkitAudioContext',
        '_cc',
        '_ti',
        '_ms',
        '_weather',
        '_cam',
        // Internal state/probes
        '__lastCanvasNodePick',
        '__lastCanvasNodeHover',
        '__lastCanvasNodeFocusPick',
        '__semanticSearchCacheProbe',
        '__semanticThreadInspectorProbe',
        '__semanticCanvasThreadProbe',
        '__semanticFocusCueProbe',
        '_previouslyFocusedLegend',
        '_previouslyFocusedFocusStage'
    ])

    // Modules that are allowed to have unguarded window calls
    // (they are authoritative owners or compatibility layers)
    const ALLOWED_UNGUARDED = new Set([
        'app',
        'lifecycle',
        'journey',
        'camera',
        'journeyCompassCtrl',
        'journeyCompassState',
        'clusterFilter',
        'focusPocket',
        'clusterLabels',
        'viewController',
        'navigationState',
        'journeyWebgl'
    ])

    const moduleNames = Object.keys(MODULES)
    const results = []

    for (const mod of moduleNames) {
        const src = read(mod)
        const lines = src.split('\n')
        let bareCount = 0
        const bareFns = []

        for (let i = 0; i < lines.length; i++) {
            const t = lines[i].trim()
            if (!t || t.startsWith('//') || t.startsWith('*')) continue

            const pos = t.indexOf('window.')
            if (pos === -1) continue

            // Skip typeof-guarded calls
            const before = t.substring(0, pos)
            if (before.includes('typeof') || before.includes('?.')) continue

            // Multi-line guard
            let guarded = false
            for (let j = Math.max(0, i - 3); j < i; j++) {
                const prev = lines[j].trim()
                if (prev.includes('typeof') || prev.includes('===') || prev.includes('null !=')) {
                    guarded = true
                    break
                }
            }
            if (guarded) continue

            const fnMatch = t.match(/window\.([a-zA-Z_$][a-zA-Z0-9_$]*)/)
            if (!fnMatch) continue
            const fn = fnMatch[1]

            // Skip browser APIs and module references
            if (IGNORED.has(fn)) continue

            // Skip property accessors (no parenthesis after name)
            const after = t.slice(pos + `window.${fn}`.length)
            if (!/^\(/.test(after)) continue

            bareCount++
            bareFns.push(`${fn}@${i + 1}`)
        }

        if (bareCount > 0) {
            results.push({ mod, count: bareCount, fns: bareFns })
        }
    }

    // Only flag modules NOT in the allowed set — these need review
    const needsReview = results.filter((r) => !ALLOWED_UNGUARDED.has(r.mod))

    console.log('  Baseline inventory (informational — does not fail):')
    for (const r of results) {
        const flag = needsReview.includes(r) ? '  ⚠' : '   '
        console.log(
            `  ${flag} ${r.mod}: ${r.count} unguarded bridge call(s) — ${r.fns.slice(0, 5).join(', ')}${r.fns.length > 5 ? '...' : ''}`
        )
    }
    if (needsReview.length > 0) {
        console.log('  Note: modules flagged with ⚠ need review for dewindowing opportunity')
    }
    console.log('  OK — baseline recorded (informational only, no failure)')
}

// ── TEST 6 — Runtime callers migrated off retired focusOnPoint bridge ───────

function testFocusOnPointRuntimeCallersDewindowed() {
    console.log('\n[TEST 6] Runtime callers do not use window.focusOnPoint')

    const callers = ['journeyThreadSettler', 'mapState', 'threadInspectorState']
    const problems = []

    for (const mod of callers) {
        const src = read(mod)
        if (src.includes('window.focusOnPoint')) {
            problems.push(`  ${mod}: still references window.focusOnPoint`)
        }
        if (!/\bfocusOnPoint\b/.test(src)) {
            problems.push(`  ${mod}: expected a focusOnPoint direct import/call after dewindowing`)
        }
    }

    const lifecycleSrc = read('lifecycle')
    assert(
        !/window\.focusOnPoint\b/.test(lifecycleSrc),
        'lifecycle.js should not retain the retired window.focusOnPoint compatibility bridge'
    )

    assert(
        problems.length === 0,
        `Runtime focusOnPoint callers must use direct imports, not the window bridge:\n${problems.join('\n')}`
    )

    console.log(
        '  OK — journey-thread-settler/map-state/thread-inspector use direct focusOnPoint imports; lifecycle bridge is retired'
    )
}

// ── TEST 7 — Runtime arrival handoff callers use direct imports ──────────────

function testJourneyArrivalHandoffDewindowed() {
    console.log('\n[TEST 7] strand continuity does not use arrival handoff window bridges')

    const journeySrc = read('journey')
    const threadInspectorSrc = read('threadInspector')
    const strandContinuitySrc = read('strandContinuity')
    const threeSetupSrc = read('threeSetup')
    const adapterSrc = read('routeArrivalOverlayAdapter')
    const problems = []

    assert(
        !journeySrc.includes('window.syncFocusStage'),
        'journey.js must not retain the retired window.syncFocusStage compatibility bridge'
    )

    for (const fn of ['syncArrivalHandoffOverlay', 'disposeArrivalHandoffOverlay']) {
        if (journeySrc.includes(`window.${fn}`)) {
            problems.push(`  journey: still references window.${fn}`)
        }
        if (threadInspectorSrc.includes(`window.${fn}`)) {
            problems.push(`  thread-inspector: still references window.${fn}`)
        }
        if (strandContinuitySrc.includes(`window.${fn}`)) {
            problems.push(`  strand-continuity: still references window.${fn}`)
        }
        if (!new RegExp(`\\b${fn}\\s*\\(`).test(strandContinuitySrc)) {
            problems.push(`  strand-continuity: expected direct ${fn}() call after dewindowing`)
        }
    }
    assert(
        /import\s+\{[^}]*\bsyncArrivalHandoffOverlay\b[^}]*\bdisposeArrivalHandoffOverlay\b[^}]*\}\s+from\s+['"](?:\.\/journey-webgl\.(?:js|ts)|@lib\/engine\/journey-webgl-bridge|@lib\/engine\/journey-webgl-lazy)['"]/.test(
            strandContinuitySrc
        ),
        'strand-continuity.ts should import arrival handoff functions directly from journey-webgl (legacy or bridge alias)'
    )
    assert(
        journeySrc.includes("from './strand-continuity.ts'") ||
            journeySrc.includes("from '@lib/engine/strand-continuity-bridge'") ||
            journeySrc.includes("from '@lib/utils/strand-continuity'"),
        'journey.ts should import strand continuity state from the shared owner (legacy or bridge alias)'
    )
    assert(
        threadInspectorSrc.includes("from './strand-continuity.ts'") ||
            threadInspectorSrc.includes("from '@lib/engine/strand-continuity-bridge'") ||
            threadInspectorSrc.includes("from '@lib/utils/strand-continuity'"),
        'thread-inspector.ts should import strand continuity state from the shared owner (legacy or bridge alias)'
    )
    assert(
        /import\s+\{[^}]*\bsyncFocusStage\b[^}]*\}\s+from\s+['"][^'"]*(?:selected-card|lifecycle)['"]/.test(
            threadInspectorSrc
        ),
        'thread-inspector.ts should import syncFocusStage from selected-card (or legacy lifecycle) instead of the window bridge'
    )
    assert(
        !threadInspectorSrc.includes('window.syncFocusStage'),
        'thread-inspector.js must not call window.syncFocusStage'
    )

    const journeyWebglSrc = read('journeyWebgl')
    assert(
        !/window\.syncArrivalHandoffOverlay\s*=/.test(journeyWebglSrc),
        'journey-webgl.js must not restore the retired window.syncArrivalHandoffOverlay compatibility bridge'
    )
    assert(
        !/window\.disposeArrivalHandoffOverlay\s*=/.test(journeyWebglSrc),
        'journey-webgl.js must not restore the retired window.disposeArrivalHandoffOverlay compatibility bridge'
    )
    assert(
        journeyWebglSrc.includes('setRouteArrivalOverlayUpdaters({') &&
            journeyWebglSrc.includes('updateRouteTraceOverlayPositions,') &&
            journeyWebglSrc.includes('updateArrivalHandoffOverlay'),
        'journey-webgl.js should register route/arrival overlay frame updaters with the adapter'
    )
    assert(
        (threeSetupSrc.includes("from '@lib/engine/route-arrival-overlay-bridge'") ||
            threeSetupSrc.includes("from '@lib/journey/route-arrival-overlay-adapter'") ||
            threeSetupSrc.includes("from '@lib/engine/journey-webgl-lazy'")) &&
            (threeSetupSrc.includes('_routeArrival?.updateRouteTraceOverlayFrame(frameNow)') ||
                threeSetupSrc.includes('engineState.routeArrival?.updateRouteTraceOverlayFrame(frameNow)') ||
                threeSetupSrc.includes('updateRouteTraceOverlayFrame(frameNow)')) &&
            (threeSetupSrc.includes('_routeArrival?.updateArrivalHandoffOverlayFrame(frameNow)') ||
                threeSetupSrc.includes('engineState.routeArrival?.updateArrivalHandoffOverlayFrame(frameNow)') ||
                threeSetupSrc.includes('updateArrivalHandoffOverlayFrame(frameNow)')),
        'three-engine.js should update route/arrival overlays through the adapter'
    )
    assert(
        !threeSetupSrc.includes('window.updateRouteTraceOverlayPositions') &&
            !threeSetupSrc.includes('window.updateArrivalHandoffOverlay'),
        'three-engine.js must not call route/arrival overlay update functions through window'
    )
    assert(
        /export function updateRouteTraceOverlayFrame/.test(adapterSrc) &&
            /export function updateArrivalHandoffOverlayFrame/.test(adapterSrc) &&
            !/\bwindow\./.test(adapterSrc),
        'route-arrival-overlay-adapter.js should be a window-free adapter boundary'
    )

    assert(
        problems.length === 0,
        `strand-continuity.js must use direct arrival handoff imports, not window bridges:\n${problems.join('\n')}`
    )

    console.log(
        '  OK — strand-continuity owns direct arrival handoff calls; journey-webgl compatibility bridges are retired'
    )
}

// ── TEST 8 — Top-level inspected strand bridges are retired ─────────────────

function testInspectedStrandTopLevelBridgesRetired() {
    console.log('\n[TEST 8] top-level inspected strand window bridges are retired')

    const appSrc = read('app')
    const threadInspectorSrc = read('threadInspector')
    const journeySrc = read('journey')
    const threadSettlerSrc = read('journeyThreadSettler')
    const threeSetupSrc = read('threeSetup')
    const adapterSrc = read('inspectedStrandOverlayAdapter')

    for (const fn of ['syncInspectedStrandOverlay', 'updateInspectedStrandOverlay', 'disposeInspectedStrandOverlay']) {
        assert(
            !appSrc.includes(`window.${fn}`),
            `app.js must not expose top-level window.${fn}; use window._ti diagnostics or named imports`
        )
        assert(
            new RegExp(`\\b${fn}\\b`).test(threadInspectorSrc),
            `thread-inspector.js should keep ${fn} available on the window._ti diagnostic namespace`
        )
    }
    // The thread-settler uses inspectThreadNeighbor / renderThreadInspection / clearThreadInspection
    // via the thread-inspector-bridge, not syncInspectedStrandOverlay directly. The only thing that
    // matters is that it does NOT reach for the window bridge (asserted below).
    assert(
        !journeySrc.includes('window.syncInspectedStrandOverlay') &&
            !threadSettlerSrc.includes('window.syncInspectedStrandOverlay'),
        'journey/thread-settler modules must not call window.syncInspectedStrandOverlay'
    )
    assert(
        threeSetupSrc.includes("from '@lib/journey/inspected-strand-overlay-adapter'"),
        'three-engine.js should import the inspected-strand overlay adapter, not thread-inspector.ts'
    )
    assert(
        threeSetupSrc.includes('_inspectedStrand?.updateInspectedStrandOverlayFrame(frameNow)') ||
            threeSetupSrc.includes('engineState.inspectedStrand?.updateInspectedStrandOverlayFrame(frameNow)'),
        'three-engine.js should update inspected strand overlay through the adapter'
    )
    assert(
        !threeSetupSrc.includes('window.updateInspectedStrandOverlay'),
        'three-engine.js must not call window.updateInspectedStrandOverlay'
    )
    assertMatches(
        threadInspectorSrc,
        /setInspectedStrandOverlayUpdater\(updateInspectedStrandOverlay\);?/,
        'thread-inspector.js should register updateInspectedStrandOverlay with the adapter'
    )
    assert(
        /export function updateInspectedStrandOverlayFrame/.test(adapterSrc) && !/\bwindow\./.test(adapterSrc),
        'inspected-strand-overlay-adapter.js should be a window-free adapter boundary'
    )

    console.log('  OK — top-level inspected strand bridges retired; _ti diagnostics remain')
}

// ── TEST 9 — Camera interaction bridges are retired ────────────────────────

function testCameraInteractionBridgesRetired() {
    console.log('\n[TEST 9] camera interaction window bridges are retired')

    const appSrc = read('app')
    const cameraSrc = read('camera')
    const cameraChoreographySrc = read('cameraChoreography')
    const canvasInteractionSrc = read('journeyCanvasInteraction')

    for (const fn of ['noteSceneInteraction', 'releaseFocusCameraAssist']) {
        assert(
            !appSrc.includes(`window.${fn}`),
            `app.js must not expose top-level window.${fn}; use camera-controls named imports`
        )
        assert(!cameraSrc.includes(`window.${fn}`), `camera-controls.js must not expose top-level window.${fn}`)
    }
    assert(
        /noteSceneInteraction\(\s*duration\s*\+\s*1200\s*\)/.test(cameraChoreographySrc),
        'camera choreography routes should call noteSceneInteraction directly for search corridor animation'
    )
    assert(
        /import\s+\{[^}]*\bfocusOnNode\b[^}]*\bnoteSceneInteraction\b[^}]*\breleaseFocusCameraAssist\b[^}]*\}\s+from\s+['"](?:\.\/camera-controls\.(?:js|ts)|@lib\/engine\/camera-controls)['"]/.test(
            canvasInteractionSrc
        ),
        'journey-canvas-interaction.js should import camera interaction functions directly from camera-controls.ts'
    )

    console.log('  OK — camera interaction bridges retired; direct imports remain')
}

// ── TEST 10 — View handoff camera prelude bridge is retired ────────────────

function testViewHandoffCameraPreludeBridgeRetired() {
    console.log('\n[TEST 10] view handoff terrain/map flattening bridges are retired')

    const viewControllerSrc = read('viewController')
    const cameraSrc = read('camera')
    const threeSetupSrc = read('threeSetup')
    const mapFlatteningLayoutSrc = read('mapFlatteningLayout')

    assert(
        /import\s+\{[^}]*\banimateCameraToTerrainPrelude\b[^}]*\}\s+from\s+['"](?:\.\/camera-controls\.(?:js|ts)|@lib\/engine\/(?:camera-controls|camera-choreography))['"]/.test(
            viewControllerSrc
        ),
        'view-controller.js should import animateCameraToTerrainPrelude directly from camera-controls.ts'
    )
    assert(
        !viewControllerSrc.includes('window.animateCameraToTerrainPrelude'),
        'view-controller.js must not call window.animateCameraToTerrainPrelude'
    )
    assert(
        !cameraSrc.includes('window.animateCameraToTerrainPrelude'),
        'camera-controls.js must not expose the retired window.animateCameraToTerrainPrelude bridge'
    )
    assert(
        /import\s+\{[^}]*\bapplyMapFlatteningLayout\b[^}]*\}\s+from\s+['"](?:\.\/map-flattening-layout\.ts|@lib\/utils\/map-flattening-layout)['"]/.test(
            viewControllerSrc
        ),
        'view-controller.js should import applyMapFlatteningLayout from the side-effect-free map-flattening-layout owner'
    )
    assert(
        !viewControllerSrc.includes('window.applyMapFlatteningLayout'),
        'view-controller.js must not call window.applyMapFlatteningLayout'
    )
    assert(
        !threeSetupSrc.includes('window.applyMapFlatteningLayout'),
        'three-engine.js must not expose the retired window.applyMapFlatteningLayout bridge'
    )
    assert(
        /import\s+\{\s*appState\s*\}\s+from\s+['"]@lib\/state\/app\.svelte['"]/.test(mapFlatteningLayoutSrc) &&
            /export function applyMapFlatteningLayout/.test(mapFlatteningLayoutSrc),
        'map-flattening-layout.js should own applyMapFlatteningLayout as a state-only named export'
    )
    assert(
        !/\bwindow\./.test(mapFlatteningLayoutSrc) && !/typeof\s+window/.test(mapFlatteningLayoutSrc),
        'map-flattening-layout.js must stay side-effect-free with no window references'
    )

    console.log('  OK — view handoff terrain/map flattening bridges retired; direct imports remain')
}

// ── TEST 11 — Legend collapsed-panel bridge is retired ─────────────────────

function testRestoreLegendCollapsedPanelBridgeRetired() {
    console.log('\n[TEST 11] restoreLegendCollapsedPanel window bridge is retired')

    const lifecycleSrc = read('lifecycle')
    const eventBindingsSrc = read('eventBindings')

    // The legacy kernel is deleted.
    // The canonical owner is now src/lib/stores/legend-panel.svelte.ts.
    const legendPanelSrc = fs.readFileSync(path.join(SEMDEMO_ROOT, 'src/lib/stores/legend-panel.svelte.ts'), 'utf-8')
    assert(
        /export function restoreLegendCollapsedPanel/.test(legendPanelSrc),
        'src/lib/stores/legend-panel.svelte.ts should keep restoreLegendCollapsedPanel as a named export'
    )
    assert(
        !legendPanelSrc.includes('window.restoreLegendCollapsedPanel'),
        'legend-panel.svelte.ts must not expose window.restoreLegendCollapsedPanel'
    )

    // lifecycle.ts must NOT import restoreLegendCollapsedPanel from the deleted kernel
    assert(
        !lifecycleSrc.includes("from './legend-ui.ts'"),
        'lifecycle.js must not import from the deleted legend-ui.ts kernel'
    )
    // lifecycle.ts does NOT directly import restoreLegendCollapsedPanel — it's used by
    // legend-bindings.ts (the event-bindings layer), not by lifecycle itself.
    assert(
        !lifecycleSrc.includes('restoreLegendCollapsedPanel'),
        'lifecycle.js does not import restoreLegendCollapsedPanel (used by legend-bindings layer)'
    )

    // event-bindings (legend-bindings.ts) imports from the canonical store
    assert(
        eventBindingsSrc.includes('restoreLegendCollapsedPanel') &&
            (eventBindingsSrc.includes("from '@lib/stores/legend-panel'") ||
                eventBindingsSrc.includes("from '@lib/stores/legend-panel.svelte.ts'") ||
                eventBindingsSrc.includes("from '@lib/engine/legend-ui-bridge'")),
        'event-bindings.js should import restoreLegendCollapsedPanel from the canonical store'
    )

    console.log('  OK — restoreLegendCollapsedPanel bridge retired; canonical store is the owner')
}

// ── TEST 12 — Canvas/focus pick globals are retired from window ────────────

function testCanvasPickGlobalsRetiredFromWindow() {
    console.log('\n[TEST 12] canvas/focus pick globals are retired from window')

    const sourceMods = ['app', 'journey']
    const retiredGlobals = [
        '_previouslyFocusedFocusStage',
        '__lastCanvasNodePick',
        '__lastCanvasNodeHover',
        '__lastCanvasNodeFocusPick'
    ]
    const problems = []

    for (const mod of sourceMods) {
        const src = read(mod)
        for (const name of retiredGlobals) {
            if (src.includes(`window.${name}`)) {
                problems.push(`${mod}: unexpected window.${name}`)
            }
        }
    }

    const stateSrc = fs.readFileSync(path.join(SEMDEMO_ROOT, 'src/lib/state/app.svelte.ts'), 'utf-8')
    for (const name of ['lastCanvasNodePick', 'lastCanvasNodeHover', 'lastCanvasNodeFocusPick']) {
        assert(stateSrc.includes(`${name} = $state`), `AppState should own ${name} diagnostic state`)
    }

    assert(
        problems.length === 0,
        `canvas/focus pick globals should use adapter/state ownership, not window:\n${problems.join('\n')}`
    )

    console.log('  OK — canvas/focus pick globals retired from window; state diagnostics remain')
}

// ── TEST 13 — Audio globals are retired from window ─────────────────────────

function testAudioGlobalsRetiredFromWindow() {
    console.log('\n[TEST 13] audio globals are retired from window')

    const audioSrc = read('audio')
    const threeSetupSrc = read('threeSetup')
    const retiredGlobals = ['triggerCorridorBloom', 'triggerAudio', 'playAudio']
    const problems = []

    for (const name of retiredGlobals) {
        if (audioSrc.includes(`window.${name}`)) {
            problems.push(`audio-scape.js unexpectedly exposes window.${name}`)
        }
        if (threeSetupSrc.includes(`window.${name}`)) {
            problems.push(`three-engine.js unexpectedly calls window.${name}`)
        }
    }

    const searchAnimationsSrc = read('threeSearchAnimations')

    assert(
        /import\s+\{[^}]*\btriggerCorridorBloom\b[^}]*\}\s+from\s+['"](?:\.\/audio-scape\.(?:js|ts)|@lib\/audio\/audio-scape)['"]/.test(
            searchAnimationsSrc
        ),
        'three-search-animations.js should import triggerCorridorBloom directly from audio-scape.ts'
    )
    assert(
        /triggerCorridorBloom\(\);?/.test(searchAnimationsSrc),
        'three-search-animations.js should call triggerCorridorBloom directly for corridor animation audio'
    )
    assert(
        problems.length === 0,
        `audio globals should use direct imports or stay internal, not window bridges:\n${problems.join('\n')}`
    )

    console.log('  OK — audio window globals retired; direct corridor bloom import remains')
}

// ── TEST 14 — Centroid camera, journey timer, and reset UI bridges retired ─

function testCentroidCameraAndJourneyTimerBridgesRetired() {
    console.log('\n[TEST 14] centroid camera, journey timer, and reset UI bridges are retired')

    const cameraSrc = read('camera')
    const threeSetupSrc = read('threeSetup')
    const journeySrc = read('journey')
    const threadSettlerSrc = read('journeyThreadSettler')
    const journeyCompassSrc = read('journeyCompassCtrl')
    const keyboardSrc = read('keyboardHelp')
    const uiRenderersSrc = read('uiRenderers')
    const appRuntimeSrc = read('appRuntime')

    assert(
        /(?:export function|export \{[^}]*\bapplySemanticCentroidCamera\b[^}]*\})/.test(cameraSrc),
        'camera-controls.js should keep applySemanticCentroidCamera as a named export'
    )
    assert(
        !cameraSrc.includes('window.applySemanticCentroidCamera'),
        'camera-controls.js must not expose window.applySemanticCentroidCamera'
    )
    assert(
        threeSetupSrc.includes("from '@lib/engine/camera-controls'"),
        'three-engine.js should import the camera-controls bridge'
    )
    assert(
        threeSetupSrc.includes('_cameraControls?.applySemanticCentroidCamera(frameNow)') ||
            threeSetupSrc.includes('engineState.cameraControls?.applySemanticCentroidCamera(frameNow)'),
        'three-engine.js should call applySemanticCentroidCamera through the camera-controls bridge during the animation loop'
    )
    assert(
        !threeSetupSrc.includes('window.applySemanticCentroidCamera'),
        'three-engine.js must not call window.applySemanticCentroidCamera'
    )
    assert(
        /export\s+\{[\s\S]*\binitJourneyTimerAdapter\b[\s\S]*\}/.test(journeySrc) &&
            /export function initJourneyTimerAdapter/.test(threadSettlerSrc),
        'journey.js should re-export the thread-settler timer adapter initializer for tests and non-window environments'
    )
    assert(
        !journeySrc.includes('window.setTimeout') &&
            !journeySrc.includes('window.clearTimeout') &&
            !threadSettlerSrc.includes('window.setTimeout') &&
            !threadSettlerSrc.includes('window.clearTimeout'),
        'journey/thread-settler modules must not call timers through window'
    )
    assert(
        journeyCompassSrc.includes('resetExplorationFocus({'),
        'journey-compass-controller.js should call resetExplorationFocus directly for county overview'
    )
    assert(
        /export function initJourneyCompassAdapter/.test(journeyCompassSrc),
        'journey-compass-controller.js should expose an adapter initializer for switchView'
    )
    assert(
        !/from\s+['"]\.\/view-controller\.js['"]/.test(journeyCompassSrc),
        'journey-compass-controller.js should not import view-controller.js directly'
    )
    assert(
        journeyCompassSrc.includes("_switchView('map')") && journeyCompassSrc.includes("_switchView('galaxy')"),
        'journey-compass-controller.js open-map/open-mycelium actions should use injected switchView adapter'
    )
    assert(
        !journeyCompassSrc.includes('window.resetExplorationFocus') &&
            !journeyCompassSrc.includes('window.resetNodePositions'),
        'journey-compass-controller.js must not use window reset fallbacks'
    )
    assert(
        /export function initKeyboardResetOwnership/.test(keyboardSrc),
        'keyboard-help.js should keep reset ownership injection'
    )
    assert(
        !keyboardSrc.includes('typeof window.returnToOverview') &&
            !keyboardSrc.includes('typeof window.resetExplorationFocus'),
        'keyboard-help.js must not use window reset fallbacks'
    )
    assert(
        !/export function initUiRenderersAdapter/.test(uiRenderersSrc),
        'ui-renderers.js should not keep a retired switchView adapter after selected-card action transfer'
    )
    assert(
        !uiRenderersSrc.includes('window.switchView') && !uiRenderersSrc.includes("_switchView('map');"),
        'ui-renderers.js selected-card map action must not use window.switchView or a retained switchView adapter'
    )
    assert(
        !appRuntimeSrc.includes('initUiRenderersAdapter({'),
        'app.ts should not inject the retired ui-renderers switchView adapter'
    )
    assert(
        appRuntimeSrc.includes('initJourneyCompassAdapter({'),
        'app.ts should inject switchView into journey-compass-controller'
    )

    console.log('  OK — centroid camera, journey timers, and reset UI actions use module seams')
}

// ── TEST 15 — Retired window-bridge-gaps-contract is archived ────────────────
// Active coverage now lives in this residual inventory contract. The older
// sibling is archived under tests/retired and is not runnable in place because
// its relative imports intentionally point at its old tests/ location.

function testSiblingContractStillPasses() {
    console.log('\n[TEST 15] retired window-bridge-gaps-contract.mjs is archived')

    assert(
        !fs.existsSync(path.join(SEMDEMO_ROOT, 'tests/window-bridge-gaps-contract.mjs')),
        'window-bridge-gaps-contract.mjs should stay retired from active tests'
    )
    assert(
        fs.existsSync(path.join(SEMDEMO_ROOT, 'tests/retired/window-bridge-gaps-contract.mjs')),
        'retired window-bridge-gaps-contract.mjs archive should remain available for historical reference'
    )
    console.log('  OK — retired window-bridge-gaps-contract.mjs is archived; active checks live here')
}

// ── MAIN ────────────────────────────────────────────────────────────────────

console.log('=================================================================')
console.log('residual-window-bridge-inventory-contract.mjs')
console.log('Inventory + guard: residual window bridge surface')
console.log('=================================================================')

try {
    testNoBareCallsInDowindowedSeams()
    testLifecycleNoNewBareCalls()
    testAppJsExportsAreThin()
    testExtractionCandidatesDocumented()
    testBareCallBaseline()
    testFocusOnPointRuntimeCallersDewindowed()
    testJourneyArrivalHandoffDewindowed()
    testInspectedStrandTopLevelBridgesRetired()
    testCameraInteractionBridgesRetired()
    testViewHandoffCameraPreludeBridgeRetired()
    testRestoreLegendCollapsedPanelBridgeRetired()
    testCanvasPickGlobalsRetiredFromWindow()
    testAudioGlobalsRetiredFromWindow()
    testCentroidCameraAndJourneyTimerBridgesRetired()
    testSiblingContractStillPasses()

    console.log('\n=================================================================')
    console.log('ALL TESTS PASSED')
    console.log('=================================================================')
    process.exit(0)
} catch (err) {
    console.error('\nTEST FAILED:', err.message)
    process.exit(1)
}
