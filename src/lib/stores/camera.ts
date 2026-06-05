/**
 * @lib/stores/camera.ts — Camera position, target, and transition store
 */
import { writable, derived, get } from 'svelte/store';
import type { CameraState, CameraTransition } from '@lib/types/state';

// ── Initial state ─────────────────────────────────────────────────────────────

const IDENTITY_POSITION: [number, number, number] = [0, 0, 0];
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

const INITIAL_CAMERA: CameraState = {
  position: DEFAULT_POSITION,
  target: DEFAULT_TARGET,
  transition: { ...INITIAL_TRANSITION },
  autoRotate: false,
  autoRotateSuspended: false,
  autoRotateSpeed: 0.34
};

// ── Store ─────────────────────────────────────────────────────────────────────

export const cameraState = writable<CameraState>({ ...INITIAL_CAMERA });

// ── Derived ───────────────────────────────────────────────────────────────────

export const cameraPosition = derived(cameraState, ($c) => $c.position);
export const cameraTarget = derived(cameraState, ($c) => $c.target);
export const cameraTransitionPhase = derived(cameraState, ($c) => $c.transition.phase);
export const isAutoRotating = derived(cameraState, ($c) => $c.autoRotate && !$c.autoRotateSuspended);
export const isTransitioning = derived(cameraState, ($c) => $c.transition.phase === 'transitioning');

// ── Actions ───────────────────────────────────────────────────────────────────

export function setCameraPosition(position: [number, number, number]): void {
  cameraState.update((s) => ({ ...s, position }));
}

export function setCameraTarget(target: [number, number, number]): void {
  cameraState.update((s) => ({ ...s, target }));
}

export function setAutoRotate(enabled: boolean): void {
  cameraState.update((s) => ({ ...s, autoRotate: enabled }));
}

export function suspendAutoRotate(): void {
  cameraState.update((s) => ({
    ...s,
    autoRotateSuspended: true
  }));
}

export function resumeAutoRotate(): void {
  cameraState.update((s) => ({
    ...s,
    autoRotateSuspended: false
  }));
}

export function startCameraTransition(
  to: { position: [number, number, number]; target: [number, number, number] },
  durationMs: number
): number {
  const current = get(cameraState);
  const token = current.transition.token + 1;

  cameraState.update((s) => ({
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

export function completeCameraTransition(): void {
  const current = get(cameraState);
  cameraState.update((s) => ({
    ...s,
    position: s.transition.to.position,
    target: s.transition.to.target,
    transition: {
      ...s.transition,
      phase: 'arrived'
    }
  }));
}

export function resetCamera(): void {
  cameraState.set({ ...INITIAL_CAMERA });
}
