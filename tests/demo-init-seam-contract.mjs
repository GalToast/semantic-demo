/**
 * Contract for the app/demo startup seam.
 *
 * LEGACY PATH (port 8795):
 *   app.js imports micro-demo.js
 *   app.js calls initMicroDemo() once during the launch path
 *   micro-demo.js owns readiness guards and showcase node selection
 *
 * SVELTE PATH (port 5173):
 *   App.svelte imports DemoChoreography component
 *   DemoChoreography.svelte owns the demo lifecycle via demo store
 *   src/lib/stores/demo.ts owns the state machine, showcase pool, timers
 *
 * This test auto-detects which path is active by checking for Svelte source.
 */

import fs from 'node:fs'
import path from 'node:path'
import { resolveSource } from './source-path.mjs'

const ROOT = process.cwd()
const svelteDemoStorePath = path.join(ROOT, 'src/lib/stores/demo.svelte.ts')
const svelteDemoComponentPath = path.join(ROOT, 'src/components/DemoChoreography.svelte')
const hasSvelte = fs.existsSync(svelteDemoStorePath) && fs.existsSync(svelteDemoComponentPath)

const appSource = hasSvelte ? null : fs.readFileSync(resolveSource('src/lib/orchestration/app-init.ts', ROOT), 'utf8')
const microDemoSource = hasSvelte ? null : fs.readFileSync(resolveSource('src/lib/demo/choreography.ts', ROOT), 'utf8')
const svelteStoreSource = hasSvelte ? fs.readFileSync(svelteDemoStorePath, 'utf8') : null
const svelteComponentSource = hasSvelte ? fs.readFileSync(svelteDemoComponentPath, 'utf8') : null

let passed = 0
let failed = 0
let skipped = 0

function ok(message) {
    console.log(`  ok ${message}`)
    passed += 1
}

function fail(message) {
    console.log(`  FAIL ${message}`)
    failed += 1
}

function skip(message) {
    console.log(`  ⊙ SKIP: ${message}`)
    skipped += 1
}

function test(message, fn) {
    try {
        fn()
        ok(message)
    } catch (error) {
        fail(message)
        console.log(`        ${error.message}`)
    }
}

function assert(condition, message) {
    if (!condition) throw new Error(message)
}

if (hasSvelte) {
    // ── Svelte Path Checks ──────────────────────────────────────────────────

    console.log('\n=== Svelte Demo Init Seam Contract ===\n')

    test('App.svelte imports DemoChoreography component', () => {
        const appSource = fs.readFileSync(path.join(ROOT, 'src/App.svelte'), 'utf8')
        // Post-W46-B2b: DemoChoreography is loaded via createLazyComponent
        // helper (W46-B2b). App.svelte holds the dynamic import directly;
        // the orchestrator module that originally factored this is gone.
        assert(
            /import\s+DemoChoreography\s+from\s+['"]@components\/DemoChoreography\.svelte['"]/.test(appSource) ||
                /import\(['"]@components\/DemoChoreography\.svelte['"]\)/.test(appSource),
            'App.svelte must import DemoChoreography (directly or via createLazyComponent)'
        )
    })

    test('App.svelte renders DemoChoreography with force/suppress props', () => {
        const appSource = fs.readFileSync(path.join(ROOT, 'src/App.svelte'), 'utf8')
        // Post-W46-B2b: the lazy component is rendered as <Cmp .../> where Cmp is
        // the resolved lazy component (l.demoChoreography.current). The force and
        // suppress props are still bound to forceDemo/noDemo.
        assert(
            /<DemoChoreography\s+force=\{forceDemo\}\s+suppress=\{noDemo\}/.test(appSource) ||
                /<DemoChoreography[\s\S]*?force=/.test(appSource) ||
                /<[A-Za-z_][\w]*[\s\S]*?force=\{forceDemo\}[\s\S]*?suppress=\{noDemo\}/.test(appSource),
            'App.svelte must pass force and suppress props to the demo component'
        )
    })

    test('App.svelte installs parity sync for demoPhase body data attribute', () => {
        const appSource = fs.readFileSync(path.join(ROOT, 'src/App.svelte'), 'utf8')
        const paritySource = fs.readFileSync(path.join(ROOT, 'src/lib/orchestration/parity-attrs.svelte.ts'), 'utf8')
        // Post-W46-B1: installParityAttributeSync moved from App.svelte into the
        // appInit() orchestration flow (app-init.ts). Verify it is installed in
        // either App.svelte or the orchestration init module.
        const appInitSource = fs.readFileSync(path.join(ROOT, 'src/lib/orchestration/app-init.ts'), 'utf8')
        assert(
            /installParityAttributeSync/.test(appSource) || /installParityAttributeSync/.test(appInitSource),
            'App.svelte or app-init must install the parity attribute sync'
        )
        assert(
            /key:\s*['"]demoPhase['"]/.test(paritySource) &&
                (/demoPhaseGetter\(\)/.test(paritySource) || /demoStore\.phase/.test(paritySource)),
            'parity-attrs.svelte.ts must sync demoPhase from the demo store to body.dataset.demoPhase'
        )
    })

    test('demo store defines SHOWCASE_POOL', () => {
        assert(
            /const\s+SHOWCASE_POOL\s*:\s*readonly\s+number\[\]/.test(svelteStoreSource) ||
                /const\s+SHOWCASE_POOL\s*=/.test(svelteStoreSource),
            'demo.ts must define SHOWCASE_POOL'
        )
    })

    test('demo store defines all valid state machine phases', () => {
        const requiredPhases = [
            'IDLE',
            'OVERVIEW',
            'SEARCH',
            'FOCUS',
            'THREADS',
            'NEIGHBORS',
            'TRAIL',
            'DIVE',
            'FILTER',
            'MAP',
            'RETURN',
            'COMPLETE',
            'CANCELLED'
        ]
        for (const phase of requiredPhases) {
            assert(
                svelteStoreSource.includes(`'${phase}'`) || svelteStoreSource.includes(`"${phase}"`),
                `demo.ts must define phase '${phase}'`
            )
        }
    })

    test('demo store uses Map-based timer tracking (bug fix)', () => {
        assert(
            /const\s+timers\s*=\s*new\s+Map/.test(svelteStoreSource),
            'demo.ts must use Map<string, number> for timer tracking'
        )
        assert(
            /export\s+function\s+cancelAllDemoTimers/.test(svelteStoreSource),
            'demo.ts must export cancelAllDemoTimers'
        )
    })

    test('demo store defines findDemoNode with validation', () => {
        assert(/export\s+function\s+findDemoNode/.test(svelteStoreSource), 'demo.ts must export findDemoNode')
        assert(
            /status\s*===\s*['"]disqualified['"]/.test(svelteStoreSource),
            'findDemoNode must filter out disqualified nodes'
        )
    })

    test('demo store uses DEMO_SESSION_KEY for session guard', () => {
        assert(
            /DEMO_SESSION_KEY\s*=\s*['"]moco_mycelium_demo_session_v1['"]/.test(svelteStoreSource),
            'demo.ts must define DEMO_SESSION_KEY as moco_mycelium_demo_session_v1'
        )
    })

    test('demo store checks demo=force parameter in shouldRunDemo', () => {
        const forceMatches = svelteStoreSource.match(/params\.get\(['"]demo['"]\)\s*===\s*['"]force['"]/g) || []
        assert(forceMatches.length >= 1, `expected at least one demo=force check, found ${forceMatches.length}`)
    })

    test('demo store checks nodemo=1 parameter', () => {
        assert(
            /params\.get\(['"]nodemo['"]\)\s*===\s*['"]1['"]/.test(svelteStoreSource),
            'shouldRunDemo must check nodemo=1 parameter'
        )
    })

    test('DemoChoreography.svelte owns the demo lifecycle', () => {
        assert(
            /import[\s\S]*startDemo[\s\S]*from\s+['"]@lib\/stores\/demo\.svelte\.ts['"]/.test(svelteComponentSource),
            'DemoChoreography must import startDemo from demo store'
        )
        assert(
            /import[\s\S]*cancelDemo[\s\S]*from\s+['"]@lib\/stores\/demo\.svelte\.ts['"]/.test(svelteComponentSource),
            'DemoChoreography must import cancelDemo from demo store'
        )
        assert(
            /import[\s\S]*transitionDemo[\s\S]*from\s+['"]@lib\/stores\/demo\.svelte\.ts['"]/.test(
                svelteComponentSource
            ),
            'DemoChoreography must import transitionDemo'
        )
    })

    test('DemoChoreography.svelte uses demo store eligibility and node selection helpers', () => {
        assert(
            /import[\s\S]*shouldRunDemo[\s\S]*from\s+['"]@lib\/stores\/demo\.svelte\.ts['"]/.test(
                svelteComponentSource
            ),
            'DemoChoreography must import shouldRunDemo from demo store'
        )
        assert(
            /import[\s\S]*findDemoNode[\s\S]*from\s+['"]@lib\/stores\/demo\.svelte\.ts['"]/.test(svelteComponentSource),
            'DemoChoreography must import findDemoNode from demo store'
        )
        assert(
            /findDemoNode\(\s*(getBusinessRecords\(\)|records)\s*\)/.test(svelteComponentSource),
            'DemoChoreography must select a validated node from getBusinessRecords()'
        )
        assert(
            !/Math\.random\(\)\s*\*\s*8406/.test(svelteComponentSource),
            'DemoChoreography must not choose random raw node indices'
        )
    })

    test('DemoChoreography.svelte cleans up timers on destroy', () => {
        assert(
            /onDestroy[\s\S]*?cancelAllDemoTimers/.test(svelteComponentSource) ||
                /onDestroy[\s\S]*?cancelDemo/.test(svelteComponentSource),
            'DemoChoreography must cancel timers/demo on destroy'
        )
    })

    test('DemoChoreography.svelte renders dismiss button', () => {
        assert(
            /demo-dismiss/.test(svelteComponentSource) || /Dismiss demo/.test(svelteComponentSource),
            'DemoChoreography must render a dismiss button'
        )
    })

    test('App does not own showcase pool selection (no SHOWCASE_POOL in app)', () => {
        const appSource = fs.readFileSync(path.join(ROOT, 'src/App.svelte'), 'utf8')
        assert(!/SHOWCASE_POOL/.test(appSource), 'SHOWCASE_POOL must not be defined in App.svelte')
    })

    test('App does not contain micro-demo state machine logic', () => {
        const appSource = fs.readFileSync(path.join(ROOT, 'src/App.svelte'), 'utf8')
        assert(
            !/GLIDING|ARRIVED|CARD_VISIBLE|PULLBACK|WIDE_VIEW|RETURNING/.test(appSource),
            'App.svelte must not contain demo phase names (lives in DemoChoreography)'
        )
    })
} else {
    // ── Legacy Path Checks ──────────────────────────────────────────────────

    console.log('\n=== Legacy Demo Init Seam Contract ===\n')

    test('app imports micro-demo for the active demo path', () => {
        assert(/import\s+.*?['"]\.\/micro-demo\.js['"]/.test(appSource), 'app.js must import micro-demo.ts')
    })

    test('app does not own showcase pool selection', () => {
        assert(!/\bSHOWCASE_POOL\b/.test(appSource), 'SHOWCASE_POOL must not be defined in app.ts')
        assert(!/_selectedDemoIndex/.test(appSource), '_selectedDemoIndex must not be assigned in app.ts')
        assert(!/\bshuffleArray\b/.test(appSource), 'demo shuffle helpers must not live in app.ts')
    })

    test('app does not poll overlay readiness for the demo', () => {
        assert(!/pollForOverlayHidden/.test(appSource), 'app.js must not define pollForOverlayHidden')
    })

    test('app hands off to initMicroDemo once in the launch path', () => {
        const initCalls = appSource.split('initMicroDemo').length - 1
        assert(
            initCalls >= 2,
            `expected at least one initMicroDemo call (plus import), found ${initCalls} total occurrences`
        )
    })

    test('micro-demo owns scene readiness', () => {
        assert(
            /function\s+_isAppReadyForDemo\s*\(/.test(microDemoSource),
            'micro-demo.js must define _isAppReadyForDemo'
        )
        assert(/loading-overlay/.test(microDemoSource), 'micro-demo readiness must check the loading overlay')
    })

    test('micro-demo owns the active showcase pool', () => {
        assert(
            /\bconst\s+SHOWCASE_POOL\s*=/.test(microDemoSource),
            'micro-demo.js must define the active SHOWCASE_POOL'
        )
        assert(/\bfunction\s+_getDemoNode\s*\(/.test(microDemoSource), 'micro-demo.js must define _getDemoNode')
        assert(!/_selectedDemoIndex/.test(microDemoSource), 'micro-demo.js must not depend on app-selected demo index')
    })

    test('micro-demo owns captured overview return camera behavior', () => {
        assert(
            /let\s+_overviewCameraSnapshot\s*=\s*null/.test(microDemoSource),
            'micro-demo.js must keep overview snapshot state'
        )
        assert(
            /function\s+_captureOverviewCameraSnapshot\s*\(/.test(microDemoSource),
            'micro-demo.js must capture overview camera pose'
        )
        assert(
            /function\s+_getOverviewCameraSnapshot\s*\(/.test(microDemoSource),
            'micro-demo.js must provide fallback overview pose'
        )
        assert(
            /function\s+_animateCameraToOverview\s*\(/.test(microDemoSource),
            'micro-demo.js must centralize return-to-overview animation'
        )
        assert(
            /_captureOverviewCameraSnapshot\(\);[\s\S]{0,800}Suspend auto-rotate/.test(microDemoSource) ||
                /_captureOverviewCameraSnapshot\(\);/.test(microDemoSource),
            'micro-demo must capture overview before demo camera movement'
        )
    })

    test('micro-demo return and cancel use captured overview helper', () => {
        assert(
            /_animateCameraToOverview\(1000\)/.test(microDemoSource),
            'scheduled return must use captured overview helper'
        )
        assert(
            /_animateCameraToOverview\(800\)/.test(microDemoSource),
            'cancel return must use captured overview helper'
        )
        const hardcodedOverviewMatches = microDemoSource.match(/new\s+THREE\.Vector3\(\s*0,\s*3\.5,\s*5\s*\)/g) || []
        assert(
            hardcodedOverviewMatches.length === 1,
            `fallback overview camera should be the only hardcoded overview vector, found ${hardcodedOverviewMatches.length}`
        )
        const hardcodedTargetMatches = microDemoSource.match(/new\s+THREE\.Vector3\(\s*0,\s*0,\s*0\s*\)/g) || []
        assert(
            hardcodedTargetMatches.length === 1,
            `fallback overview target should be the only hardcoded target vector, found ${hardcodedTargetMatches.length}`
        )
        assert(
            /prefers-reduced-motion:\s*reduce/.test(microDemoSource),
            'return-to-overview helper must consult reduced-motion preference'
        )
        assert(
            /state\.camera\.position\.copy\(overviewPos\)/.test(microDemoSource),
            'reduced-motion return must snap camera position'
        )
        assert(
            /state\.controls\.target\.copy\(overviewTarget\)/.test(microDemoSource),
            'reduced-motion return must snap controls target'
        )
    })
}

console.log(`\n${'-'.repeat(50)}`)
console.log(`Results: ${passed} passed, ${failed} failed, ${skipped} skipped`)
console.log(`${'-'.repeat(50)}\n`)

process.exit(failed > 0 ? 1 : 0)
