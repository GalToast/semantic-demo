/**
 * demo-choreography-exports.test.ts — Unit tests for demo-choreography.ts
 *
 * Covers (Ticket 9C — static import verification):
 *  - Public API exports exist and have correct types
 *  - Phase constants are complete and stable
 *  - Pure state functions work (getDemoPhase, getDemoNodeIndex, etc.)
 *  - Structural invariant: no dynamic @legacy/* imports remain in the file
 *  - All 7 legacy modules are statically imported (not lazy-loaded)
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  PHASE,
  getDemoPhase,
  getDemoNodeIndex,
  isDemoCancelled,
  setDemoNodeIndex,
  clearDemoTimers,
  resetRetryState,
  isMicroDemoRunning,
  runDemo,
  cancelChoreography,
} from '../../src/lib/engine/demo-choreography';
import type { DemoPhase } from '../../src/lib/types/state';

// ── Source file path for structural checks ────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SRC_PATH = resolve(
  __dirname,
  '../../src/lib/engine/demo-choreography.ts'
);

function readSource(): string {
  return readFileSync(SRC_PATH, 'utf-8');
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('demo-choreography — static import invariant (Ticket 9C)', () => {
  it('has zero dynamic @legacy-js/* imports in the source file', () => {
    const src = readSource();
    const dynamicLegacyImports = src.match(/import\(['"]@legacy-js\//g);
    expect(dynamicLegacyImports).toBeNull();
  });

  it('has zero dynamic import() calls targeting any @legacy-js module', () => {
    const src = readSource();
    const allDynamicImports = src.match(/import\(['"][^'"]+['"]\)/g) ?? [];
    const legacyDynamic = allDynamicImports.filter((imp) =>
      imp.includes('@legacy-js/')
    );
    expect(legacyDynamic).toHaveLength(0);
  });

  it('statically imports remaining legacy modules via relative paths (extensionless, Vite resolves to .ts)', () => {
    const src = readSource();
    const expectedModules = [
      'lifecycle',
      'journey',
      'bindings/panel-bindings',
    ];
    for (const mod of expectedModules) {
      expect(src).toContain(`from '../../../js/modules/${mod}'`);
    }
  });

  it('imports journey-compass-controller via the bridge (not direct legacy path)', () => {
    const src = readSource();
    expect(src).toContain("from '@lib/engine/journey-compass-controller-bridge'");
  });

  it('also statically imports the previously-converted modules via relative paths (extensionless)', () => {
    const src = readSource();
    // Ticket W11-T5: state import migrated to appState
    expect(src).toContain("from '@lib/state/app.svelte'");
    // W14-Tier-2: camera-controls death-bridge retired; canonical paths now
    expect(src).toContain("from '@lib/engine/camera-choreography'");
    expect(src).toContain("from '@lib/engine/camera-controls-restore-bridge'");
    expect(src).toContain("from '@lib/journey/focus-pocket'");
    expect(src).toContain("from '@lib/demo/guards'");
    expect(src).toContain("from '@lib/demo/camera'");
    expect(src).toContain("from '@lib/demo/ui'");
  });
});

describe('demo-choreography — PHASE constants', () => {
  it('contains all 9 phase values', () => {
    const expectedPhases: DemoPhase[] = [
      'IDLE',
      'GLIDING',
      'ARRIVED',
      'CARD_VISIBLE',
      'PULLBACK',
      'WIDE_VIEW',
      'RETURNING',
      'COMPLETE',
      'CANCELLED',
    ];
    for (const phase of expectedPhases) {
      expect(PHASE[phase]).toBe(phase);
    }
  });

  it('PHASE values are stable strings (no enum drift)', () => {
    expect(PHASE.IDLE).toBe('IDLE');
    expect(PHASE.COMPLETE).toBe('COMPLETE');
    expect(PHASE.CANCELLED).toBe('CANCELLED');
  });
});

describe('demo-choreography — pure state functions', () => {
  beforeEach(() => {
    resetRetryState();
  });

  it('getDemoPhase returns IDLE after reset', () => {
    resetRetryState();
    expect(getDemoPhase()).toBe('IDLE');
  });

  it('getDemoNodeIndex returns null after reset', () => {
    resetRetryState();
    expect(getDemoNodeIndex()).toBeNull();
  });

  it('isDemoCancelled returns false after reset', () => {
    resetRetryState();
    expect(isDemoCancelled()).toBe(false);
  });

  it('setDemoNodeIndex updates the node index', () => {
    resetRetryState();
    setDemoNodeIndex(42);
    expect(getDemoNodeIndex()).toBe(42);
  });

  it('setDemoNodeIndex(null) clears the node index', () => {
    setDemoNodeIndex(42);
    setDemoNodeIndex(null);
    expect(getDemoNodeIndex()).toBeNull();
  });

  it('isMicroDemoRunning returns false when phase is IDLE', () => {
    resetRetryState();
    expect(isMicroDemoRunning()).toBe(false);
  });

  it('clearDemoTimers is callable without error', () => {
    expect(() => clearDemoTimers()).not.toThrow();
  });
});

describe('demo-choreography — async functions are importable', () => {
  it('runDemo is a function', () => {
    expect(typeof runDemo).toBe('function');
  });

  it('cancelChoreography is a function', () => {
    expect(typeof cancelChoreography).toBe('function');
  });
});
