/**
 * Unit tests for src/lib/utils/strand-continuity.ts
 *
 * Covers StrandContinuityManager timer tracking, cancelAll, snapshot,
 * and the global singleton helpers.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  StrandContinuityManager,
  getStrandContinuityManager,
  resetStrandContinuityManager,
} from '../../src/lib/utils/strand-continuity';

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Advance fake timers and flush microtasks. */
async function advance(ms: number) {
  vi.advanceTimersByTime(ms);
  // Give setTimeout callbacks a chance to run (they are macrotasks)
  await new Promise((r) => setTimeout(r, 0));
}

// ── Test Suite ───────────────────────────────────────────────────────────────

describe('StrandContinuityManager', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    resetStrandContinuityManager();
  });

  // ── setTimer / clearTimer ───────────────────────────────────────────────────

  describe('setTimer / clearTimer', () => {
    it('stores a timer in the internal Map when setTimer is called', () => {
      const mgr = new StrandContinuityManager();
      const cb = vi.fn();

      mgr.setTimer('arrival', 500, cb);

      expect(mgr.activeTimerCount).toBe(1);
    });

    it('replaces an existing timer for the same purpose', () => {
      const mgr = new StrandContinuityManager();
      const cb1 = vi.fn();
      const cb2 = vi.fn();

      mgr.setTimer('settle', 500, cb1);
      expect(mgr.activeTimerCount).toBe(1);

      // Setting again for same purpose should clear the first
      mgr.setTimer('settle', 500, cb2);
      expect(mgr.activeTimerCount).toBe(1);

      // Advance past the timer — only cb2 should fire
      advance(600);
      expect(cb1).not.toHaveBeenCalled();
      expect(cb2).toHaveBeenCalledTimes(1);
    });

    it('fires callback after the specified delay', () => {
      const mgr = new StrandContinuityManager();
      const cb = vi.fn();

      mgr.setTimer('timeout', 1000, cb);
      expect(cb).not.toHaveBeenCalled();

      advance(1000);
      expect(cb).toHaveBeenCalledTimes(1);
    });

    it('removes the timer from the Map after it fires', () => {
      const mgr = new StrandContinuityManager();
      mgr.setTimer('return', 200, vi.fn());

      expect(mgr.activeTimerCount).toBe(1);

      advance(300);
      expect(mgr.activeTimerCount).toBe(0);
    });

    it('clearTimer stops a pending timer from firing', () => {
      const mgr = new StrandContinuityManager();
      const cb = vi.fn();

      mgr.setTimer('arrival', 500, cb);
      mgr.clearTimer('arrival');

      advance(600);
      expect(cb).not.toHaveBeenCalled();
      expect(mgr.activeTimerCount).toBe(0);
    });

    it('clearTimer is a no-op for unknown purposes', () => {
      const mgr = new StrandContinuityManager();
      // Should not throw
      expect(() => mgr.clearTimer('nonexistent')).not.toThrow();
      expect(mgr.activeTimerCount).toBe(0);
    });

    it('tracks multiple timers for different purposes simultaneously', () => {
      const mgr = new StrandContinuityManager();
      const cb1 = vi.fn();
      const cb2 = vi.fn();
      const cb3 = vi.fn();

      mgr.setTimer('arrival', 100, cb1);
      mgr.setTimer('settle', 200, cb2);
      mgr.setTimer('timeout', 300, cb3);

      expect(mgr.activeTimerCount).toBe(3);

      advance(150);
      expect(cb1).toHaveBeenCalledTimes(1);
      expect(cb2).not.toHaveBeenCalled();
      expect(cb3).not.toHaveBeenCalled();

      advance(100);
      expect(cb2).toHaveBeenCalledTimes(1);
      expect(cb3).not.toHaveBeenCalled();

      advance(100);
      expect(cb3).toHaveBeenCalledTimes(1);
      expect(mgr.activeTimerCount).toBe(0);
    });
  });

  // ── cancelAll ──────────────────────────────────────────────────────────────

  describe('cancelAll()', () => {
    it('prevents all tracked timers from firing', () => {
      const mgr = new StrandContinuityManager();
      const cb1 = vi.fn();
      const cb2 = vi.fn();
      const cb3 = vi.fn();

      mgr.setTimer('arrival', 100, cb1);
      mgr.setTimer('settle', 200, cb2);
      mgr.setTimer('timeout', 300, cb3);

      mgr.cancelAll();
      expect(mgr.activeTimerCount).toBe(0);

      advance(400);
      expect(cb1).not.toHaveBeenCalled();
      expect(cb2).not.toHaveBeenCalled();
      expect(cb3).not.toHaveBeenCalled();
    });

    it('is safe to call when no timers are tracked', () => {
      const mgr = new StrandContinuityManager();
      expect(() => mgr.cancelAll()).not.toThrow();
      expect(mgr.activeTimerCount).toBe(0);
    });

    it('can be called multiple times without error', () => {
      const mgr = new StrandContinuityManager();
      mgr.setTimer('arrival', 100, vi.fn());

      mgr.cancelAll();
      mgr.cancelAll();
      expect(mgr.activeTimerCount).toBe(0);
    });

    it('allows new timers after cancelAll', () => {
      const mgr = new StrandContinuityManager();
      const cb1 = vi.fn();
      const cb2 = vi.fn();

      mgr.setTimer('arrival', 100, cb1);
      mgr.cancelAll();

      mgr.setTimer('arrival', 100, cb2);
      expect(mgr.activeTimerCount).toBe(1);

      advance(150);
      expect(cb1).not.toHaveBeenCalled();
      expect(cb2).toHaveBeenCalledTimes(1);
    });
  });

  // ── snapshot ───────────────────────────────────────────────────────────────

  describe('snapshot()', () => {
    it('returns a shallow copy of the current state', () => {
      const mgr = new StrandContinuityManager();
      const snap1 = mgr.snapshot();
      const snap2 = mgr.snapshot();

      expect(snap1).toEqual(snap2);
      // Should be a different object reference (shallow copy)
      expect(snap1).not.toBe(snap2);
    });

    it('reflects the current phase after setPhase()', () => {
      const mgr = new StrandContinuityManager();

      mgr.setPhase('pinned', { targetIndex: 42, reason: 'test' });
      const snap = mgr.snapshot();

      expect(snap.phase).toBe('pinned');
      expect(snap.targetIndex).toBe(42);
      expect(snap.reason).toBe('test');
      // performance.now() may return 0 under fake timers
      expect(typeof snap.startedAt).toBe('number');
    });

    it('snapshot does not mutate original state when modified', () => {
      const mgr = new StrandContinuityManager();
      mgr.setPhase('exploring', { targetIndex: 7 });

      const snap = mgr.snapshot();
      // Mutate the snapshot (it's a shallow copy)
      (snap as any).phase = 'idle';
      (snap as any).targetIndex = 999;

      // Original state is untouched
      expect(mgr.state.phase).toBe('exploring');
      expect(mgr.state.targetIndex).toBe(7);
    });

    it('returns idle state on a fresh manager', () => {
      const mgr = new StrandContinuityManager();
      const snap = mgr.snapshot();

      expect(snap.phase).toBe('idle');
      expect(snap.targetIndex).toBeNull();
      expect(snap.fromIndex).toBeNull();
      expect(snap.reason).toBe('');
    });
  });

  // ── setPhase + config callbacks ─────────────────────────────────────────────

  describe('setPhase()', () => {
    it('normalizes an invalid phase to idle', () => {
      const mgr = new StrandContinuityManager();
      // Cast to bypass TS for runtime validation test
      mgr.setPhase('bogus' as any);
      expect(mgr.state.phase).toBe('idle');
    });

    it('calls onPhaseChange when phase changes', () => {
      const onPhaseChange = vi.fn();
      const mgr = new StrandContinuityManager({ onPhaseChange });

      mgr.setPhase('pinned');
      expect(onPhaseChange).toHaveBeenCalledWith('pinned', expect.any(Object));
    });

    it('calls onBodySync on every setPhase call', () => {
      const onBodySync = vi.fn();
      const mgr = new StrandContinuityManager({ onBodySync });

      mgr.setPhase('idle');
      mgr.setPhase('exploring');
      expect(onBodySync).toHaveBeenCalledTimes(2);
    });

    it('calls onArrivalSync for exploring and arrived phases', () => {
      const onArrivalSync = vi.fn();
      const mgr = new StrandContinuityManager({ onArrivalSync });

      mgr.setPhase('exploring');
      mgr.setPhase('arrived');
      expect(onArrivalSync).toHaveBeenCalledTimes(2);
    });

    it('calls onArrivalDispose when returning to idle', () => {
      const onArrivalDispose = vi.fn();
      const mgr = new StrandContinuityManager({ onArrivalDispose });

      mgr.setPhase('idle');
      expect(onArrivalDispose).toHaveBeenCalledTimes(1);
    });
  });

  // ── isActive ───────────────────────────────────────────────────────────────

  describe('isActive', () => {
    it('returns false when phase is idle', () => {
      const mgr = new StrandContinuityManager();
      expect(mgr.isActive).toBe(false);
    });

    it('returns true when phase is not idle', () => {
      const mgr = new StrandContinuityManager();
      mgr.setPhase('pinned');
      expect(mgr.isActive).toBe(true);
    });
  });

  // ── clear() ────────────────────────────────────────────────────────────────

  describe('clear()', () => {
    it('resets phase to idle with a reason', () => {
      const mgr = new StrandContinuityManager();
      mgr.setPhase('exploring', { targetIndex: 5 });
      mgr.clear('reset-test');

      expect(mgr.state.phase).toBe('idle');
      expect(mgr.state.reason).toBe('reset-test');
      expect(mgr.state.targetIndex).toBeNull();
    });
  });

  // ── Global singleton ───────────────────────────────────────────────────────

  describe('global singleton', () => {
    it('getStrandContinuityManager returns the same instance', () => {
      resetStrandContinuityManager();
      const a = getStrandContinuityManager();
      const b = getStrandContinuityManager();
      expect(a).toBe(b);
    });

    it('resetStrandContinuityManager clears and nullifies the singleton', () => {
      const mgr = getStrandContinuityManager();
      mgr.setTimer('arrival', 500, vi.fn());
      expect(mgr.activeTimerCount).toBe(1);

      resetStrandContinuityManager();

      // Next call creates a fresh instance
      const fresh = getStrandContinuityManager();
      expect(fresh).not.toBe(mgr);
      expect(fresh.activeTimerCount).toBe(0);
      expect(fresh.state.phase).toBe('idle');
    });
  });
});
