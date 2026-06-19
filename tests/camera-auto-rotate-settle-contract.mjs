/**
 * camera-auto-rotate-settle-contract.mjs
 *
 * Fast source contract for camera auto-rotate settle behavior. This keeps the
 * seam covered without importing lifecycle.js, whose top-level window bindings
 * make a tiny Node harness unnecessarily brittle.
 */

import fs from 'node:fs'
import path from 'node:path'
import { resolveSource } from './source-path.mjs'

const SEMDEMO_ROOT = path.resolve(process.cwd())
const CAMERA_PATH = resolveSource('src/lib/engine/camera-controls.ts', SEMDEMO_ROOT)
const CAMERA_RESTORE_PATH = resolveSource('src/lib/engine/camera-controls-restore.svelte.ts', SEMDEMO_ROOT)
const SCENE_REVEAL_PATH = resolveSource('src/lib/engine/scene-reveal.ts', SEMDEMO_ROOT)

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERTION FAILED: ${message}`)
}

function assertContains(haystack, needle, label) {
    assert(haystack.includes(needle), `${label}: expected source to contain "${needle}"`)
}

function extractMethodOrFunction(source, name) {
    // Try class method first (avoids the export wrapper at the bottom of .svelte.ts)
    const methodRe = new RegExp(`(?<=\\n)[ \\t]+${name}[ \\t]*\\(`)
    const m = source.match(methodRe)
    if (m) {
        const start = m.index
        const braceStart = source.indexOf('{', start)
        assert(braceStart !== -1, `${name} opening brace found`)
        let depth = 1
        let index = braceStart + 1
        while (index < source.length && depth > 0) {
            if (source[index] === '{') depth++
            if (source[index] === '}') depth--
            index++
        }
        assert(depth === 0, `${name} closing brace found`)
        return source.slice(start, index)
    }

    // Fallback to loose export function
    const marker = `export function ${name}`
    const start = source.indexOf(marker)
    assert(start !== -1, `${name} export found`)
    const braceStart = source.indexOf('{', start)
    assert(braceStart !== -1, `${name} opening brace found`)
    let depth = 1
    let index = braceStart + 1
    while (index < source.length && depth > 0) {
        if (source[index] === '{') depth++
        if (source[index] === '}') depth--
        index++
    }
    assert(depth === 0, `${name} closing brace found`)
    return source.slice(start, index)
}

const cameraSrc = fs.readFileSync(CAMERA_PATH, 'utf8')
const cameraRestoreSrc = fs.readFileSync(CAMERA_RESTORE_PATH, 'utf8')
const sceneRevealSrc = fs.readFileSync(SCENE_REVEAL_PATH, 'utf8')

assertContains(
    cameraSrc,
    "from './camera-controls-restore'",
    'camera-controls.ts facade imports camera-controls-restore'
)
;[
    'settleCameraToOverviewPose',
    'toggleAutoRotate',
    'setAutoRotateSuspended',
    'clearAutoRotateResumeTimer',
    'scheduleAutoRotateResume',
    'updateAutoRotateSoftResume',
    'isCameraIdleOrbitAllowed',
    'syncOrbitAutoRotate'
].forEach((name) => assertContains(cameraSrc, `${name}`, `${name} re-exported in facade`))

const setSuspended = extractMethodOrFunction(cameraRestoreSrc, 'setAutoRotateSuspended')
const clearTimer = extractMethodOrFunction(cameraRestoreSrc, 'clearAutoRotateResumeTimer')
const scheduleResume = extractMethodOrFunction(cameraRestoreSrc, 'scheduleAutoRotateResume')
const startReveal = extractMethodOrFunction(sceneRevealSrc, 'startSceneReveal')

console.log('============================================================')
console.log('camera-auto-rotate-settle-contract.mjs')
console.log('Fast contract test: camera auto-rotate settle seam')
console.log('============================================================')

console.log('\n[TEST] startSceneReveal suspends autorotate and clears resume timer')
assertContains(startReveal, "state.currentView !== 'galaxy'", 'startSceneReveal galaxy gate')
assertContains(startReveal, 'clearAutoRotateResumeTimer()', 'startSceneReveal clears pending resume')
assertContains(startReveal, 'setAutoRotateSuspended(true)', 'startSceneReveal calls suspend helper')
assert(
    startReveal.indexOf('clearAutoRotateResumeTimer()') < startReveal.indexOf('setAutoRotateSuspended(true)'),
    'startSceneReveal clears resume timer before suspending autorotate'
)
console.log('  OK startSceneReveal autorotate handoff is intact')

console.log('\n[TEST] setAutoRotateSuspended owns soft-resume timestamp lifecycle')
assertContains(setSuspended, '.autoRotateSuspended = suspended', 'suspend flag assignment')
assertContains(setSuspended, '.autoRotateSoftResumeStartedAt = 0', 'soft resume clears when suspended')
assertContains(setSuspended, '.autoRotateSoftResumeStartedAt = performance.now()', 'soft resume stamps on release')
assertContains(setSuspended, 'syncOrbitAutoRotate()', 'orbit sync after state change')
console.log('  OK soft-resume lifecycle is intact')

console.log('\n[TEST] clearAutoRotateResumeTimer resets timer and due timestamp')
assertContains(clearTimer, 'clearTimeout(', 'timer is cleared')
assertContains(clearTimer, '.autoRotateResumeTimer = null', 'timer id reset')
assertContains(clearTimer, '.autoRotateResumeDueAt = 0', 'due timestamp reset')
console.log('  OK clearAutoRotateResumeTimer reset contract is intact')

console.log('\n[TEST] scheduleAutoRotateResume blocks on all idle-orbit gates')
;[
    'prefersReducedMotion()',
    '.autoRotate',
    '_isGalaxy',
    '_noFocus',
    '_noSelection',
    'sceneRevealActive',
    '_isOverview',
    '_pocketActive',
    '_trailZero'
].forEach((needle) => assertContains(scheduleResume, needle, `scheduleAutoRotateResume gate ${needle}`))
assertContains(scheduleResume, '.autoRotateResumeDueAt = performance.now() + delay', 'resume due timestamp set')
assertContains(scheduleResume, '.autoRotateResumeTimer = setTimeout', 'resume timer scheduled')
assertContains(scheduleResume, 'setAutoRotateSuspended(false)', 'resume callback releases suspension')
console.log('  OK scheduleAutoRotateResume gate set is intact')

console.log('\n[TEST] resume callback rechecks gates before releasing')
const callbackStart = scheduleResume.indexOf('.autoRotateResumeTimer = setTimeout')
const callbackBlock = scheduleResume.slice(callbackStart)
;[
    '.autoRotate',
    "currentView === 'galaxy'",
    'focusedNode == null',
    'selectedPoint == null',
    "navState.mode === 'overview'",
    'sceneRevealActive',
    'navState.focusPocketMeta',
    'trailDepth === 0'
].forEach((needle) => assertContains(callbackBlock, needle, `resume callback gate ${needle}`))
console.log('  OK resume callback rechecks idle gates')

console.log('\n============================================================')
console.log('ALL TESTS PASSED')
console.log('============================================================')
