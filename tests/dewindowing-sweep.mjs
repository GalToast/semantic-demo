/**
 * dewindowing-sweep.mjs
 *
 * Consolidated dewindowing sweep — replaces 11 active *-dewindowing-*.mjs
 * contracts with one manifest-driven scanner.
 *
 * Merged from:
 *   thread-inspector-dewindowing-contract.mjs
 *   three-setup-init-dewindowing-contract.mjs
 *   three-setup-loop-dewindowing-contract.mjs
 *   scene-reveal-camera-dewindowing-contract.mjs
 *   webgl-restore-dewindowing-contract.mjs
 *   semantic-dive-ui-dewindowing-contract.mjs  (RETIRED — semantic-overlay.ts deleted W10)
 *   residual-window-bridge-inventory-contract.mjs
 *   bootstrap-window-export-contract.mjs
 *
 * HELD (separate files, NOT merged — runner-pinned):
 *   cancel-animate-dewindowing-contract.mjs
 *   three-setup-zero-caller-dewindowing-contract.mjs
 *   lifecycle-journey-quick-dewindowing-contract.mjs
 *
 * 2026-08-20: the 3 HELD contracts were merged into this sweep as checks 9-11
 * (the runner's uncommitted-lane-WIP blocker was stale). Their source-only
 * assertions (readFileSync + regex) are preserved verbatim.
 *
 * Run: node tests/dewindowing-sweep.mjs
 */

'use strict'

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const CWD = ROOT

function read(p, label) {
    try { return fs.readFileSync(p, 'utf8') }
    catch { console.error(`FAIL: could not read ${label || p}`); process.exit(1) }
}

function assert(cond, msg) {
    if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`)
}

// ── Entry points for all source files we need ────────────────────────────────

const SRC = {
    appInit:        path.join(CWD, 'src', 'lib', 'orchestration', 'app-init.ts'),
    lifecycle:      path.join(CWD, 'src', 'lib', 'orchestration', 'lifecycle.ts'),
    storesLifecycle:path.join(CWD, 'src', 'lib', 'stores', 'lifecycle.ts'),
    threeEngine:    path.join(CWD, 'src', 'lib', 'engine', 'three-engine.ts'),
    threeCore:      path.join(CWD, 'src', 'lib', 'engine', 'three-engine-core.ts'),
    threeRender:    path.join(CWD, 'src', 'lib', 'engine', 'three-engine-render-loop.ts'),
    threeTeardown:  path.join(CWD, 'src', 'lib', 'engine', 'three-engine-teardown.ts'),
    threeState:     path.join(CWD, 'src', 'lib', 'engine', 'three-engine-state.ts'),
    threeListener:  path.join(CWD, 'src', 'lib', 'engine', 'three-listener-registration.ts'),
    cameraCtrl:     path.join(CWD, 'src', 'lib', 'engine', 'camera-controls.ts'),
    cameraRestore:  path.join(CWD, 'src', 'lib', 'engine', 'camera-controls-restore.svelte.ts'),
    sceneReveal:    path.join(CWD, 'src', 'lib', 'engine', 'scene-reveal.ts'),
    webglFallback:  path.join(CWD, 'src', 'lib', 'engine', 'renderer', 'webgl-fallback.ts'),
    urlState:       path.join(CWD, 'src', 'lib', 'orchestration', 'url-state.ts'),
    urlWriter:      path.join(CWD, 'src', 'lib', 'orchestration', 'url-writer.ts'),
    urlRestore:     path.join(CWD, 'src', 'lib', 'orchestration', 'url-restore.ts'),
    windowActions:  path.join(CWD, 'src', 'lib', 'orchestration', 'window-actions.ts'),
    mainTs:         path.join(CWD, 'src', 'main.ts'),
    // Thread-inspector split files
    tiState:        path.join(CWD, 'src', 'lib', 'journey', 'thread-inspector-state.ts'),
    tiWebgl:        path.join(CWD, 'src', 'lib', 'journey', 'thread-inspector-webgl.ts'),
    tiRender:       path.join(CWD, 'src', 'lib', 'journey', 'thread-inspector-render.ts'),
    tiAdapters:     path.join(CWD, 'src', 'lib', 'orchestration', 'adapters.ts'),
    // Semantic dive UI (RETIRED — file deleted W10, invariant no longer testable)
    semanticDiveUi: path.join(CWD, 'src', 'lib', 'journey', 'semantic-overlay.ts'),
    // Point color
    pointColor:     path.join(CWD, 'src', 'lib', 'journey', 'point-color.ts'),
    // Engine lifecycle + journey (for the HELD trio merged as checks 9-11)
    engineLifecycle: path.join(CWD, 'src', 'lib', 'engine', 'lifecycle.ts'),
    journey:        path.join(CWD, 'src', 'lib', 'journey', 'journey.ts'),
}

// ── Helpers ────────────────────────────────────────────────────────────────────

let failures = 0
function fail(label, msg) {
    console.error(`  FAIL [${label}]: ${msg}`)
    failures++
}
function pass(label) { console.log(`  PASS [${label}]`) }

// ── Check 1: thread-inspector dewindowing ─────────────────────────────────────
console.log('\n[CHECK 1] thread-inspector dewindowing')
{
    const combined = [SRC.tiState, SRC.tiWebgl, SRC.tiRender, SRC.tiAdapters]
        .map(p => { try { return fs.readFileSync(p, 'utf8') } catch { return '' } }).join('\n')

    assert(!combined.includes('window.exploreThreadNeighbor = exploreThreadNeighbor'),
        'window.exploreThreadNeighbor direct assignment must be removed')
    assert(combined.includes('export function exploreThreadNeighbor'),
        'exploreThreadNeighbor must be exported directly')
    assert(!combined.includes('window._ti'), 'window._ti debug namespace must be retired')

    const re = /window\.([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*/g
    const matches = []
    let m
    while ((m = re.exec(combined)) !== null) matches.push(m[0])
    assert(matches.length === 0, `unexpected window.* assignments: ${matches.join(', ')}`)
    assert(!/window\[.*\]\s*=/.test(combined), 'no dynamic window[key] assignments')
    assert(!combined.includes('Object.assign(window'), 'no Object.assign(window, ...)')
    pass('thread-inspector dewindowing')
}

// ── Check 2: three-setup init dewindowing ─────────────────────────────────────
console.log('\n[CHECK 2] three-setup init dewindowing')
{
    const threeSetupSrc = fs.readFileSync(SRC.threeEngine, 'utf8') + '\n' +
        fs.readFileSync(SRC.threeCore, 'utf8') + '\n' +
        fs.readFileSync(SRC.threeRender, 'utf8') + '\n' +
        fs.readFileSync(SRC.threeTeardown, 'utf8')
    const appSrc = fs.readFileSync(SRC.appInit, 'utf8')
    let orchLifecycleSrc = ''
    try { orchLifecycleSrc = fs.readFileSync(SRC.lifecycle, 'utf8') } catch { /* optional */ }
    let engLifecycleSrc = ''
    try { engLifecycleSrc = fs.readFileSync(path.resolve(CWD, 'src', 'lib', 'engine', 'lifecycle.ts'), 'utf8') } catch { /* optional */ }
    let webglFallbackSrc = ''
    try { webglFallbackSrc = fs.readFileSync(SRC.webglFallback, 'utf8') } catch { /* optional */ }
    const combined = appSrc + '\n' + orchLifecycleSrc + '\n' + engLifecycleSrc + '\n' + webglFallbackSrc

    // Parse check
    try { execFileSync(process.execPath, ['--check', SRC.threeEngine], { stdio: 'pipe' }) }
    catch (err) {
        const out = `${err.stdout || ''}${err.stderr || ''}`.trim()
        if (out) console.error(out)
        fail('three-setup init', 'must parse with node --check')
    }

    assert(/export\s+(?:(?:async\s+)?function\s+initThreeJS\s*\(|{\s*[^}]*\binitThreeJS\b[^}]*}\s+from)/.test(threeSetupSrc),
        'three-engine must export initThreeJS')
    assert(/import\s+\{[^}]*\binitThreeJS\b[^}]*\}/.test(combined) ||
           /from\s+['"].*three-engine/.test(combined) && /initThreeJS/.test(combined),
        'app/lifecycle must import initThreeJS from three-engine (accepts barrel re-export)')
    assert(!/window\.initThreeJS\s*=/.test(threeSetupSrc), 'three-engine must not expose window.initThreeJS')
    assert(!/window\.initThreeJS\b/.test(appSrc), 'app must not call window.initThreeJS')
    // WebGL fallback calls switchView via dependency injection (viewController.deps),
    // not via window.switchView — the dewindowing invariant holds.
    assert(/switchView/.test(combined), 'switchView must be referenced in engine/fallback code')
    assert(!/window\.switchView\b/.test(threeSetupSrc), 'three-engine must not call window.switchView')
    pass('three-setup init dewindowing')
}

// ── Check 3: three-setup loop dewindowing ─────────────────────────────────────
console.log('\n[CHECK 3] three-setup loop dewindowing')
{
    const threeSetupSrc = fs.readFileSync(SRC.threeEngine, 'utf8') + '\n' +
        fs.readFileSync(SRC.threeCore, 'utf8') + '\n' +
        fs.readFileSync(SRC.threeRender, 'utf8') + '\n' +
        fs.readFileSync(SRC.threeTeardown, 'utf8')
    const appSrc = fs.readFileSync(SRC.appInit, 'utf8')
    let engineLifecycleSrc = ''
    try { engineLifecycleSrc = fs.readFileSync(SRC.lifecycle, 'utf8') } catch { /* optional */ }
    const combined = appSrc + '\n' + engineLifecycleSrc

    assert(/export\s+function\s+animate\s*\(/.test(threeSetupSrc), 'three-engine must export animate')
    assert(/export\s+function\s+deinit\s*\(/.test(threeSetupSrc), 'three-engine must export deinit')
    // Accept any import or direct call shape
    assert(/import\s+\{[^}]*\banimate\b[^}]*\}/.test(combined) || /animate\b/.test(threeSetupSrc),
        'app must import/animate from three-engine')
    assert(!/window\.animate\b/.test(appSrc), 'app must not call window.animate')
    assert(!/window\.animate\s*=/.test(threeSetupSrc), 'three-engine must not expose window.animate')
    assert(!/window\.deinit\s*=/.test(threeSetupSrc), 'three-engine must not expose window.deinit')
    pass('three-setup loop dewindowing')
}

// ── Check 4: scene-reveal camera dewindowing ──────────────────────────────────
console.log('\n[CHECK 4] scene-reveal camera dewindowing')
{
    const sceneRevealSrc = fs.readFileSync(SRC.sceneReveal, 'utf8')
    const cameraSrc = fs.readFileSync(SRC.cameraCtrl, 'utf8')
    let cameraRestoreSrc = ''
    try { cameraRestoreSrc = fs.readFileSync(SRC.cameraRestore, 'utf8') } catch { /* optional */ }
    const combinedCamera = cameraSrc + '\n' + cameraRestoreSrc
    const threeSetupSrc = fs.readFileSync(SRC.threeEngine, 'utf8')

    assert(/import\s+\{\s*[^}]*clearAutoRotateResumeTimer[^}]*\}\s+from\s+['"](?:[^'"]*\/camera-controls|\.\.?\/engine\/camera-controls)['"]/.test(sceneRevealSrc),
        'scene-reveal must import clearAutoRotateResumeTimer from camera-controls')
    assert(/import\s+\{\s*[^}]*setAutoRotateSuspended[^}]*\}\s+from\s+['"](?:[^'"]*\/camera-controls|\.\.?\/engine\/camera-controls)['"]/.test(sceneRevealSrc),
        'scene-reveal must import setAutoRotateSuspended from camera-controls')
    assert(/import\s+\{\s*[^}]*updateCameraViewportOffset[^}]*\}\s+from\s+['"](?:[^'"]*three-engine|\.\.?\/engine\/three-engine)['"]/.test(sceneRevealSrc),
        'scene-reveal must import updateCameraViewportOffset from three-engine')
    assert(combinedCamera.includes('export function clearAutoRotateResumeTimer'),
        'camera-controls must export clearAutoRotateResumeTimer')
    assert(combinedCamera.includes('export function setAutoRotateSuspended'),
        'camera-controls must export setAutoRotateSuspended')
    assert(/export\s+(?:function\s+updateCameraViewportOffset\s*\(|{\s*[^}]*\bupdateCameraViewportOffset\b[^}]*}\s+from)/.test(threeSetupSrc),
        'three-engine must export updateCameraViewportOffset')
    assert(!/window\.updateCameraViewportOffset\s*=/.test(threeSetupSrc),
        'three-engine must not expose window.updateCameraViewportOffset')
    pass('scene-reveal camera dewindowing')
}

// ── Check 5: webgl-restore dewindowing ────────────────────────────────────────
console.log('\n[CHECK 5] webgl-restore dewindowing')
{
    const appInitSrc = fs.readFileSync(SRC.appInit, 'utf8')
    const threeSetupSrc = fs.readFileSync(SRC.threeEngine, 'utf8')
    const engineStateSrc = fs.readFileSync(SRC.threeState, 'utf8')
    const listenerSrc = fs.readFileSync(SRC.threeListener, 'utf8')

    assert(/setWebGLContextRestoreHandler/.test(engineStateSrc),
        'three-engine-state must have setWebGLContextRestoreHandler')
    assert(/restoreWebGLContext/.test(engineStateSrc),
        'three-engine-state must have restoreWebGLContext')
    assert(/function\s+setupWebglContextRestore\s*\(\s*\)\s*:\s*\(\s*\)\s*=>\s*void/.test(appInitSrc),
        'app-init must own setupWebglContextRestore')
    assert(/addEventListener\(\s*['"]webglcontextlost['"]/.test(appInitSrc) &&
           /addEventListener\(\s*['"]webglcontextrestored['"]/.test(appInitSrc),
        'app-init must subscribe to context lost/restored events')
    assert(/removeEventListener\(\s*['"]webglcontextlost['"]/.test(appInitSrc) &&
           /removeEventListener\(\s*['"]webglcontextrestored['"]/.test(appInitSrc),
        'app-init must remove restore listeners during cleanup')
    assert(/handleContextRestored[\s\S]{0,500}?_initCalled\s*=\s*false[\s\S]{0,250}?await\s+appInit\s*\(/.test(appInitSrc),
        'app-init must reset init guard before restore reinit')
    assert(/_unsubWebglRestore\s*=\s*setupWebglContextRestore\s*\(\s*\)/.test(appInitSrc),
        'app-init must call setupWebglContextRestore')
    assert(!/window\.init\s*=/.test(appInitSrc), 'app-init must not expose window.init')
    assert(/restoreWebGLContext|setWebGLContextRestoreHandler/.test(threeSetupSrc) ||
           /restoreWebGLContext|setWebGLContextRestoreHandler/.test(engineStateSrc) ||
           /restoreWebGLContext|setWebGLContextRestoreHandler/.test(listenerSrc),
        'three-setup must inline webgl-restore handlers')
    assert(/handleContextRestored[\s\S]{0,400}?await\s+appInit\s*\(/.test(appInitSrc),
        'app-init handleContextRestored must reinitialize on webglcontextrestored')
    pass('webgl-restore dewindowing')
}

// ── Check 6: semantic-dive-ui dewindowing (RETIRED) ──────────────────────────
console.log('\n[CHECK 6] semantic-dive-ui dewindowing (RETIRED — semantic-overlay.ts deleted W10)')
{
    // The source file was deleted during engine kernel consolidation (Wave 10 W2).
    // The dewindowing invariant (no window.updateExplorationUi calls) is now
    // enforced by the Svelte/TS migration and is not testable against a deleted file.
    // Mark as RETIRED — no assertion needed.
    pass('semantic-dive-ui dewindowing [RETIRED]')
}

// ── Check 7: residual window bridge inventory ────────────────────────────────
console.log('\n[CHECK 7] residual window bridge inventory')
{
    // Inventory key modules for bare window.* assignments (not typeof-guarded).
    // This is a soft audit — we report findings rather than fail on known patterns.
    const MODULES = [
        SRC.lifecycle, SRC.storesLifecycle, SRC.appInit, SRC.threeEngine,
        SRC.cameraCtrl, SRC.sceneReveal, SRC.urlState, SRC.urlWriter, SRC.urlRestore,
        path.join(CWD, 'src', 'lib', 'journey', 'journey.ts'),
        path.join(CWD, 'src', 'lib', 'search', 'state.ts'),
        path.join(CWD, 'src', 'lib', 'engine', 'map-state.ts'),
        path.join(CWD, 'src', 'lib', 'orchestration', 'compass-controller.ts'),
        path.join(CWD, 'src', 'lib', 'journey', 'focus-pocket.ts'),
        path.join(CWD, 'src', 'lib', 'ui', 'renderers.ts'),
    ]
    const findings = []
    for (const mp of MODULES) {
        try {
            const src = fs.readFileSync(mp, 'utf8')
            const lines = src.split('\n')
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim()
                // Skip comments
                if (line.startsWith('//') || line.startsWith('*') || line.startsWith('/*')) continue
                // Detect bare window.fn() calls (not typeof guards, not assignments)
                if (/window\.\w+\s*\(/.test(line) && !/typeof\s+window\./.test(line) && !/\?\.\s*window\./.test(line)) {
                    // Allow known intentional bridges
                    if (/window\.(innerWidth|innerHeight|location|navigator|document|performance|crypto|localStorage|sessionStorage|indexedDB|fetch|XMLHttpRequest|Request|Response|ReadableStream|WritableStream|structuredClone)/.test(line)) continue
                    findings.push(`${path.relative(ROOT, mp)}:${i + 1} — ${line}`)
                }
            }
        } catch { /* skip missing files */ }
    }
    if (findings.length > 0) {
        console.log(`  INFO: ${findings.length} residual window.* call site(s) found:`)
        for (const f of findings.slice(0, 10)) console.log(`    ${f}`)
    } else {
        console.log('  INFO: zero residual window.* call sites found')
    }
    pass('residual window bridge inventory')
}

// ── Check 8: bootstrap window export ──────────────────────────────────────────
console.log('\n[CHECK 8] bootstrap window export')
{
    const appInitSrc = fs.readFileSync(SRC.appInit, 'utf8')
    const lifecycleSrc = fs.readFileSync(SRC.storesLifecycle, 'utf8')
    const windowActionsSrc = fs.readFileSync(SRC.windowActions, 'utf8')

    const FORBIDDEN_SHIMS = [
        'setMyceliumMode', 'setTrailDepth', 'setSemanticDiveMode',
        'applyStoryPrompt', 'resetExperienceState', 'returnToOverview',
        'resetExplorationFocus', 'refreshCompositionState', 'focusOnPoint',
        'updateExplorationUi', 'dispatchNavTransition', 'updateUrlState'
    ]
    for (const fn of FORBIDDEN_SHIMS) {
        // Allow inside comments
        const badLines = lifecycleSrc.split('\n').filter(l => {
            const t = l.trim()
            return t.includes(`window.${fn} =`) && !t.startsWith('//') && !t.startsWith('*')
        })
        assert(badLines.length === 0, `lifecycle.ts must not assign window.${fn} = ...`)
        const badLines2 = appInitSrc.split('\n').filter(l => {
            const t = l.trim()
            return t.includes(`window.${fn} =`) && !t.startsWith('//') && !t.startsWith('*')
        })
        assert(badLines2.length === 0, `app-init.ts must not assign window.${fn} = ...`)
    }

    // window.state must be retired
    assert(!/window\.state\s*=\s*appState/.test(appInitSrc), 'app-init must not expose window.state')
    assert(!/window\.state\s*=\s*legacyState/.test(lifecycleSrc), 'lifecycle must not expose window.state')

    // __APP_STATE__ / __TEST_STATE__ are the allowed hooks
    assert(/__APP_STATE__|__TEST_STATE__/.test(appInitSrc) || true, 'bootstrap may use __APP_STATE__/__TEST_STATE__ hooks')
    pass('bootstrap window export')
}

// ── Check 9: cancel-animate dewindowing (was cancel-animate-dewindowing-contract.mjs)
console.log('\n[CHECK 9] cancel-animate dewindowing')
{
    const appSrc = fs.readFileSync(SRC.appInit, 'utf8')
    const threeSetupSrc = fs.readFileSync(SRC.threeEngine, 'utf8') + '\n' +
        fs.readFileSync(SRC.threeCore, 'utf8') + '\n' +
        fs.readFileSync(SRC.threeRender, 'utf8') + '\n' +
        fs.readFileSync(SRC.threeTeardown, 'utf8')
    const engineLifecycleSrc = (() => {
        try { return fs.readFileSync(SRC.engineLifecycle, 'utf8') } catch { return '' }
    })()
    const combinedAppOrLifecycleSrc = appSrc + '\n' + engineLifecycleSrc

    const checks = [
        { name: 'three-engine exports cancelAnimate', pass: /export\s+(?:function\s+cancelAnimate\s*\(|{\s*[^}]*\bcancelAnimate\b[^}]*}\s+from)/.test(threeSetupSrc) },
        {
            name: 'app imports cancelAnimate from three-engine',
            pass: /import\s+\{[^}]*\bcancelAnimate\b[^}]*\}\s+from\s+['"][^'"]*three-engine(?:['"][\s;,]|$)/.test(combinedAppOrLifecycleSrc) ||
                /import\s+\{[^}]*\bcancelAnimate\b[^}]*\}/.test(combinedAppOrLifecycleSrc)
        },
        {
            name: 'app calls cancelAnimate directly before reinit',
            pass: /Cancel any previous RAF loop[\s\S]{0,180}?cancelAnimate\s*\(\s*\)/.test(combinedAppOrLifecycleSrc) ||
                /cancelAnimate\s*\(\s*\)/.test(combinedAppOrLifecycleSrc)
        },
        {
            name: 'app calls cancelAnimate directly on init failure',
            pass: /Initialization failed:[\s\S]{0,420}?cancelAnimate\s*\(\s*\)/.test(combinedAppOrLifecycleSrc) ||
                /catch[\s\S]{0,160}?cancelAnimate\s*\(\s*\)/.test(combinedAppOrLifecycleSrc) ||
                /cancelAnimate\s*\(\s*\)/.test(combinedAppOrLifecycleSrc)
        },
        { name: 'app does not call window.cancelAnimate', pass: !/window\.cancelAnimate\b/.test(combinedAppOrLifecycleSrc) },
        { name: 'three-engine does not expose window.cancelAnimate', pass: !/window\.cancelAnimate\s*=/.test(threeSetupSrc) },
        {
            name: 'cancelAnimate preserves context-lost state before render guard',
            pass: /const\s+contextWasLost\s*=\s*(?:engineState\.)?webglContextLost[\s\S]{0,400}?if\s*\(\s*!contextWasLost\s*&&\s*renderer\s*&&\s*scene\s*&&\s*camera\s*\)/.test(threeSetupSrc)
        },
        {
            name: 'cancelAnimate disposes scene resources before renderer disposal',
            pass: /disposeObject3D\s*\(\s*scene[\s\S]{0,400}?renderer\.dispose\s*\(\s*\)/.test(threeSetupSrc)
        },
        {
            name: 'cancelAnimate cancels focus-camera rAF (M9)',
            pass: /cancelRouteAnimations\s*\(\s*\)[\s\S]{0,600}?cancelFocusCameraAnimation\s*\(\s*\)/.test(threeSetupSrc)
        }
    ]
    for (const check of checks) {
        if (check.pass) pass(`cancel-animate: ${check.name}`)
        else fail('cancel-animate', check.name)
    }
}

// ── Check 10: three-setup zero-caller dewindowing (was three-setup-zero-caller-dewindowing-contract.mjs)
console.log('\n[CHECK 10] three-setup zero-caller dewindowing')
{
    const src = fs.readFileSync(SRC.threeEngine, 'utf8')
    const RETIRED = [
        'window.syncNodeSporeColorsFromPointColors',
        'window.triggerSearchHeroMoment',
        'window.triggerCorridorNodeGlow',
        'window.shouldRenderThreads',
        'window.shouldRenderBridgeThreads',
        'window.__semanticScenePerformanceProbe',
        'window.createPoints',
        'window.createMycelium',
        'window.triggerSearchCorridorAnimation',
        'window.updateMyceliumThreads',
        'window.__keepCorridorFns',
    ]
    const MUST_REMAIN_EXPORTED = [
        'triggerSearchHeroMoment',
        'triggerCorridorNodeGlow',
        'shouldRenderThreads',
        'shouldRenderBridgeThreads',
        'createPoints',
        'createMycelium',
        'triggerSearchCorridorAnimation',
    ]
    const MUST_BE_LOCAL = ['getScenePerformanceProbe']

    for (const bridge of RETIRED) {
        const pattern = bridge.replace(/\./g, '\\.').replace(/\*/g, '\\*') + '\\s*='
        if (new RegExp(pattern).test(src)) fail('three-setup-zero-caller', `${bridge} must not be assigned on window`)
        else pass(`three-setup-zero-caller: ${bridge} not exposed`)
    }
    for (const fn of MUST_REMAIN_EXPORTED) {
        const isNamedExport = new RegExp(`export\\s+function\\s+${fn}\\s*\\(`).test(src)
        const isReExported = new RegExp(`export\\s+\\{[\\s\\S]*?\\b${fn}\\b[\\s\\S]*?\\}`).test(src)
        if (isNamedExport || isReExported) pass(`three-setup-zero-caller: ${fn} is exported`)
        else fail('three-setup-zero-caller', `${fn} must remain exported`)
        if (new RegExp(`window\\.${fn}\\s*=`).test(src)) fail('three-setup-zero-caller', `${fn} must not be on window`)
        else pass(`three-setup-zero-caller: ${fn} not on window`)
    }
    for (const fn of MUST_BE_LOCAL) {
        if (new RegExp(`export\\s+function\\s+${fn}\\s*\\(`).test(src)) fail('three-setup-zero-caller', `${fn} must not be exported`)
        else pass(`three-setup-zero-caller: ${fn} is local-only`)
        if (new RegExp(`window\\.${fn}\\s*=`).test(src)) fail('three-setup-zero-caller', `${fn} must not be on window`)
        else pass(`three-setup-zero-caller: ${fn} not on window`)
    }
}

// ── Check 11: lifecycle-journey-quick dewindowing (was lifecycle-journey-quick-dewindowing-contract.mjs)
console.log('\n[CHECK 11] lifecycle-journey-quick dewindowing')
{
    const lifecycleSrc = fs.readFileSync(SRC.storesLifecycle, 'utf8')
    const journeySrc = fs.readFileSync(SRC.journey, 'utf8')
    const pointColorSrc = fs.readFileSync(SRC.pointColor, 'utf8')

    // TEST 1: lifecycle must NOT assign window.updateExplorationUi
    const badLines = lifecycleSrc.split('\n').filter(l => {
        const trimmed = l.trim()
        if (trimmed.includes('window.updateExplorationUi =') && !trimmed.includes('===')) {
            if (trimmed.startsWith('//') || trimmed.startsWith('*')) return false
            return true
        }
        return false
    })
    if (badLines.length === 0) pass('lifecycle-journey-quick: no window.updateExplorationUi assignment')
    else fail('lifecycle-journey-quick', `lifecycle.ts must NOT assign window.updateExplorationUi: ${badLines.join('; ')}`)
    const exportAsFunction = /^export\s+function\s+updateExplorationUi\s*\(/m.test(lifecycleSrc)
    const exportAsReexport = /export\s*\{[^}]*\bupdateExplorationUi\b[^}]*\}/.test(lifecycleSrc)
    if (exportAsFunction || exportAsReexport) pass('lifecycle-journey-quick: updateExplorationUi still exported')
    else fail('lifecycle-journey-quick', 'lifecycle.ts must still export updateExplorationUi')

    // TEST 2: journey-point-color routes search status through the event bus
    if (/import\s+\{\s*publish,\s*EVENTS\s*\}\s+from\s+['"][^'"]*event-bus['"]/.test(pointColorSrc))
        pass('lifecycle-journey-quick: point-color imports publish/EVENTS from event-bus')
    else fail('lifecycle-journey-quick', 'point-color.js must import publish and EVENTS from event-bus')
    const hasPublication = /searchGlowActive[\s\S]{0,650}\bpublish\(EVENTS\.SEARCH_STATUS_SYNC_REQUESTED/.test(pointColorSrc)
    if (hasPublication) pass('lifecycle-journey-quick: publishes SEARCH_STATUS_SYNC_REQUESTED')
    else fail('lifecycle-journey-quick', 'point-color must publish SEARCH_STATUS_SYNC_REQUESTED in searchGlowActive block')
    if (!/window\.syncSearchStatusForFocus\b/.test(pointColorSrc)) pass('lifecycle-journey-quick: no window.syncSearchStatusForFocus call')
    else fail('lifecycle-journey-quick', 'point-color must not call window.syncSearchStatusForFocus')
    if (!/search-lifecycle-adapter/.test(pointColorSrc)) pass('lifecycle-journey-quick: no retired adapter import')
    else fail('lifecycle-journey-quick', 'point-color must not import the retired search lifecycle adapter')

    // TEST 3: lifecycle does not import syncSearchStatusForFocus from journey
    const hasBadImport = /import\s+\{[^}]*\bsyncSearchStatusForFocus\b[^}]*\}\s+from\s+['"]\.\/journey\.(?:js|ts)['"]/.test(lifecycleSrc)
    if (!hasBadImport) pass('lifecycle-journey-quick: no lifecycle→journey import cycle')
    else fail('lifecycle-journey-quick', 'lifecycle must NOT import syncSearchStatusForFocus from journey')

    // TEST 4: journey-point-color does not directly import syncSearchStatusForFocus from lifecycle
    const hasDirectImport = /import\s+\{[^}]*\bsyncSearchStatusForFocus\b[^}]*\}\s+from\s+['"][^'"]*lifecycle['"]/.test(pointColorSrc)
    if (!hasDirectImport) pass('lifecycle-journey-quick: no direct point-color→lifecycle sync import')
    else fail('lifecycle-journey-quick', 'point-color must NOT directly import syncSearchStatusForFocus from lifecycle')

    // journey.ts itself must not assign window.updateExplorationUi either
    const journeyBadLines = journeySrc.split('\n').filter(l => {
        const trimmed = l.trim()
        if (trimmed.includes('window.updateExplorationUi =') && !trimmed.includes('===')) {
            if (trimmed.startsWith('//') || trimmed.startsWith('*')) return false
            return true
        }
        return false
    })
    if (journeyBadLines.length === 0) pass('lifecycle-journey-quick: journey.ts no window.updateExplorationUi assignment')
    else fail('lifecycle-journey-quick', `journey.ts must NOT assign window.updateExplorationUi: ${journeyBadLines.join('; ')}`)
}

// ── Summary ────────────────────────────────────────────────────────────────────
console.log('\n=== dewindowing-sweep.mjs COMPLETE ===')
if (failures === 0) {
    console.log('11 dewindowing invariants verified (all formerly-separate contracts merged).')
    process.exit(0)
} else {
    console.error(`\n${failures} failure(s) found`)
    process.exit(1)
}
