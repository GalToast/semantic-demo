/**
 * journey-thread-inspector-contract.mjs
 *
 * Fast Node contract test for the journey + thread-inspector cluster.
 * Coverage:
 *   1. No ghost teardown references in journey.js and thread-inspector.js
 *   2. setSemanticDiveMode exit path guard (inside-cue surface gate)
 *   3. applyPointFilterColors brightness factor ranges
 *   4. buildRouteTraceMaterial returns ShaderMaterial with AdditiveBlending
 *   5. getCanvasNodePickingMode URL override (?picking=nearest)
 *   6. Thread-inspector dual candidates - semantic-first strategy
 *
 * Runs in Node - no Playwright, no browser, no DOM.
 * Source-only assertions via string search + structural analysis.
 *
 * Usage:
 *   node tests/journey-thread-inspector-contract.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { resolveSource } from './source-path.mjs'

const SEMDEMO_ROOT = path.resolve(process.cwd())
const JOURNEY_PATH = resolveSource('src/lib/journey/journey.ts', SEMDEMO_ROOT)
const JOURNEY_POINT_COLOR_PATH = resolveSource('src/lib/journey/point-color.ts', SEMDEMO_ROOT)
// @ts-ignore
const JOURNEY_CANVAS_INTERACTION_PATH = resolveSource('src/lib/journey/canvas-interaction.ts', SEMDEMO_ROOT)
const JOURNEY_CANVAS_NODE_PICKING_PATH = resolveSource('src/lib/journey/canvas-node-picking.ts', SEMDEMO_ROOT)
const JOURNEY_CANVAS_HIT_TEST_PATH = resolveSource('src/lib/journey/canvas-hit-test.ts', SEMDEMO_ROOT)
const THREAD_INSPECTOR_PATH = resolveSource('src/lib/journey/thread-inspector.ts', SEMDEMO_ROOT)
const threadInspectorCombinedSrc = () => {
    const paths = [
        resolveSource('src/lib/journey/thread-inspector-state.ts', SEMDEMO_ROOT),
        resolveSource('src/lib/journey/thread-inspector-webgl.ts', SEMDEMO_ROOT),
        resolveSource('src/lib/journey/thread-inspector-render.ts', SEMDEMO_ROOT),
        resolveSource('src/lib/journey/thread-inspector-adapter.ts', SEMDEMO_ROOT),
        // PR-T2: Svelte component now owns the button text logic (was
        // previously the imperative render.ts). Include it in the
        // combined source so text-content contract assertions
        // ('Current Stop', 'Pin Connection', etc.) find the strings.
        resolveSource('src/components/ThreadInspector.svelte', SEMDEMO_ROOT),
        // PR-T2 extraction: ThreadInspectorPanel.svelte now owns the panel
        // content + button text logic extracted from ThreadInspector.svelte.
        resolveSource('src/lib/components/journey/ThreadInspectorPanel.svelte', SEMDEMO_ROOT)
    ]
    return paths.map((p) => (fs.existsSync(p) ? fs.readFileSync(p, 'utf-8') : '')).join('\n')
}
const JOURNEY_THREAD_MODEL_PATH = resolveSource('src/lib/journey/thread-model.ts', SEMDEMO_ROOT)
// retired journey-thread-model-bridge.ts in Svelte 5 modernization sweep
// @ts-ignore
const JOURNEY_WEBGL_PATH = resolveSource('src/lib/journey/webgl.ts', SEMDEMO_ROOT)
const JOURNEY_ROUTE_TRACE_PATH = resolveSource('src/lib/journey/route-trace.ts', SEMDEMO_ROOT)
const JOURNEY_SEMANTIC_OVERLAY_PATH = resolveSource('src/lib/journey/semantic-overlay.ts', SEMDEMO_ROOT)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function assert(cond, msg) {
    if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`)
}

function assertContains(haystack, needle, label) {
    const found = haystack.includes(needle)
    assert(found, `${label}: expected source to contain "${needle}", but it was not found`)
}

function assertNotContains(haystack, needle, label) {
    const found = haystack.includes(needle)
    assert(!found, `${label}: source should NOT contain "${needle}" (removed dead code), but it was found`)
}

// Whitespace/paren-tolerant matcher for ternary brightness factors that a style
// sweep (no-semicolons, multi-line ternaries) may reflow across lines. Matches
// the value sequence regardless of formatting, with optional parentheses.
function assertMatches(haystack, regex, label) {
    assert(regex.test(haystack), `${label}: expected source to match ${regex}, but it did not`)
}

function getThreadInspectorDiagnosticBlock(src) {
    const probeStart = src.indexOf("registerDiagnosticProbe('_ti', {")
    if (probeStart !== -1) {
        const openIdx = src.indexOf('{', probeStart)
        let depth = 0
        for (let i = openIdx; i < src.length; i++) {
            const ch = src[i]
            if (ch === '{') depth++
            else if (ch === '}') {
                depth--
                if (depth === 0) return src.slice(probeStart, i + 1)
            }
        }
    }

    const hasGated = src.includes('if (window.__DEBUG_PROBES__)')
    if (hasGated) {
        const gatedStart = src.indexOf('if (window.__DEBUG_PROBES__)')
        const tiStart = src.indexOf('window._ti = {', gatedStart)
        assert(tiStart !== -1, 'window._ti = { found inside __DEBUG_PROBES__ gate')
        const tiEnd = src.indexOf('};', tiStart)
        assert(tiEnd !== -1, '_ti block terminator found')
        return src.slice(tiStart, tiEnd + 2)
    }

    const tiStart = src.indexOf('window._ti = {')
    if (tiStart === -1) return ''
    const tiEnd = src.indexOf('};', tiStart)
    return src.slice(tiStart, tiEnd + 2)
}

// ---------------------------------------------------------------------------
// TEST 1: No ghost teardown references in journey.js and thread-inspector.js
// ---------------------------------------------------------------------------

function testNoGhostTeardownReferences() {
    console.log('\n[TEST] No ghost teardown references in journey.js and thread-inspector.ts')

    const journeySrc = fs.readFileSync(JOURNEY_PATH, 'utf-8')
    const threadInspectorSrc = threadInspectorCombinedSrc()

    const ghostTerms = [
        'ghostTeardown',
        'ghost-teardown',
        'trailGhostTeardown',
        'ghostStrandTeardown',
        '__ghost',
        'disposeGhost',
        'killGhost',
        'ghostLineTeardown',
        'teardownGhost',
        'ghostTrailTeardown',
        'autoPin',
        'auto-pin'
    ]

    for (const term of ghostTerms) {
        assertNotContains(journeySrc, term, 'journey.ts')
        assertNotContains(threadInspectorSrc, term, 'thread-inspector.ts')
    }

    // 'disqualified-ghosts' is a valid story name - must appear in story-prompt context only
    const tiGhostIdx = threadInspectorSrc.indexOf('disqualified-ghosts')
    assert(tiGhostIdx === -1, 'thread-inspector.js: "disqualified-ghosts" should not appear at all')

    console.log('  OK No ghost teardown references found')
}

// ---------------------------------------------------------------------------
// TEST 2: setSemanticDiveMode exit path guard
// ---------------------------------------------------------------------------

function testSemanticDiveModeExitPath() {
    console.log('\n[TEST] setSemanticDiveMode exit path guard')

    const journeySrc = fs.readFileSync(JOURNEY_PATH, 'utf-8')

    // setSemanticDiveMode exit path must gate clearThreadInspection on surface === 'inside-cue'
    // for preserveJourney=true, and call clearThreadInspection with preserveJourney=false for other surfaces.
    // The new pattern uses: } else { if (surface === 'inside-cue') { preserveJourney:true } else { preserveJourney:false } }
    assert(
        /document\.body\??\.dataset\.threadInspectSurface\s*===\s*['"]inside-cue['"]/.test(journeySrc),
        "setSemanticDiveMode exit path checks threadInspectSurface === 'inside-cue'"
    )

    // clearThreadInspection with preserveJourney: true must exist for inside-cue path
    assertContains(
        journeySrc,
        'clearThreadInspection({ force: true, preserveJourney: true })',
        'inside-cue path calls clearThreadInspection with force + preserveJourney: true'
    )

    // clearThreadInspection with preserveJourney: false must exist for non-inside-cue paths
    assertContains(
        journeySrc,
        'clearThreadInspection({ force: true, preserveJourney: false })',
        'non-inside-cue path calls clearThreadInspection with force + preserveJourney: false'
    )

    // setSemanticDiveMode must not own the window bridge here; lifecycle owns it.
    assertNotContains(
        journeySrc,
        'window.setSemanticDiveMode = setSemanticDiveMode',
        'setSemanticDiveMode window bridge in journey'
    )

    console.log('  OK setSemanticDiveMode exit path guard verified')
}

// ---------------------------------------------------------------------------
// TEST 3: applyPointFilterColors factor ranges
// ---------------------------------------------------------------------------

function testApplyPointFilterColorsFactorRanges() {
    console.log('\n[TEST] applyPointFilterColors brightness factor ranges')

    const pointColorSrc = fs.readFileSync(JOURNEY_POINT_COLOR_PATH, 'utf-8')

    // FOCUS_MEMBER_MIN_FLOOR must be 0.65 (applied in pocket mode); local minFloor is derived from it
    assertContains(pointColorSrc, 'const FOCUS_MEMBER_MIN_FLOOR = 0.65', 'FOCUS_MEMBER_MIN_FLOOR = 0.65')
    assertContains(pointColorSrc, 'Math.max(raw, minFloor)', 'minFloor applied via Math.max')

    // Trail mode unvisited factor must be >= 0.08 (not invisible)
    assertMatches(
        pointColorSrc,
        /isVisited\s*\?\s*1\.18\s*:\s*\(?\s*semanticFocus\s*\?\s*0\.24\s*:\s*0\.18\s*\)?/,
        'trail mode unvisited factor >= 0.18'
    )
    assertMatches(pointColorSrc, /isVisited\s*\?\s*1\.18\s*:\s*0\.28/, 'trail mode pre-trailIndices unvisited factor')

    // Pocket mode non-focusLocalIndices factor now derives from FIELD_BG_RAW
    // (WIP refactor renamed the old 0.22 literal into FOCUS_FIELD_RAW_* floor
    // constants; FIELD_BG_RAW = pocketActive ? 0.09 : semanticFocus ? 0.2 : 0.16).
    assertMatches(
        pointColorSrc,
        /isVisited\s*\?\s*1\.28\s*:\s*FIELD_BG_RAW/,
        'pocket mode non-focusLocal factor uses FIELD_BG_RAW floor'
    )

    // Bloom mode dimmed factor must be 0.08 (invisible)
    assertContains(pointColorSrc, 'visible ? 1 : 0.08', 'invisible factor is 0.08')

    // Focus anchor factor must be brightest (> 2.0)
    assertMatches(pointColorSrc, /i\s*===\s*_state\.navState\.focusedIndex\s*\?\s*2\.14/, 'focus anchor factor 2.14')

    console.log('  OK applyPointFilterColors factor ranges verified')
}

// ---------------------------------------------------------------------------
// TEST 4: buildRouteTraceMaterial returns ShaderMaterial with AdditiveBlending
// ---------------------------------------------------------------------------

function testBuildRouteTraceMaterial() {
    console.log('\n[TEST] buildRouteTraceMaterial shader material')

    const webglSrc = fs.readFileSync(JOURNEY_ROUTE_TRACE_PATH, 'utf-8')

    // Must return ShaderMaterial (form: THREE.ShaderMaterial OR bare ShaderMaterial)
    const hasThreeForm = webglSrc.includes('return new THREE.ShaderMaterial({')
    const hasBareForm = webglSrc.includes('return new ShaderMaterial({')
    assert(
        hasThreeForm || hasBareForm,
        'buildRouteTraceMaterial returns ShaderMaterial (three-prefixed or bare import form)'
    )

    // Must have depthWrite: false, depthTest: false
    assertContains(webglSrc, 'depthWrite: false', 'depthWrite: false in route trace material')
    assertContains(webglSrc, 'depthTest: false', 'depthTest: false in route trace material')

    // Must have AdditiveBlending
    const hasThreeBlend = webglSrc.includes('blending: THREE.AdditiveBlending')
    const hasBareBlend = webglSrc.includes('blending: AdditiveBlending')
    assert(hasThreeBlend || hasBareBlend, 'AdditiveBlending in route trace material')

    // Shader must declare time uniform for animation
    assertContains(webglSrc, 'uniform float time;', 'time uniform declared in fragment shader')

    // Must update time uniform in refreshRouteTraceOverlay
    assertContains(
        webglSrc,
        'material.uniforms.time!.value = now / 1000',
        'time uniform updated in updateRouteTraceOverlayPositions'
    )

    // Semantic dive mode must boost baseOpacity to 0.34
    assertContains(webglSrc, 'baseOpacity!.value = 0.34', 'semantic dive mode boosts baseOpacity to 0.34')
    assertContains(webglSrc, 'opacity!.value = 0.34', 'semantic dive mode boosts opacity to 0.34')

    console.log('  OK buildRouteTraceMaterial verified')
}

// ---------------------------------------------------------------------------
// TEST 5: getCanvasNodePickingMode URL override
// ---------------------------------------------------------------------------

function testGetCanvasNodePickingMode() {
    console.log('\n[TEST] getCanvasNodePickingMode URL override')

    const canvasInteractionSrc = fs.readFileSync(JOURNEY_CANVAS_NODE_PICKING_PATH, 'utf-8')
    const canvasHitTestSrc = fs.readFileSync(JOURNEY_CANVAS_HIT_TEST_PATH, 'utf-8')

    // Must read URL search params
    assertContains(
        canvasInteractionSrc,
        'new URLSearchParams(window.location.search)',
        'URLSearchParams used for picking mode'
    )

    // Must check ?picking= parameter
    assertContains(canvasInteractionSrc, "get('picking')", 'get("picking") called on URLSearchParams')

    // Must return 'nearest' when urlMode === 'nearest'
    assertContains(canvasInteractionSrc, "urlMode === 'nearest'", 'nearest URL mode check')
    assertContains(
        canvasInteractionSrc,
        "return urlMode === 'nearest' || datasetMode === 'nearest' ? 'nearest' : 'raycast'",
        'fallback to raycast'
    )

    // Touch/pen must use 34px radius
    assertContains(canvasHitTestSrc, "pointerType === 'touch' || pointerType === 'pen'", 'touch/pen pointer type check')
    const has34 = canvasHitTestSrc.includes('return 34') || canvasHitTestSrc.includes('return 34;')
    assert(has34, 'touch/pen returns 34px')
    assertContains(canvasHitTestSrc, 'hasCoarsePointer() ? 34 : 26', 'coarse pointer uses 34px else 26px')

    console.log('  OK getCanvasNodePickingMode URL override verified')
}

// ---------------------------------------------------------------------------
// TEST 6: Thread-inspector dual candidates - semantic-first strategy
// ---------------------------------------------------------------------------

function testThreadInspectorSemanticFirst() {
    console.log('\n[TEST] Thread-inspector dual candidates - semantic-first strategy')

    const threadInspectorSrc = threadInspectorCombinedSrc()
    const journeyModelSrc = fs.readFileSync(JOURNEY_THREAD_MODEL_PATH, 'utf-8')
    const journeySrc = fs.readFileSync(JOURNEY_PATH, 'utf-8')

    // Thread inspector split into state/webgl/render/adapter; the helpers are
    // re-exported by journey.ts and neighborhood.ts as the public surface.
    assert(
        threadInspectorSrc.includes('getSemanticThreadCandidates') ||
            journeySrc.includes('getSemanticThreadCandidates') ||
            fs
                .readFileSync(resolveSource('src/lib/journey/neighborhood.ts', SEMDEMO_ROOT), 'utf-8')
                .includes('getSemanticThreadCandidates'),
        'thread-inspector or journey re-exports getSemanticThreadCandidates'
    )
    assertContains(
        journeyModelSrc,
        'export function getSemanticThreadCandidates',
        'journey-thread-model exports getSemanticThreadCandidates'
    )

    assert(
        threadInspectorSrc.includes('getThreadCandidatesForIndex') ||
            journeySrc.includes('getThreadCandidatesForIndex') ||
            fs
                .readFileSync(resolveSource('src/lib/journey/neighborhood.ts', SEMDEMO_ROOT), 'utf-8')
                .includes('getThreadCandidatesForIndex'),
        'thread-inspector or journey re-exports getThreadCandidatesForIndex'
    )
    assertContains(
        journeyModelSrc,
        'export function getThreadCandidatesForIndex',
        'journey-thread-model exports getThreadCandidatesForIndex'
    )

    // getThreadCandidatesForIndex must use semantic-first: return semantic if length > 0
    assertContains(
        journeyModelSrc,
        'if (semanticCandidates.length) return semanticCandidates',
        'journey-thread-model: semantic-first strategy'
    )

    // journey.ts must consume the thread model directly, not
    // through retired engine/adapters or a resurrected direct legacy import.
    assertContains(journeySrc, "from './thread-model'", 'journey.ts imports from thread-model directly')

    // thread-inspector.js must NOT re-implement normalizeLeadId; it must use the shared version.
    assert(journeyModelSrc.includes('function normalizeLeadId'), 'journey-thread-model has canonical normalizeLeadId')
    assert(
        journeyModelSrc.includes('export function normalizeLeadId'),
        'journey-thread-model normalizes exported normalizeLeadId'
    )
    assertNotContains(
        threadInspectorSrc,
        'function normalizeLeadId(',
        'thread-inspector does not define local normalizeLeadId'
    )

    // If the optional _ti diagnostic seam exists, it must expose the shared
    // candidate helpers. The canonical contract is the named re-export above.
    const tiBlock = getThreadInspectorDiagnosticBlock(threadInspectorSrc)
    if (tiBlock.length > 0) {
        assert(tiBlock.includes('getSemanticThreadCandidates,'), 'window._ti.getSemanticThreadCandidates')
        assert(tiBlock.includes('getGeometricThreadCandidates,'), 'window._ti.getGeometricThreadCandidates')
        assert(tiBlock.includes('getThreadCandidatesForIndex,'), 'window._ti.getThreadCandidatesForIndex')
        assert(tiBlock.includes('exploreThreadNeighbor'), 'window._ti.exploreThreadNeighbor diagnostic access')
    }

    console.log('  OK thread-inspector dual candidates strategy verified')
}

// ---------------------------------------------------------------------------
// TEST 6.5: Shared strand-continuity owner
// ---------------------------------------------------------------------------

function testSharedStrandContinuityOwner() {
    console.log('\n[TEST] Shared strand-continuity owner')

    const journeySrc = fs.readFileSync(JOURNEY_PATH, 'utf-8')
    const threadInspectorSrc = threadInspectorCombinedSrc()
    const strandContinuityPath = resolveSource('src/lib/utils/strand-continuity.ts', SEMDEMO_ROOT)
    const strandContinuitySrc = fs.readFileSync(strandContinuityPath, 'utf-8')

    assertContains(strandContinuitySrc, 'export function setStrandContinuityState', 'strand-continuity exports setter')
    assertContains(
        strandContinuitySrc,
        'export function clearStrandContinuityState',
        'strand-continuity exports clearer'
    )
    assertContains(
        strandContinuitySrc,
        "from '@lib/engine/journey-webgl-lazy'",
        'strand-continuity owns arrival handoff overlay imports'
    )

    assert(
        /import\s*\{[^}]*\bsetStrandContinuityState\b[^}]*\bclearStrandContinuityState\b[^}]*\}\s*from\s*['"]\.\/strand-continuity(?:\.ts)?['"]/.test(
            journeySrc
        ) ||
            /import\s*\{[^}]*\bsetStrandContinuityState\b[^}]*\bclearStrandContinuityState\b[^}]*\}\s*from\s*['"]@lib\/utils\/strand-continuity['"]/.test(
                journeySrc
            ) ||
            /import\s*\{[^}]*\bsetStrandContinuityState\b[^}]*\bclearStrandContinuityState\b[^}]*\}\s*from\s*['"]@lib\/engine\/strand-continuity-bridge['"]/.test(
                journeySrc
            ),
        'journey imports shared strand-continuity bridge'
    )
    assert(
        /import\s*\{[^}]*\bsetStrandContinuityState\b[^}]*\bclearStrandContinuityState\b[^}]*\}\s*from\s*['"]\.\/strand-continuity(?:\.ts)?['"]/.test(
            threadInspectorSrc
        ) ||
            /import\s*\{[^}]*\bsetStrandContinuityState\b[^}]*\bclearStrandContinuityState\b[^}]*\}\s*from\s*['"]@lib\/utils\/strand-continuity['"]/.test(
                threadInspectorSrc
            ) ||
            /import\s*\{[^}]*\bsetStrandContinuityState\b[^}]*\bclearStrandContinuityState\b[^}]*\}\s*from\s*['"]@lib\/engine\/strand-continuity-bridge['"]/.test(
                threadInspectorSrc
            ),
        'thread-inspector imports shared strand-continuity bridge'
    )
    assertNotContains(journeySrc, 'export function setStrandContinuityState', 'journey local strand setter removed')
    assertNotContains(journeySrc, 'export function clearStrandContinuityState', 'journey local strand clearer removed')
    assertNotContains(
        threadInspectorSrc,
        'export function setStrandContinuityState',
        'thread-inspector local strand setter removed'
    )
    assertNotContains(
        threadInspectorSrc,
        'export function clearStrandContinuityState',
        'thread-inspector local strand clearer removed'
    )

    console.log('  OK shared strand-continuity owner verified')
}

// ---------------------------------------------------------------------------
// TEST 9: Wave60 - exploreThreadNeighbor stranded phase='arrived' fix
// ---------------------------------------------------------------------------

function testWave60ExploreThreadNeighborSettleBehavior() {
    console.log('\n[TEST] Wave60: exploreThreadNeighbor stranded phase=arrived fix + followTargetsCurrent')

    const tiSrc = threadInspectorCombinedSrc()

    // Timer storage is centralized behind named setTimer/clearTimer helpers.
    // setTimer replaces any existing timer for the same purpose before scheduling.
    const arrivalTimerIdx = tiSrc.indexOf("setTimer('arrival', arrivalDelay")
    const settleTimerIdx = tiSrc.indexOf("setTimer('settle', settleDelay")
    const exploringIdx = tiSrc.indexOf("setStrandContinuityState('exploring'")
    assert(exploringIdx !== -1, "setStrandContinuityState('exploring') found")
    assert(arrivalTimerIdx !== -1, 'arrival setTimer call found')
    assert(settleTimerIdx !== -1, 'settle setTimer call found')
    assert(exploringIdx < arrivalTimerIdx, 'arrival timer is scheduled after exploring phase')
    assert(arrivalTimerIdx < settleTimerIdx, 'settle timer is scheduled after arrival timer')

    // exploreThreadNeighbor must schedule a settle-timeout that transitions phase='arrived' -> 'idle'
    assertContains(tiSrc, "s3?.phase === 'arrived'", 'settle-timeout checks phase === arrived')
    assertContains(
        tiSrc,
        "clearStrandContinuityState('arrival-settled')",
        'settle-timeout calls clearStrandContinuityState with arrival-settled'
    )
    assertContains(tiSrc, 'const settleDelay = options.settleDelay', 'exploreThreadNeighbor computes settleDelay')
    assertContains(
        tiSrc,
        "setTimer('arrival', arrivalDelay",
        'exploreThreadNeighbor schedules arrival timer through strand-continuity owner'
    )
    assertContains(
        tiSrc,
        "setTimer('settle', settleDelay",
        'exploreThreadNeighbor schedules settle timer through strand-continuity owner'
    )

    // renderThreadInspection followBtn must guard on followTargetsCurrent
    assertContains(tiSrc, 'const followTargetsCurrent =', 'renderThreadInspection defines followTargetsCurrent')
    assert(
        /inspectionState\??\.index\s*===\s*getFocusedIndex\(\)/.test(tiSrc),
        'followTargetsCurrent checks index === focusedIndex'
    )
    assert(
        /followBtn\.disabled\s*=\s*!inspectionState\??\.active\s*\|\|\s*!!?followTargetsCurrent\s*\|\|\s*inspectionState\??\.journeyPhase\s*===\s*['"]exploring['"]/.test(
            tiSrc
        ),
        'followTargetsCurrent disables followBtn'
    )
    assertContains(tiSrc, 'Current Stop', 'followTargetsCurrent changes button text to Current Stop')

    console.log('  OK Wave60 exploreThreadNeighbor settle + followTargetsCurrent verified')
}

// ---------------------------------------------------------------------------
// TEST 7: journey-text-helpers extraction
// ---------------------------------------------------------------------------

function testJourneyTextHelpersExtraction() {
    console.log('\n[TEST] journey-text-helpers extraction')

    const journeySrc = fs.readFileSync(JOURNEY_PATH, 'utf-8')
    const jthPath = resolveSource('src/lib/journey/text-helpers.ts', SEMDEMO_ROOT)
    const jthSrc = fs.readFileSync(jthPath, 'utf-8')

    // journey.ts must import from the canonical text helper owner.
    assertContains(journeySrc, "from '@lib/journey/text-helpers'", 'journey.ts imports journey text helpers')

    // journey.js must NOT contain inline truncateMicrocopy definition
    assertNotContains(journeySrc, 'function truncateMicrocopy(text, max = 74)', 'truncateMicrocopy inline removed')

    // journey.js must NOT contain inline getSharedTrailTopicLabel definition
    assertNotContains(journeySrc, 'function getSharedTrailTopicLabel(', 'getSharedTrailTopicLabel inline removed')

    // journey-text-helpers.js must export truncateMicrocopy
    assertContains(jthSrc, 'export function truncateMicrocopy', 'journey-text-helpers exports truncateMicrocopy')

    // journey-text-helpers.js must export getSharedTrailTopicLabel
    assertContains(
        jthSrc,
        'export function getSharedTrailTopicLabel',
        'journey-text-helpers exports getSharedTrailTopicLabel'
    )

    // journey.js previously exported these helpers; the extraction must preserve that public surface.
    const textReExport = journeySrc.match(/export\s*\{[^}]*truncateMicrocopy[^}]*getSharedTrailTopicLabel[^}]*\}/s)
    assert(textReExport, 'journey.js re-exports journey-text-helpers public helpers')

    console.log('  OK journey-text-helpers extraction verified')
}

// ---------------------------------------------------------------------------
// TEST 8: thread-inspector-text-helpers extraction
// ---------------------------------------------------------------------------

function testThreadInspectorTextHelpersExtraction() {
    console.log('\n[TEST] thread-inspector text helpers extraction (via journey-text-helpers)')

    const threadInspectorSrc = threadInspectorCombinedSrc()
    const helperSrc = fs.readFileSync(resolveSource('src/lib/journey/text-helpers.ts', SEMDEMO_ROOT), 'utf-8')

    assertContains(
        threadInspectorSrc,
        "from '@lib/journey/text-helpers'",
        'thread-inspector imports truncateMicrocopy from journey-text-helpers'
    )
    assertNotContains(
        threadInspectorSrc,
        'function truncateMicrocopy(text, limit)',
        'thread-inspector inline truncateMicrocopy removed'
    )
    assertContains(helperSrc, 'export function truncateMicrocopy', 'journey-text-helpers exports truncateMicrocopy')
    assertNotContains(helperSrc, 'window.', 'journey-text-helpers has no window dependency')
    assertNotContains(helperSrc, 'state.', 'journey-text-helpers has no state dependency')
    assertNotContains(helperSrc, 'new THREE', 'journey-text-helpers has no THREE dependency')

    console.log('  OK thread-inspector text helpers extraction verified')
}

// ---------------------------------------------------------------------------
// TEST 10: journey WebGL line shader ownership
// ---------------------------------------------------------------------------

function testJourneyWebglLineShaderOwnership() {
    console.log('\n[TEST] journey WebGL line shader ownership')

    const webglSrc = fs.readFileSync(JOURNEY_ROUTE_TRACE_PATH, 'utf-8')
    const webglSemanticSrc = fs.readFileSync(JOURNEY_SEMANTIC_OVERLAY_PATH, 'utf-8')

    // Route trace uses a plain ShaderMaterial with direct uniforms. It should
    // not depend on LineMaterial's late onBeforeCompile userData.shader path.
    assertContains(webglSrc, 'function buildRouteTraceMaterial()', 'buildRouteTraceMaterial function exists')
    const hasThreeForm2 = webglSrc.includes('return new THREE.ShaderMaterial({')
    const hasBareForm2 = webglSrc.includes('return new ShaderMaterial({')
    assert(hasThreeForm2 || hasBareForm2, 'route trace returns ShaderMaterial')
    assertContains(webglSrc, 'material.uniforms.time!.value = now / 1000', 'route trace updates direct uniforms')

    // Focus semantic lines use LineMaterial; onBeforeCompile must retain the
    // compiled shader handle for custom uniforms, and all update paths must guard it.
    assertContains(webglSemanticSrc, 'buildFocusThreadLineMaterial()', 'buildFocusThreadLineMaterial function exists')
    assertContains(
        webglSemanticSrc,
        'onBeforeCompile = (shader',
        'focus semantic line material assigns onBeforeCompile callback'
    )
    assertContains(
        webglSemanticSrc,
        'userData.shader = shader',
        'buildFocusThreadLineMaterial assigns shader to lineMaterial.userData.shader'
    )
    assertContains(webglSemanticSrc, 'uniform float time;', 'shader declares time uniform')
    assertContains(webglSemanticSrc, 'uniform float semanticScore;', 'shader declares semanticScore uniform')
    assertContains(webglSemanticSrc, 'uniform float reducedMotion;', 'shader declares reducedMotion uniform')
    assertContains(webglSemanticSrc, 'varying float vProgress;', 'shader declares vProgress varying')
    assertContains(webglSemanticSrc, 'varying float vCue;', 'shader declares vCue varying')
    assertContains(webglSemanticSrc, 'varying float vPriority;', 'shader declares vPriority varying')
    assertContains(webglSemanticSrc, 'varying float vLane;', 'shader declares vLane varying')

    assertContains(
        webglSemanticSrc,
        'userData?.shader',
        'refreshFocusSemanticOverlay guards lineMaterial.userData?.shader'
    )
    assertContains(
        webglSemanticSrc,
        'userData.shader.uniforms.semanticScore.value = avgSemanticScore',
        'semanticScore uniform set via guarded access'
    )
    assertContains(
        webglSemanticSrc,
        'mat?.userData?.shader',
        'updateFocusSemanticOverlayPositions guards mat (line.material) userData.shader'
    )
    assertContains(
        webglSemanticSrc,
        'if (!reducedMotion && mat?.uniforms?.time)',
        'updateFocusSemanticOverlayPositions keeps direct-uniform fallback'
    )

    console.log('  OK journey WebGL line shader ownership verified')
}

// ---------------------------------------------------------------------------
// MAIN
// ---------------------------------------------------------------------------

function main() {
    console.log('============================================================')
    console.log('journey-thread-inspector-contract.mjs')
    console.log('Fast contract test: journey + thread-inspector cluster')
    console.log('============================================================')

    try {
        testNoGhostTeardownReferences()
        testSemanticDiveModeExitPath()
        testApplyPointFilterColorsFactorRanges()
        testBuildRouteTraceMaterial()
        testGetCanvasNodePickingMode()
        testThreadInspectorSemanticFirst()
        testSharedStrandContinuityOwner()
        testJourneyTextHelpersExtraction()
        testThreadInspectorTextHelpersExtraction()
        testWave60ExploreThreadNeighborSettleBehavior()
        testJourneyWebglLineShaderOwnership()

        console.log('\n============================================================')
        console.log('ALL TESTS PASSED')
        console.log('============================================================')
        process.exit(0)
    } catch (err) {
        console.error('\nTEST FAILED:', err.message)
        process.exit(1)
    }
}

main()
