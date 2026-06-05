/**
 * @lib/stores/camera.ts — Camera choreography, orbit slack, and transition store
 *
 * Replaces:
 *   - js/modules/camera-controls.js (choreography state)
 *   - js/modules/camera-orbit-slack.js (orbit slack state)
 *   - Camera slices from js/state.js
 *
 * Camera state holds the Svelte-side truth for camera position, auto-rotate,
 * and transition lifecycle. The actual Three.js camera is owned by the engine;
 * the bridge translates between these stores and the imperative engine calls.
 */
import { writable, derived, get } from 'svelte/store';
import type {
  CameraState,
  CameraTransition,
  FocusOrbitSlackState
} from '@lib/types/state';

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
} as const;

// ── Overview Camera Pose (from camera-controls-restore.js) ───────────────────

export const OVERVIEW_CAMERA_POSE = {
  position: [0, 0.45, 3.0] as [number, number, number],
  target: [0, 0, 0] as [number, number, number]
} as const;

// ── Initial State ────────────────────────────────────────────────────────────

const DEFAULT_POSITION: [number, number, number] = [0, 0, 3];
const DEFAULT_TARGET: [number, number, number] = [0, 0, 0];

const INITIAL_TRANSITION: CameraTransition = {
  phase: 'idle',
  token: 0,
  startedAt: 0,
  durationMs: 0,
  from: { position: DEFAULT_POSITION, target: DEFAULT_TARGET },
  to: { position: DEFAULT_POSITION, target: DEFAULT_TARGET }
};

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
};

const INITIAL_CAMERA: CameraState = {
  position: DEFAULT_POSITION,
  target: DEFAULT_TARGET,
  transition: { ...INITIAL_TRANSITION },
  autoRotate: false,
  autoRotateSuspended: false,
  autoRotateSpeed: CAMERA_CONFIG.AUTO_ROTATE_BASE_SPEED
};

// ── Extended Camera Store (includes orbit slack) ─────────────────────────────

export interface CameraStoreState extends CameraState {
  orbitSlack: FocusOrbitSlackState;
  /** Resume timer expiry timestamp (ms from performance.now). */
  autoResumeDueAt: number;
  /** Soft resume started timestamp. */
  softResumeStartedAt: number;
  /** Whether the camera assist (auto-follow during focus) is active. */
  cameraAssistActive: boolean;
  /** Camera assist expiry timestamp. */
  cameraAssistUntil: number;
  /** Camera assist reason. */
  cameraAssistReason: string;
  /** Route exploration phase. */
  routeExplorationPhase: 'idle' | 'exploring' | 'user-control';
  /** Route exploration reason. */
  routeExplorationReason: string;
  /** Route choreography phase. */
  routeChoreographyPhase: string;
  /** Whether the camera has settled to overview pose. */
  cameraIdleOrbitAllowed: boolean;
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
};

// ── Store ────────────────────────────────────────────────────────────────────

export const cameraStore = writable<CameraStoreState>({ ...INITIAL_STORE });
export const cameraState = cameraStore;

// ── Derived ──────────────────────────────────────────────────────────────────

export const cameraPosition = derived(cameraStore, ($c) => $c.position);
export const cameraTarget = derived(cameraStore, ($c) => $c.target);
export const cameraTransitionPhase = derived(cameraStore, ($c) => $c.transition.phase);
export const isAutoRotating = derived(cameraStore, ($c) => $c.autoRotate && !$c.autoRotateSuspended);
export const isTransitioning = derived(cameraStore, ($c) => $c.transition.phase === 'transitioning');
export const orbitSlackPhase = derived(cameraStore, ($c) => $c.orbitSlack.phase);
export const cameraAssistActive = derived(cameraStore, ($c) => $c.cameraAssistActive);

// ── Actions: Basic Camera ────────────────────────────────────────────────────

export function setCameraPosition(position: [number, number, number]): void {
  cameraStore.update((s) => ({ ...s, position }));
}

export function setCameraTarget(target: [number, number, number]): void {
  cameraStore.update((s) => ({ ...s, target }));
}

export function setAutoRotate(enabled: boolean): void {
  cameraStore.update((s) => ({ ...s, autoRotate: enabled }));
}

export function suspendAutoRotate(): void {
  cameraStore.update((s) => ({ ...s, autoRotateSuspended: true }));
}

export function resumeAutoRotate(): void {
  cameraStore.update((s) => ({ ...s, autoRotateSuspended: false }));
}

export function toggleAutoRotate(): void {
  cameraStore.update((s) => ({
    ...s,
    autoRotate: !s.autoRotate,
    autoRotateSuspended: false
  }));
}

/**
 * Start a camera transition to a target position/target.
 * Returns the transition token for cancellation checks.
 */
export function startCameraTransition(
  to: { position: [number, number, number]; target: [number, number, number] },
  durationMs: number
): number {
  const current = get(cameraStore);
  const token = current.transition.token + 1;

  cameraStore.update((s) => ({
    ...s,
    transition: {
      phase: 'transitioning',
      token,
      startedAt: performance.now(),
      durationMs,
      from: { position: s.position, target: s.target },
      to
    }
  }));

  return token;
}

/** Mark the current transition as arrived. */
export function completeCameraTransition(): void {
  cameraStore.update((s) => ({
    ...s,
    position: s.transition.to.position,
    target: s.transition.to.target,
    transition: { ...s.transition, phase: 'arrived' }
  }));

  // Sync body data attribute
  if (typeof document !== 'undefined' && document.body) {
    document.body.dataset.cameraTransition = 'arrived';
  }
}

/** Reset camera to initial state. */
export function resetCamera(): void {
  cameraStore.set({ ...INITIAL_STORE });
  if (typeof document !== 'undefined' && document.body) {
    document.body.dataset.cameraTransition = 'idle';
    document.body.dataset.cameraSlack = 'idle';
  }
}

// ── Actions: Auto-Rotate Resume ──────────────────────────────────────────────

/** Schedule auto-rotate resume after a delay (ms). */
export function scheduleAutoRotateResume(delayMs: number): void {
  cameraStore.update((s) => ({
    ...s,
    autoResumeDueAt: performance.now() + delayMs
  }));
}

/** Clear any pending auto-rotate resume. */
export function clearAutoRotateResumeTimer(): void {
  cameraStore.update((s) => ({ ...s, autoResumeDueAt: 0 }));
}

/** Start the soft resume of auto-rotate (gradual speed-up). */
export function startAutoRotateSoftResume(): void {
  cameraStore.update((s) => ({
    ...s,
    softResumeStartedAt: performance.now()
  }));
}

/** Note a scene interaction — suspends auto-rotate and schedules resume. */
export function noteSceneInteraction(delayMs: number = CAMERA_CONFIG.AUTO_ROTATE_MANUAL_IDLE_MS): void {
  suspendAutoRotate();
  scheduleAutoRotateResume(delayMs);
}

// ── Actions: Camera Assist ───────────────────────────────────────────────────

/** Start camera assist (auto-follow during focus). */
export function startFocusCameraAssist(
  durationMs: number = 900,
  reason: string = 'focus'
): void {
  cameraStore.update((s) => ({
    ...s,
    cameraAssistActive: true,
    cameraAssistUntil: performance.now() + durationMs,
    cameraAssistReason: reason
  }));

  if (typeof document !== 'undefined' && document.body) {
    document.body.dataset.cameraAssist = 'active';
    document.body.dataset.cameraAssistReason = reason;
  }
}

/** Release camera assist. */
export function releaseFocusCameraAssist(reason: string = 'manual'): void {
  cameraStore.update((s) => ({
    ...s,
    cameraAssistActive: false,
    cameraAssistUntil: 0,
    cameraAssistReason: reason
  }));

  if (typeof document !== 'undefined' && document.body) {
    document.body.dataset.cameraAssist = '';
    document.body.dataset.cameraAssistReason = reason;
  }
}

/** Check if camera assist is currently active. */
export function isFocusCameraAssistActive(now: number = performance.now()): boolean {
  const s = get(cameraStore);
  return s.cameraAssistActive && now < s.cameraAssistUntil;
}

// ── Actions: Route Exploration ───────────────────────────────────────────────

/** Set the route exploration state. */
export function setRouteExplorationState(
  phase: 'idle' | 'exploring' | 'user-control',
  reason: string = ''
): void {
  cameraStore.update((s) => ({
    ...s,
    routeExplorationPhase: phase,
    routeExplorationReason: reason
  }));

  if (typeof document !== 'undefined' && document.body) {
    document.body.dataset.routeExploration = phase;
  }
}

/** Clear route exploration state. */
export function clearRouteExploration(reason: string = 'clear'): void {
  setRouteExplorationState('idle', reason);
}

/** Mark route exploration as active (user panned/rotated). */
export function markRouteExploration(reason: string = 'user-control'): void {
  setRouteExplorationState('user-control', reason);
}

/** Check if route exploration should be marked (not already active). */
export function shouldMarkRouteExploration(reason: string = ''): boolean {
  const s = get(cameraStore);
  return s.routeExplorationPhase !== 'user-control';
}

// ── Actions: Orbit Slack ─────────────────────────────────────────────────────

/** Update the orbit slack state (from camera-orbit-slack.js). */
export function updateOrbitSlack(patch: Partial<FocusOrbitSlackState>): void {
  cameraStore.update((s) => ({
    ...s,
    orbitSlack: { ...s.orbitSlack, ...patch }
  }));

  if (typeof document !== 'undefined' && document.body && patch.phase) {
    document.body.dataset.cameraSlack = patch.phase;
    if (patch.reason) {
      document.body.dataset.cameraSlackReason = patch.reason;
    }
  }
}

/** Reset orbit slack to defaults. */
export function resetOrbitSlack(): void {
  cameraStore.update((s) => ({
    ...s,
    orbitSlack: { ...INITIAL_ORBIT_SLACK }
  }));

  if (typeof document !== 'undefined' && document.body) {
    document.body.dataset.cameraSlack = 'idle';
  }
}

// ── Actions: Focus Transition Mode ───────────────────────────────────────────

export type FocusTransitionCameraMode = 'idle' | 'entering' | 'settling' | 'inside' | 'exiting';

/** Set the focus transition mode on the camera store. */
export function setFocusTransitionMode(mode: FocusTransitionCameraMode): void {
  cameraStore.update((s) => ({
    ...s,
    transition: {
      ...s.transition,
      phase: mode === 'idle' ? 'idle' : s.transition.phase
    }
  }));

  if (typeof document !== 'undefined' && document.body) {
    document.body.dataset.focusTransition = mode;
  }
}

// ── Helper: Is search route focus active? ────────────────────────────────────

/**
 * Determines if the search-route focus state is active.
 * This is a read-only query combining view, focus, search, and trail state.
 * Delegates actual state reads to the caller's context.
 */
export function isSearchRouteFocusActive(params: {
  currentView: string;
  hasFocus: boolean;
  hasSearch: boolean;
  walkDepth: number;
  semanticDiveMode: boolean;
}): boolean {
  return (
    params.currentView === 'galaxy' &&
    !params.semanticDiveMode &&
    params.hasFocus &&
    params.hasSearch &&
    params.walkDepth === 0
  );
}

// ── Helper: Get route layer origin ───────────────────────────────────────────

/** Get the route layer origin from the camera store. */
export function getRouteLayerOrigin(): [number, number, number] | null {
  const s = get(cameraStore);
  return s.target;
}
