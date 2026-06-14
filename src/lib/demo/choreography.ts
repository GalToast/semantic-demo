/**
 * @lib/demo/choreography.ts — Micro-demo orchestration facade
 *
 * Port of js/modules/micro-demo.js
 *
 * Thin facade: eligibility guards, showcase pool selection, retry loop,
 * and choreography delegation. The actual camera/UI choreography lives
 * in the legacy micro-demo-choreography.js module (port pending).
 *
 * Uses the demoStore for canonical demo state (get(demoPhase)).
 */
import { get } from 'svelte/store';
import { state } from '../../../js/state.js';
import { debugWarn } from '@lib/utils/diagnostic-adapter';
import {
  isAppReadyForDemo,
  guardNotSeen,
  guardReducedMotion,
  guardWebGL,
  guardUrlParam,
  notifyDemoUnableToStart,
  SESSION_STORAGE_KEY,
} from './guards';
import { seededUnit } from '@lib/utils/seeded-random';
import { demoPhase, isDemoActive, startDemo, cancelDemo } from '@lib/stores/demo';
import * as microDemoChoreographyModule from '../../../js/modules/micro-demo-choreography.js';
import type { DemoPhase } from '@lib/types/state';

// ── Legacy Choreography Bridge ──────────────────────────────────────────────
// The actual timed camera/UI choreography is still in the legacy JS module.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _choreography: Record<string, any> = {} as Record<string, any>;

async function _loadChoreography(): Promise<void> {
  if ((_choreography as Record<string, unknown>).setDemoNodeIndex) return;
  try {
    Object.assign(_choreography, microDemoChoreographyModule);
  } catch {
    debugWarn('[demo] Failed to load legacy choreography module');
  }
}

// ── Constants ───────────────────────────────────────────────────────────────

const DEMO_START_DELAY_MS = 25000;
const MAX_START_RETRIES = 100;

const SHOWCASE_POOL: readonly number[] = [50, 707, 1525, 2908, 3899, 4102, 6684, 7938];

// ── Fisher-Yates Shuffle (deterministic) ────────────────────────────────────

function _fisherYatesShuffle(array: readonly number[], seed = 0xDEAD): number[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(seededUnit(i, seed) * (i + 1));
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
  return arr;
}

const _shuffledPool = _fisherYatesShuffle(SHOWCASE_POOL);

// ── Retry State ─────────────────────────────────────────────────────────────

let _startRetryTimer: number | null = null;
let _startRetryDeadline = 0;
let _startRetryCount = 0;
let _startGuardClaimed = false;

function _clearRetryTimer(): void {
  if (_startRetryTimer !== null) {
    window.clearTimeout(_startRetryTimer);
    _startRetryTimer = null;
  }
  _startRetryDeadline = 0;
}

function _getDemoNode(): number | null {
  const lState = state as Record<string, unknown>;
  const points = lState.points as Array<Record<string, unknown>> | undefined;
  if (!points) return null;

  for (const idx of _shuffledPool) {
    const point = points[idx];
    if (!point) continue;
    if (point.status === 'disqualified') continue;
    const name = ((point.name as string) || '').trim();
    if (!name || name.length < 3) continue;
    return idx;
  }
  if (!points.length) return null;
  for (let i = 0; i < points.length; i++) {
    const point = points[i];
    if (!point) continue;
    if (point.status === 'disqualified') continue;
    const name = ((point.name as string) || '').trim();
    if (!name || name.length < 3) continue;
    return i;
  }
  return null;
}

// ── Public API ──────────────────────────────────────────────────────────────

export function initMicroDemo(): void {
  const params = new URLSearchParams(window.location.search);
  const forceDemo = params.get('demo') === 'force';

  if (!forceDemo) {
    if (!guardNotSeen()) { debugWarn('[demo] blocked \u2014 already seen'); return; }
    if (!guardReducedMotion()) { debugWarn('[demo] blocked \u2014 reduced motion'); return; }
    if (!guardWebGL()) { debugWarn('[demo] blocked \u2014 no WebGL / software renderer'); return; }
    if (!guardUrlParam()) { debugWarn('[demo] blocked \u2014 nodemo URL param'); return; }
  }
  startMicroDemo();
}

export function shouldRunMicroDemo(): boolean {
  const params = new URLSearchParams(window.location.search);
  const forceDemo = params.get('demo') === 'force';

  if (!forceDemo) {
    try {
      const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
      if (raw) return false;
    } catch { /* sessionStorage unavailable */ }
  }
  if (!isAppReadyForDemo()) return false;
  return true;
}

export function startMicroDemo(): void {
  void _startMicroDemo();
}

async function _startMicroDemo(): Promise<void> {
  // Use demo phase from store for re-entrancy check
  const phase = get(demoPhase);
  if (phase !== 'IDLE') {
    debugWarn('[demo] already active or completed');
    return;
  }

  // Atomic re-entry guard
  if (_startGuardClaimed) return;
  _startGuardClaimed = true;

  const params = new URLSearchParams(window.location.search);
  const forceDemo = params.get('demo') === 'force';

  if (!forceDemo) {
    try {
      const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
      if (raw) { _startGuardClaimed = false; return; }
    } catch { /* sessionStorage unavailable */ }
    if (!guardNotSeen()) { _startGuardClaimed = false; return; }
  }

  if (!isAppReadyForDemo()) {
    const now = performance.now();
    if (!_startRetryDeadline) {
      _startRetryDeadline = now + DEMO_START_DELAY_MS;
      _startRetryCount = 0;
    }
    if (now < _startRetryDeadline && _startRetryCount < MAX_START_RETRIES) {
      _startRetryCount++;
      _startRetryTimer = window.setTimeout(() => {
        _startRetryTimer = null;
        _startGuardClaimed = false;
        startMicroDemo();
      }, 150);
      return;
    }
    _startGuardClaimed = false;
    try { sessionStorage.setItem(SESSION_STORAGE_KEY, 'skipped-no-conditions'); } catch { /* ignore */ }
    notifyDemoUnableToStart();
    return;
  }

  const node = _getDemoNode();
  if (node === null) {
    _startGuardClaimed = false;
    try { sessionStorage.setItem(SESSION_STORAGE_KEY, 'skipped-no-node'); } catch { /* ignore */ }
    notifyDemoUnableToStart();
    return;
  }

  try { sessionStorage.setItem(SESSION_STORAGE_KEY, new Date().toISOString()); } catch { /* ignore */ }

  // Update store
  startDemo(node);

  // Delegate to legacy choreography module
  await _loadChoreography();
  if (typeof _choreography.setDemoNodeIndex === 'function') {
    _choreography.setDemoNodeIndex(node);
  }
  if (typeof _choreography.runDemo === 'function') {
    _choreography.runDemo(cancelMicroDemo);
  }

  _startGuardClaimed = false;
  _startRetryDeadline = 0;
  _clearRetryTimer();
}

export function cancelMicroDemo(reason = 'user-input'): void {
  void _loadChoreography().then(() => {
    if (typeof _choreography.cancelChoreography === 'function') {
      _choreography.cancelChoreography(reason);
    }
  });
  cancelDemo();
}

export function isMicroDemoRunning(): boolean {
  return get(isDemoActive);
}
