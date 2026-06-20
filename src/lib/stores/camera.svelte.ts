/**
 * @lib/stores/camera.svelte.ts — Camera choreography, orbit slack, and transition store
 *
 * Svelte 5/Svelte-first port.
 *
 * Camera state holds the Svelte-side truth for camera position, auto-rotate,
 * and transition lifecycle. The actual Three.js camera is owned by the engine;
 * the bridge translates between these stores and the imperative engine calls.
 */
import type { Readable } from 'svelte/store'
import type { CameraState, CameraTransition, FocusOrbitSlackState } from '@lib/types/state'
import { appState } from '@lib/state/app.svelte.ts'

// ── Configuration Constants (from state.js) ──────────────────────────────────

export const CAMERA_CONFIG = {
    AUTO_ROTATE_BASE_SPEED: 0.34,
    AUTO_ROTATE_IDLE_MS: 3600,
    AUTO_ROTATE_MANUAL_IDLE_MS: 5200,
    AUTO_ROTATE_SOFT_RESUME_MS: 1800,
    ORBIT_MIN_DISTANCE_DEFAULT: 0.5,
    ORBIT_MIN_DISTANCE_INSIDE: 0.24,
    ORBIT_MAX_DISTANCE_DEFAULT: 5.5,
    ORBIT_MAX_DISTANCE_FREE: 6.8,
    ORBIT_ROTATE_SPEED_DEFAULT: 0.6,
    ORBIT_ROTATE_SPEED_FREE: 0.82,
    ORBIT_PAN_SPEED_DEFAULT: 0.5,
    ORBIT_PAN_SPEED_FREE: 0.68,
    SELECTED_CARD_FADE_MS: 180,
    MOBILE_ROUTE_FIELD_PEEK_MS: 1550,
    SEARCH_TRAIL_CUE_MIN_DWELL_MS: 920
} as const

// ── Overview Camera Pose (from camera-controls-restore.js) ───────────────────

export const OVERVIEW_CAMERA_POSE = {
    position: [0, 0.45, 3.0] as [number, number, number],
    target: [0, 0, 0] as [number, number, number]
} as const

// ── Initial State ────────────────────────────────────────────────────────────

const DEFAULT_POSITION: [number, number, number] = [0, 0, 3]
const DEFAULT_TARGET: [number, number, number] = [0, 0, 0]

const INITIAL_TRANSITION: CameraTransition = {
    phase: 'idle',
    token: 0,
    startedAt: 0,
    durationMs: 0,
    from: { position: DEFAULT_POSITION, target: DEFAULT_TARGET },
    to: { position: DEFAULT_POSITION, target: DEFAULT_TARGET }
}

const INITIAL_ORBIT_SLACK: FocusOrbitSlackState = {
    phase: 'idle',
    reason: '',
    startedAt: 0,
    targetShift: 0,
    cameraShift: 0,
    distanceBefore: 0,
    distanceAfter: 0,
    maxDistance: CAMERA_CONFIG.ORBIT_MAX_DISTANCE_DEFAULT,
    rotateSpeed: CAMERA_CONFIG.ORBIT_ROTATE_SPEED_DEFAULT,
    panSpeed: CAMERA_CONFIG.ORBIT_PAN_SPEED_DEFAULT
}

const INITIAL_CAMERA: CameraState = {
    position: DEFAULT_POSITION,
    target: DEFAULT_TARGET,
    transition: { ...INITIAL_TRANSITION },
    autoRotate: false,
    autoRotateSuspended: false,
    autoRotateSpeed: CAMERA_CONFIG.AUTO_ROTATE_BASE_SPEED
}

// ── Extended Camera Store (includes orbit slack) ─────────────────────────────

export interface CameraStoreState extends CameraState {
    orbitSlack: FocusOrbitSlackState
    /** Resume timer expiry timestamp (ms from performance.now). */
    autoResumeDueAt: number
    /** Soft resume started timestamp. */
    softResumeStartedAt: number
    /** Whether the camera assist (auto-follow during focus) is active. */
    cameraAssistActive: boolean
    /** Camera assist expiry timestamp. */
    cameraAssistUntil: number
    /** Camera assist reason. */
    cameraAssistReason: string
    /** Route exploration phase. */
    routeExplorationPhase: 'idle' | 'exploring' | 'user-control'
    /** Route exploration reason. */
    routeExplorationReason: string
    /** Route choreography phase. */
    routeChoreographyPhase: string
    /** Whether the camera has settled to overview pose. */
    cameraIdleOrbitAllowed: boolean
}

const INITIAL_STORE: CameraStoreState = {
    ...INITIAL_CAMERA,
    orbitSlack: { ...INITIAL_ORBIT_SLACK },
    autoResumeDueAt: 0,
    softResumeStartedAt: 0,
    cameraAssistActive: false,
    cameraAssistUntil: 0,
    cameraAssistReason: 'idle',
    routeExplorationPhase: 'idle',
    routeExplorationReason: '',
    routeChoreographyPhase: 'overview',
    cameraIdleOrbitAllowed: true
}

// ── Svelte 5 Reactive Store Implementation ───────────────────────────────────

class CameraStoreControl {
    // Local reactive state for camera-only fields
    private _position = $state<[number, number, number]>([...DEFAULT_POSITION])
    private _target = $state<[number, number, number]>([...DEFAULT_TARGET])
    private _transition = $state<CameraTransition>({ ...INITIAL_TRANSITION })
    private _autoRotateSpeed = $state<number>(CAMERA_CONFIG.AUTO_ROTATE_BASE_SPEED)
    private _orbitSlack = $state<FocusOrbitSlackState>({ ...INITIAL_ORBIT_SLACK })

    private _cameraAssistActive = $state<boolean>(false)
    private _cameraAssistUntil = $state<number>(0)
    private _cameraAssistReason = $state<string>('idle')

    private _routeExplorationPhase = $state<'idle' | 'exploring' | 'user-control'>('idle')
    private _routeExplorationReason = $state<string>('')
    private _routeChoreographyPhase = $state<string>('overview')
    private _cameraIdleOrbitAllowed = $state<boolean>(true)

    // Synchronized subscribers
    private subscribers = new Set<(s: CameraStoreState) => void>()

    // Getters & Setters mapping to local reactive fields or appState mirrors
    get position() {
        return this._position
    }
    set position(v) {
        this._position = v
        this.notify()
    }

    get target() {
        return this._target
    }
    set target(v) {
        this._target = v
        this.notify()
    }

    get transition() {
        return this._transition
    }
    set transition(v) {
        this._transition = v
        this.notify()
    }

    get autoRotateSpeed() {
        return this._autoRotateSpeed
    }
    set autoRotateSpeed(v) {
        this._autoRotateSpeed = v
        this.notify()
    }

    get orbitSlack() {
        return this._orbitSlack
    }
    set orbitSlack(v) {
        this._orbitSlack = v
        this.notify()
    }

    get cameraAssistActive() {
        return this._cameraAssistActive
    }
    set cameraAssistActive(v) {
        this._cameraAssistActive = v
        this.notify()
    }

    get cameraAssistUntil() {
        return this._cameraAssistUntil
    }
    set cameraAssistUntil(v) {
        this._cameraAssistUntil = v
        this.notify()
    }

    get cameraAssistReason() {
        return this._cameraAssistReason
    }
    set cameraAssistReason(v) {
        this._cameraAssistReason = v
        this.notify()
    }

    get routeExplorationPhase() {
        return this._routeExplorationPhase
    }
    set routeExplorationPhase(v) {
        this._routeExplorationPhase = v
        this.notify()
    }

    get routeExplorationReason() {
        return this._routeExplorationReason
    }
    set routeExplorationReason(v) {
        this._routeExplorationReason = v
        this.notify()
    }

    get routeChoreographyPhase() {
        return this._routeChoreographyPhase
    }
    set routeChoreographyPhase(v) {
        this._routeChoreographyPhase = v
        this.notify()
    }

    get cameraIdleOrbitAllowed() {
        return this._cameraIdleOrbitAllowed
    }
    set cameraIdleOrbitAllowed(v) {
        this._cameraIdleOrbitAllowed = v
        this.notify()
    }

    // AppState mapped properties
    get autoRotate() {
        return appState.autoRotate
    }
    set autoRotate(v) {
        appState.withMutation(() => {
            appState.autoRotate = v
        })
        this.notify()
    }

    get autoRotateSuspended() {
        return appState.autoRotateSuspended
    }
    set autoRotateSuspended(v) {
        appState.withMutation(() => {
            appState.autoRotateSuspended = v
        })
        this.notify()
    }

    get autoResumeDueAt() {
        return appState.autoRotateResumeDueAt
    }
    set autoResumeDueAt(v) {
        appState.withMutation(() => {
            appState.autoRotateResumeDueAt = v
        })
        this.notify()
    }

    get softResumeStartedAt() {
        return appState.autoRotateSoftResumeStartedAt
    }
    set softResumeStartedAt(v) {
        appState.withMutation(() => {
            appState.autoRotateSoftResumeStartedAt = v
        })
        this.notify()
    }

    /**
     * Get a snapshot representation of the current store state.
     */
    getSnapshot(): CameraStoreState {
        return {
            position: this.position,
            target: this.target,
            transition: this.transition,
            autoRotate: this.autoRotate,
            autoRotateSuspended: this.autoRotateSuspended,
            autoRotateSpeed: this.autoRotateSpeed,
            orbitSlack: this.orbitSlack,
            autoResumeDueAt: this.autoResumeDueAt,
            softResumeStartedAt: this.softResumeStartedAt,
            cameraAssistActive: this.cameraAssistActive,
            cameraAssistUntil: this.cameraAssistUntil,
            cameraAssistReason: this.cameraAssistReason,
            routeExplorationPhase: this.routeExplorationPhase,
            routeExplorationReason: this.routeExplorationReason,
            routeChoreographyPhase: this.routeChoreographyPhase,
            cameraIdleOrbitAllowed: this.cameraIdleOrbitAllowed
        }
    }

    /**
     * Enable Svelte Readable/Writable store contract.
     */
    subscribe = (run: (s: CameraStoreState) => void): (() => void) => {
        this.subscribers.add(run)
        run(this.getSnapshot())
        return () => {
            this.subscribers.delete(run)
        }
    }

    notify(): void {
        const snap = this.getSnapshot()
        for (const run of this.subscribers) {
            try {
                run(snap)
            } catch (err) {
                console.error('[CameraStore] Subscription notification error:', err)
            }
        }
    }

    update(updater: (s: CameraStoreState) => CameraStoreState): void {
        const next = updater(this.getSnapshot())
        // Assign fields individually or update the Svelte state
        this._position = next.position
        this._target = next.target
        this._transition = next.transition
        this._autoRotateSpeed = next.autoRotateSpeed
        this._orbitSlack = next.orbitSlack
        this._cameraAssistActive = next.cameraAssistActive
        this._cameraAssistUntil = next.cameraAssistUntil
        this._cameraAssistReason = next.cameraAssistReason
        this._routeExplorationPhase = next.routeExplorationPhase
        this._routeExplorationReason = next.routeExplorationReason
        this._routeChoreographyPhase = next.routeChoreographyPhase
        this._cameraIdleOrbitAllowed = next.cameraIdleOrbitAllowed

        appState.withMutation(() => {
            appState.autoRotate = next.autoRotate
            appState.autoRotateSuspended = next.autoRotateSuspended
            appState.autoRotateResumeDueAt = next.autoResumeDueAt
            appState.autoRotateSoftResumeStartedAt = next.softResumeStartedAt
        })

        this.notify()
    }

    set(next: CameraStoreState): void {
        this.update(() => next)
    }
}

const cameraStoreImpl = new CameraStoreControl()

/** CameraStore type: Readable + property accessors + Writable-ish. */
export type CameraStoreApi = Readable<CameraStoreState> & {
    update(fn: (s: CameraStoreState) => CameraStoreState): void
    set(value: CameraStoreState): void
} & { [K in keyof CameraStoreState]: CameraStoreState[K] }

/** Create the proxied API so that cameraStore.property accessor lookups work. */
function createCameraStoreApi(): CameraStoreApi {
    const api: Partial<CameraStoreApi> = {
        subscribe: cameraStoreImpl.subscribe,
        update: (fn) => cameraStoreImpl.update(fn),
        set: (val) => cameraStoreImpl.set(val)
    }

    const stateKeys = [
        'position',
        'target',
        'transition',
        'autoRotate',
        'autoRotateSuspended',
        'autoRotateSpeed',
        'orbitSlack',
        'autoResumeDueAt',
        'softResumeStartedAt',
        'cameraAssistActive',
        'cameraAssistUntil',
        'cameraAssistReason',
        'routeExplorationPhase',
        'routeExplorationReason',
        'routeChoreographyPhase',
        'cameraIdleOrbitAllowed'
    ] as const

    for (const key of stateKeys) {
        Object.defineProperty(api, key, {
            get() {
                return cameraStoreImpl[key]
            },
            set(v) {
                ;(cameraStoreImpl as any)[key] = v
            },
            enumerable: true,
            configurable: true
        })
    }

    return api as CameraStoreApi
}

/** Single reactive instance of the camera state. */
export const cameraStore: CameraStoreApi = createCameraStoreApi()
/** Backwards-compatible alias. */
export const cameraState = cameraStore

// ── Derived Getters ──────────────────────────────────────────────────────────

export function cameraPosition(): [number, number, number] {
    return cameraStoreImpl.position
}
export function cameraTarget(): [number, number, number] {
    return cameraStoreImpl.target
}
export function autoRotate(): boolean {
    return cameraStoreImpl.autoRotate
}
export function autoRotateSuspended(): boolean {
    return cameraStoreImpl.autoRotateSuspended
}
export function cameraTransitionPhase(): string {
    return cameraStoreImpl.transition.phase
}
export function isAutoRotating(): boolean {
    return cameraStoreImpl.autoRotate && !cameraStoreImpl.autoRotateSuspended
}
export function isTransitioning(): boolean {
    return cameraStoreImpl.transition.phase === 'transitioning'
}
export function orbitSlackPhase(): string {
    return cameraStoreImpl.orbitSlack.phase
}
export function cameraAssistActive(): boolean {
    return cameraStoreImpl.cameraAssistActive
}

// ── Actions: Basic Camera ────────────────────────────────────────────────────

export function setCameraPosition(position: [number, number, number]): void {
    cameraStoreImpl.position = position
}

export function setCameraTarget(target: [number, number, number]): void {
    cameraStoreImpl.target = target
}

export function setAutoRotate(enabled: boolean): void {
    cameraStoreImpl.autoRotate = enabled
}

export function suspendAutoRotate(): void {
    cameraStoreImpl.autoRotateSuspended = true
}

export function resumeAutoRotate(): void {
    cameraStoreImpl.autoRotateSuspended = false
}

export function toggleAutoRotate(): void {
    const currentAuto = cameraStoreImpl.autoRotate
    appState.withMutation(() => {
        appState.autoRotate = !currentAuto
        appState.autoRotateSuspended = false
    })
    cameraStoreImpl.notify()
}

/**
 * Start a camera transition to a target position/target.
 * Returns the transition token for cancellation checks.
 */
export function startCameraTransition(
    to: { position: [number, number, number]; target: [number, number, number] },
    durationMs: number
): number {
    const token = cameraStoreImpl.transition.token + 1

    cameraStoreImpl.transition = {
        phase: 'transitioning',
        token,
        startedAt: performance.now(),
        durationMs,
        from: { position: cameraStoreImpl.position, target: cameraStoreImpl.target },
        to
    }

    return token
}

/** Mark the current transition as arrived. */
export function completeCameraTransition(): void {
    cameraStoreImpl.update((s) => ({
        ...s,
        position: s.transition.to.position,
        target: s.transition.to.target,
        transition: { ...s.transition, phase: 'arrived' }
    }))

    // Sync body data attribute
    if (typeof document !== 'undefined' && document.body) {
        document.body.dataset.cameraTransition = 'arrived'
    }
}

/** Reset camera to initial state. */
export function resetCamera(): void {
    cameraStoreImpl.set({ ...INITIAL_STORE })
    if (typeof document !== 'undefined' && document.body) {
        document.body.dataset.cameraTransition = 'idle'
        document.body.dataset.cameraSlack = 'idle'
    }
}

// ── Actions: Auto-Rotate Resume ──────────────────────────────────────────────

/** Schedule auto-rotate resume after a delay (ms). */
export function scheduleAutoRotateResume(delayMs: number): void {
    cameraStoreImpl.autoResumeDueAt = performance.now() + delayMs
}

/** Clear any pending auto-rotate resume. */
export function clearAutoRotateResumeTimer(): void {
    cameraStoreImpl.autoResumeDueAt = 0
}

/** Start the soft resume of auto-rotate (gradual speed-up). */
export function startAutoRotateSoftResume(): void {
    cameraStoreImpl.softResumeStartedAt = performance.now()
}

/** Note a scene interaction — suspends auto-rotate and schedules resume. */
export function noteSceneInteraction(delayMs: number = CAMERA_CONFIG.AUTO_ROTATE_MANUAL_IDLE_MS): void {
    suspendAutoRotate()
    scheduleAutoRotateResume(delayMs)
}

// ── Actions: Camera Assist ───────────────────────────────────────────────────

/** Start camera assist (auto-follow during focus). */
export function startFocusCameraAssist(durationMs: number = 900, reason: string = 'focus'): void {
    cameraStoreImpl.update((s) => ({
        ...s,
        cameraAssistActive: true,
        cameraAssistUntil: performance.now() + durationMs,
        cameraAssistReason: reason
    }))

    if (typeof document !== 'undefined' && document.body) {
        document.body.dataset.cameraAssist = 'active'
        document.body.dataset.cameraAssistReason = reason
    }
}

/** Release camera assist. */
export function releaseFocusCameraAssist(reason: string = 'manual'): void {
    cameraStoreImpl.update((s) => ({
        ...s,
        cameraAssistActive: false,
        cameraAssistUntil: 0,
        cameraAssistReason: reason
    }))

    if (typeof document !== 'undefined' && document.body) {
        document.body.dataset.cameraAssist = ''
        document.body.dataset.cameraAssistReason = reason
    }
}

/** Check if camera assist is currently active. */
export function isFocusCameraAssistActive(now: number = performance.now()): boolean {
    return cameraStoreImpl.cameraAssistActive && now < cameraStoreImpl.cameraAssistUntil
}

// ── Actions: Route Exploration ───────────────────────────────────────────────

/** Set the route exploration state. */
export function setRouteExplorationState(phase: 'idle' | 'exploring' | 'user-control', reason: string = ''): void {
    cameraStoreImpl.update((s) => ({
        ...s,
        routeExplorationPhase: phase,
        routeExplorationReason: reason
    }))

    if (typeof document !== 'undefined' && document.body) {
        document.body.dataset.routeExploration = phase
    }
}

/** Clear route exploration state. */
export function clearRouteExploration(reason: string = 'clear'): void {
    setRouteExplorationState('idle', reason)
}

/** Mark route exploration as active (user panned/rotated). */
export function markRouteExploration(reason: string = 'user-control'): void {
    setRouteExplorationState('user-control', reason)
}

/** Check if route exploration should be marked (not already active). */
export function shouldMarkRouteExploration(_reason: string = ''): boolean {
    return cameraStoreImpl.routeExplorationPhase !== 'user-control'
}

// ── Actions: Orbit Slack ─────────────────────────────────────────────────────

/** Update the orbit slack state (from camera-orbit-slack.js). */
export function updateOrbitSlack(patch: Partial<FocusOrbitSlackState>): void {
    cameraStoreImpl.update((s) => ({
        ...s,
        orbitSlack: { ...s.orbitSlack, ...patch }
    }))

    if (typeof document !== 'undefined' && document.body && patch.phase) {
        document.body.dataset.cameraSlack = patch.phase
        if (patch.reason) {
            document.body.dataset.cameraSlackReason = patch.reason
        }
    }
}

/** Reset orbit slack to defaults. */
export function resetOrbitSlack(): void {
    cameraStoreImpl.update((s) => ({
        ...s,
        orbitSlack: { ...INITIAL_ORBIT_SLACK }
    }))

    if (typeof document !== 'undefined' && document.body) {
        document.body.dataset.cameraSlack = 'idle'
    }
}

// ── Actions: Focus Transition Mode ───────────────────────────────────────────

export type FocusTransitionCameraMode = 'idle' | 'entering' | 'settling' | 'inside' | 'exiting'

/** Set the focus transition mode on the camera store. */
export function setFocusTransitionMode(mode: FocusTransitionCameraMode): void {
    cameraStoreImpl.update((s) => ({
        ...s,
        transition: {
            ...s.transition,
            phase: mode === 'idle' ? 'idle' : s.transition.phase
        }
    }))

    if (typeof document !== 'undefined' && document.body) {
        document.body.dataset.focusTransition = mode
    }
}

// ── Helper: Is search route focus active? ────────────────────────────────────

/**
 * Determines if the search-route focus state is active.
 * This is a read-only query combining view, focus, search, and trail state.
 * Delegates actual state reads to the caller's context.
 */
export function isSearchRouteFocusActive(params: {
    currentView: string
    hasFocus: boolean
    hasSearch: boolean
    walkDepth: number
    semanticDiveMode: boolean
}): boolean {
    return (
        params.currentView === 'galaxy' &&
        !params.semanticDiveMode &&
        params.hasFocus &&
        params.hasSearch &&
        params.walkDepth === 0
    )
}

// ── Helper: Get route layer origin ───────────────────────────────────────────

/** Get the route layer origin from the camera store. */
export function getRouteLayerOrigin(): [number, number, number] | null {
    return cameraStoreImpl.target
}
