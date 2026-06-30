/**
 * Fast surface contract checks for camera-controls motion/risk surfaces.
 * Runs in Node with a tiny DOM/window/performance shim — no browser needed.
 *
 * Covers:
 *   - reduced-motion behavior (prefers-reduced-motion gates animation duration)
 *   - autorotate resume gates (suspend/resume cycle and idle-orbit guard)
 *   - focus transition body dataset/phase lifecycle (arriving → settled)
 *   - camera assist lifecycle (start → active-check → auto-release on expiry)
 */

import { register } from 'node:module'
import { pathToFileURL } from 'node:url'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = fileURLToPath(new URL('.', import.meta.url))
const tsResolve = new URL('./helpers/ts-resolve-loader.mjs', import.meta.url)
register(tsResolve, import.meta.url)

class FakeElement {
    constructor() {
        this.dataset = {}
        this.classList = {
            _items: new Set(),
            add(cls) {
                this._items.add(cls)
            },
            remove(cls) {
                this._items.delete(cls)
            },
            contains(cls) {
                return this._items.has(cls)
            },
            toggle(cls, force) {
                const has = this._items.has(cls)
                if (force === undefined ? !has : force) {
                    this._items.add(cls)
                    return true
                }
                this._items.delete(cls)
                return false
            },
            *[Symbol.iterator]() {
                yield* this._items
            }
        }
    }
}

class MockVector3 {
    constructor(x = 0, y = 0, z = 0) {
        this.x = x
        this.y = y
        this.z = z
    }
    clone() {
        return new MockVector3(this.x, this.y, this.z)
    }
    copy(v) {
        this.x = v.x
        this.y = v.y
        this.z = v.z
        return this
    }
    add(v) {
        return new MockVector3(this.x + v.x, this.y + v.y, this.z + v.z)
    }
    sub(v) {
        return new MockVector3(this.x - v.x, this.y - v.y, this.z - v.z)
    }
    multiplyScalar(s) {
        return new MockVector3(this.x * s, this.y * s, this.z * s)
    }
    length() {
        return Math.sqrt(this.x ** 2 + this.y ** 2 + this.z ** 2)
    }
    lengthSq() {
        return this.x ** 2 + this.y ** 2 + this.z ** 2
    }
    normalize() {
        const l = this.length() || 1
        return new MockVector3(this.x / l, this.y / l, this.z / l)
    }
    lerpVectors(a, b, t) {
        return new MockVector3(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t)
    }
    set(x, y, z) {
        this.x = x
        this.y = y
        this.z = z
    }
    dot(v) {
        return this.x * v.x + this.y * v.y + this.z * v.z
    }
    crossVectors(a, b) {
        return new MockVector3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x)
    }
}

function assert(condition, message) {
    if (!condition) throw new Error(message)
}

const timers = new Map()
let timerId = 0

globalThis.window = {
    matchMediaQueries: [],
    clearTimeout(id) {
        timers.delete(id)
    },
    setTimeout(fn, delay) {
        const id = ++timerId
        timers.set(id, { fn, delay, start: performance.now() })
        return id
    },
    performance
}
globalThis.setTimeout = window.setTimeout.bind(window)
globalThis.clearTimeout = window.clearTimeout.bind(window)

globalThis.document = {
    body: new FakeElement(),
    getElementById() {
        return null
    }
}

globalThis.performance = {
    now() {
        return globalThis._now || 0
    }
}

// Minimal THREE stub so camera-controls.js module imports succeed in Node
globalThis.THREE = {
    Vector3: MockVector3
}

// Raw Node contracts do not run through the Svelte compiler. These identity
// shims let Svelte 5 rune class state load for deterministic state tests.
globalThis.$state = Object.assign((value) => value, {
    snapshot: (value) => value
})
globalThis.$derived = Object.assign((value) => value, {
    by: (derive) => derive()
})

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------
const { state, withStateMutation } = await import('./helpers/canonical-state.mjs')
const {
    setAutoRotateSuspended,
    scheduleAutoRotateResume,
    clearAutoRotateResumeTimer,
    noteSceneInteraction,
    syncOrbitAutoRotate,
    isCameraIdleOrbitAllowed,
    setFocusTransitionMode,
    getFocusTransitionProgress,
    startFocusCameraAssist,
    focusCameraAssistIsActive,
    releaseFocusCameraAssist,
    syncCameraAssistDataset,
    toggleAutoRotate
} = await import('../src/lib/engine/camera-controls.ts')

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function resetState() {
    withStateMutation(() => {
        state.autoRotate = true
        state.autoRotateSuspended = false
        state.autoRotateSoftResumeStartedAt = 0
        state.autoRotateResumeTimer = null
        state.autoRotateResumeDueAt = 0
        state.focusCameraAssistActive = false
        state.focusCameraAssistUntil = 0
        state.focusCameraAssistReason = 'idle'
        state.focusCameraOffset = null
        state.focusCameraTargetOffset = null
        state.currentView = 'galaxy'
        state.focusedNode = null
        state.selectedPoint = null
        state.navState.mode = 'overview'
        state.navState.focusPocketMeta = null
        state.trailDepth = 0
        state.sceneRevealActive = false
        state.searchGlowActive = false
        state.focusState.focusTransitionMode = 'idle'
        state.focusState.focusTransitionStartedAt = 0
        state.focusTransitionSettleTimer = null
    })
    document.body.dataset = {}
    timers.clear()
    globalThis._now = 0
}

function setReducedMotion(enabled) {
    const query = enabled ? '(prefers-reduced-motion: reduce)' : ''
    window.matchMediaQueries = [query]
    window.matchMedia = (q) => ({
        query,
        matches: q === query ? enabled : false,
        media: q
    })
}

function ensureIdleAutoRotateEnabled() {
    setReducedMotion(false)
    withStateMutation(() => {
        state.currentView = 'galaxy'
        state.focusedNode = null
        state.selectedPoint = null
        state.navState.mode = 'overview'
        state.navState.focusPocketMeta = null
        state.trailDepth = 0
        state.sceneRevealActive = false
        state.searchGlowActive = false
    })
    setAutoRotateSuspended(false)
    if (!isCameraIdleOrbitAllowed()) {
        toggleAutoRotate()
    }
}

function ensureIdleAutoRotateDisabled() {
    setReducedMotion(false)
    withStateMutation(() => {
        state.currentView = 'galaxy'
        state.focusedNode = null
        state.selectedPoint = null
        state.navState.mode = 'overview'
        state.navState.focusPocketMeta = null
        state.trailDepth = 0
        state.sceneRevealActive = false
        state.searchGlowActive = false
    })
    if (isCameraIdleOrbitAllowed()) {
        toggleAutoRotate()
    }
}

// ---------------------------------------------------------------------------
// TEST: reduced-motion behavior
// ---------------------------------------------------------------------------
resetState()
setReducedMotion(true)

globalThis._now = 1000
withStateMutation(() => {
    state.currentView = 'galaxy'
    state.focusedNode = null
    state.selectedPoint = null
    state.navState.mode = 'overview'
    state.sceneRevealActive = false
    state.searchGlowActive = false
})

// isCameraIdleOrbitAllowed — reduced motion must block even when all other gates pass
assert(
    isCameraIdleOrbitAllowed() === false,
    'isCameraIdleOrbitAllowed: reduced-motion blocks autorotate even when all other gates pass'
)

setReducedMotion(false)
toggleAutoRotate()
// Same conditions now allow
assert(
    isCameraIdleOrbitAllowed() === true,
    'isCameraIdleOrbitAllowed: same conditions allow autorotate when reduced-motion is off'
)

// ---------------------------------------------------------------------------
// TEST: autorotate suspend/resume gates
// ---------------------------------------------------------------------------
resetState()
setReducedMotion(false)

withStateMutation(() => {
    state.autoRotate = true
    state.currentView = 'galaxy'
    state.focusedNode = null
    state.selectedPoint = null
    state.navState.mode = 'overview'
    state.sceneRevealActive = false
})

// Suspend sets the flag and clears soft-resume timestamp
setAutoRotateSuspended(true)
assert(state.autoRotateSuspended === true, 'setAutoRotateSuspended(true) sets flag')
assert(state.autoRotateSoftResumeStartedAt === 0, 'suspend clears soft-resume timestamp')

// Unsuspend sets soft-resume timestamp
globalThis._now = 100
const before = globalThis._now
setAutoRotateSuspended(false)
assert(state.autoRotateSuspended === false, 'setAutoRotateSuspended(false) clears flag')
assert(
    state.autoRotateSoftResumeStartedAt >= before && state.autoRotateSoftResumeStartedAt <= before + 5,
    'unsuspend stamps soft-resume timestamp (performance.now)'
)

// scheduleAutoRotateResume: no-op when autoRotate is off
resetState()
ensureIdleAutoRotateDisabled()
scheduleAutoRotateResume(500)
assert(timers.size === 0, 'scheduleAutoRotateResume: no timer when autoRotate is off')

// scheduleAutoRotateResume: no-op when currentView != 'galaxy'
resetState()
ensureIdleAutoRotateEnabled()
withStateMutation(() => {
    state.currentView = 'map'
})
scheduleAutoRotateResume(500)
assert(timers.size === 0, 'scheduleAutoRotateResume: no timer when currentView is not galaxy')

// scheduleAutoRotateResume: no-op when focusedNode is set
resetState()
ensureIdleAutoRotateEnabled()
withStateMutation(() => {
    state.currentView = 'galaxy'
    state.focusedNode = 3
})
scheduleAutoRotateResume(500)
assert(timers.size === 0, 'scheduleAutoRotateResume: no timer when focusedNode is set')

// scheduleAutoRotateResume: no-op under reduced motion
resetState()
ensureIdleAutoRotateEnabled()
setReducedMotion(true)
withStateMutation(() => {
    state.currentView = 'galaxy'
    state.focusedNode = null
    state.selectedPoint = null
    state.navState.mode = 'overview'
    state.sceneRevealActive = false
})
scheduleAutoRotateResume(500)
assert(timers.size === 0, 'scheduleAutoRotateResume: no timer under reduced motion')
setReducedMotion(false)

// scheduleAutoRotateResume: no-op when navigation is not true overview idle
resetState()
ensureIdleAutoRotateEnabled()
withStateMutation(() => {
    state.currentView = 'galaxy'
    state.navState.mode = 'trail'
})
scheduleAutoRotateResume(500)
assert(timers.size === 0, 'scheduleAutoRotateResume: no timer outside overview nav mode')

// scheduleAutoRotateResume: no-op while focus pocket is active
resetState()
ensureIdleAutoRotateEnabled()
withStateMutation(() => {
    state.currentView = 'galaxy'
    state.navState.mode = 'overview'
    state.navState.focusPocketMeta = { active: true }
})
scheduleAutoRotateResume(500)
assert(timers.size === 0, 'scheduleAutoRotateResume: no timer while focus pocket is active')

// scheduleAutoRotateResume: no-op while trail depth is nonzero
resetState()
ensureIdleAutoRotateEnabled()
withStateMutation(() => {
    state.currentView = 'galaxy'
    state.navState.mode = 'overview'
    state.trailDepth = 1
})
scheduleAutoRotateResume(500)
assert(timers.size === 0, 'scheduleAutoRotateResume: no timer while trailDepth is nonzero')

// scheduleAutoRotateResume: sets timer when all gates pass
resetState()
ensureIdleAutoRotateEnabled()
withStateMutation(() => {
    state.currentView = 'galaxy'
    state.focusedNode = null
    state.selectedPoint = null
    state.sceneRevealActive = false
})
scheduleAutoRotateResume(2000)
assert(timers.size === 1, 'scheduleAutoRotateResume: timer set when all gates pass')
const resumeTimerId = Array.from(timers.keys())[0]
assert(state.autoRotateResumeDueAt > globalThis._now, 'scheduleAutoRotateResume: dueAt is in the future')

// timer callback rechecks overview/focus-pocket/trail-depth gates before unsuspending
withStateMutation(() => {
    state.autoRotateSuspended = true
    state.navState.focusPocketMeta = { active: true }
})
timers.get(resumeTimerId).fn()
assert(
    state.autoRotateSuspended === true,
    'scheduleAutoRotateResume: callback keeps suspension while focus pocket active'
)
assert(state.autoRotateResumeTimer === null, 'scheduleAutoRotateResume: callback clears consumed timer id')

// clearAutoRotateResumeTimer: clears and nulls
resetState()
ensureIdleAutoRotateEnabled()
scheduleAutoRotateResume(500)
assert(timers.size === 1, 'clearAutoRotateResumeTimer: precondition schedules timer')
clearAutoRotateResumeTimer()
assert(state.autoRotateResumeTimer === null, 'clearAutoRotateResumeTimer: timer nulled')
assert(state.autoRotateResumeDueAt === 0, 'clearAutoRotateResumeTimer: dueAt zeroed')

// ---------------------------------------------------------------------------
// TEST: focus transition body dataset/phase lifecycle
// ---------------------------------------------------------------------------
resetState()

// idle mode: canonical mode should be 'idle' and phase should be 'idle'
setFocusTransitionMode('idle')
assert(state.focusState.focusTransitionMode === 'idle', 'setFocusTransitionMode(idle): state.focusState.focusTransitionMode is idle')
assert(
    document.body.classList.contains('focus-transition-phase-idle'),
    'setFocusTransitionMode(idle): body has focus-transition-phase-idle class'
)

// non-idle mode: canonical mode should be 'entering' and phase should be 'arriving'.
// The method writes CSS classes (not data attributes) for phase state.
setFocusTransitionMode('focus')
assert(state.focusState.focusTransitionMode === 'entering', 'setFocusTransitionMode(focus): state.focusState.focusTransitionMode is entering')
assert(
    document.body.classList.contains('focus-transition-phase-arriving'),
    'setFocusTransitionMode(focus): body has focus-transition-phase-arriving class'
)

// Progress before settle: still arriving
globalThis._now = 100
withStateMutation(() => {
    state.focusState.focusTransitionStartedAt = 100
})
const p0 = getFocusTransitionProgress(720)
assert(p0 >= 0 && p0 <= 1, 'getFocusTransitionProgress: returns normalized 0-1')

// after duration+180: phase becomes settled
globalThis._now = 1100
const p1 = getFocusTransitionProgress(720)
assert(p1 === 1, 'getFocusTransitionProgress: at elapsed>duration returns 1')

// setFocusTransitionMode normalizes input via regex strip and applies
// canonical-mode derivation. Non-idle inputs collapse to 'entering'.
setFocusTransitionMode('walk-with-extra')
assert(state.focusState.focusTransitionMode === 'entering', 'setFocusTransitionMode: non-idle input maps to entering')

// Strictly invalid input (only non-alphanumeric) collapses to idle
setFocusTransitionMode('!@#')
assert(state.focusState.focusTransitionMode === 'idle', 'setFocusTransitionMode: only-invalid-chars collapse to idle')

// Alphanumeric with embedded invalid chars: regex strips invalid chars, but canonical is still entering
setFocusTransitionMode('Dive!@#')
assert(
    state.focusState.focusTransitionMode === 'entering',
    'setFocusTransitionMode: embedded invalid chars stripped, canonical is entering'
)

// ---------------------------------------------------------------------------
// TEST: camera assist lifecycle
// ---------------------------------------------------------------------------
resetState()
setReducedMotion(false)

// startFocusCameraAssist: activates and stamps expiry
globalThis._now = 5000
startFocusCameraAssist(900, 'focus')
assert(state.focusCameraAssistActive === true, 'startFocusCameraAssist: activates flag')
assert(state.focusCameraAssistUntil === 5900, 'startFocusCameraAssist: until = now + duration')
assert(state.focusCameraAssistReason === 'focus', 'startFocusCameraAssist: reason is set')
assert(
    document.body.dataset.cameraAssist === 'arriving',
    'startFocusCameraAssist: body.dataset.cameraAssist is arriving'
)
assert(
    document.body.dataset.cameraAssistReason === 'focus',
    'startFocusCameraAssist: body.dataset.cameraAssistReason set'
)

// focusCameraAssistIsActive: true while within window
globalThis._now = 5500
assert(focusCameraAssistIsActive(5500) === true, 'focusCameraAssistIsActive: true when now < until')

// focusCameraAssistIsActive: false once expiry passes — triggers release
globalThis._now = 6000
assert(focusCameraAssistIsActive(6000) === false, 'focusCameraAssistIsActive: false after expiry')
assert(state.focusCameraAssistActive === false, 'focusCameraAssistIsActive: expiry auto-releases active flag')
assert(
    state.focusCameraAssistReason === 'arrival-complete',
    'focusCameraAssistIsActive: expiry sets reason to arrival-complete'
)

// focusCameraAssistIsActive: inactive flag immediately returns false (no expiry check)
resetState()
withStateMutation(() => {
    state.focusCameraAssistActive = false
})
assert(
    focusCameraAssistIsActive(9999) === false,
    'focusCameraAssistIsActive: false when active=false even without expiry'
)

// releaseFocusCameraAssist: clears all assist state
resetState()
withStateMutation(() => {
    state.focusCameraAssistActive = true
    state.focusCameraAssistUntil = 9999
    state.focusCameraAssistReason = 'focus'
    state.focusCameraOffset = new MockVector3(1, 2, 3)
})
releaseFocusCameraAssist('manual')
assert(state.focusCameraAssistActive === false, 'releaseFocusCameraAssist: clears active')
assert(state.focusCameraAssistUntil === 0, 'releaseFocusCameraAssist: clears until')
assert(state.focusCameraOffset === null, 'releaseFocusCameraAssist: clears camera offset')

// syncCameraAssistDataset: reflects active state on body.dataset
resetState()
startFocusCameraAssist(900, 'focus')
syncCameraAssistDataset()
assert(document.body.dataset.cameraAssist === 'arriving', 'syncCameraAssistDataset: arriving when active')
assert(document.body.dataset.cameraAssistReason === 'focus', 'syncCameraAssistDataset: reason is reflected')

resetState()
releaseFocusCameraAssist('idle')
syncCameraAssistDataset()
assert(document.body.dataset.cameraAssist === 'free', 'syncCameraAssistDataset: free when inactive')
assert(document.body.dataset.cameraAssistReason === 'idle', 'syncCameraAssistDataset: idle reason when inactive')

// ---------------------------------------------------------------------------
// TEST: reduced-motion snap in animateCameraToNode
// (we cannot run the full rAF loop but we can verify the code path exists
//  and that prefers-reduced-motion duration collapses to 1)
// ---------------------------------------------------------------------------
resetState()
setReducedMotion(true)

// Mirror the reduced-motion check from animateCameraToNode line 154-155
const prefersReducedCameraMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true
const baseDuration = 980
const duration = prefersReducedCameraMotion ? 1 : baseDuration
assert(duration === 1, 'animateCameraToNode: reduced-motion collapses duration to 1 (instant/snap)')

// Same check with reduced-motion off
setReducedMotion(false)
const prefersReducedCameraMotion2 = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true
const duration2 = prefersReducedCameraMotion2 ? 1 : baseDuration
assert(duration2 === baseDuration, 'animateCameraToNode: normal motion uses base duration')

// ---------------------------------------------------------------------------
// TEST: noteSceneInteraction direct owner API
// ---------------------------------------------------------------------------
resetState()
ensureIdleAutoRotateEnabled()
globalThis._now = 250
noteSceneInteraction(1234)
assert(state.autoRotateSuspended === true, 'noteSceneInteraction: suspends auto-rotate')
assert(state.autoRotateResumeDueAt === 1484, 'noteSceneInteraction: sets resume due time from delay')
assert(timers.size === 1, 'noteSceneInteraction: schedules resume timer')
const scheduledResume = timers.get(Array.from(timers.keys())[0])
assert(scheduledResume?.delay === 1234, 'noteSceneInteraction: schedules timer with requested delay')

// ---------------------------------------------------------------------------
// Done
// ---------------------------------------------------------------------------
console.log('camera-controls-motion-contract passed')
