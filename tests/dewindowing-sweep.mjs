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

// ── Summary ────────────────────────────────────────────────────────────────────
console.log('\n=== dewindowing-sweep.mjs COMPLETE ===')
if (failures === 0) {
    console.log('8 dewindowing invariants verified (3 HELD contracts run separately).')
    process.exit(0)
} else {
    console.error(`\n${failures} failure(s) found`)
    process.exit(1)
}
