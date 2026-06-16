/**
 * w11-t7-adapters-init.test.ts
 *
 * Regression detector for Ticket W11-T7 (Adapter Init Svelte Port, Wave 1).
 *
 * Verifies:
 *  - src/lib/orchestration/adapters.ts exists and exports initAdapters
 *  - src/lib/engine/adapters-bridge.ts exists and re-exports all 11 adapter
 *    init functions
 *  - adapters.ts body calls all 11 init functions
 *  - calling initAdapters() with mock deps doesn't throw and invokes all 11
 *    adapter init functions exactly once
 *  - adapters.ts tracks initialization state via areAdaptersInitialized()
 *
 * Strangler-fig invariant: the Svelte orchestration path must call the same
 * engine-kernel adapter init functions as the legacy initAdapters() in
 * js/modules/app.ts:141-186.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// ── Source file paths for structural checks ───────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const ORCHESTRATION_PATH = resolve(__dirname, '../../src/lib/orchestration/adapters.ts');
const BRIDGE_PATH = resolve(__dirname, '../../src/lib/engine/adapters-bridge.ts');

function readOrchestrationSource(): string {
  return readFileSync(ORCHESTRATION_PATH, 'utf-8');
}

function readBridgeSource(): string {
  return readFileSync(BRIDGE_PATH, 'utf-8');
}

// ── Module-scope mock store (hoisted before vi.mock) ──────────────────────────
// vi.mock factories are hoisted to module load, before any `it` body runs.
// The runtime test below references this binding from inside its `vi.mock`
// factory, so it must be declared at module scope (not inside the test body).

const W11_MUTABLE_MOCK_FNS: Record<string, ReturnType<typeof vi.fn>> = {};

// ── The 11 adapter init functions (canonical names) ──────────────────────────

const ADAPTER_INIT_NAMES = [
  'initJourneyLifecycleAdapter',
  'initClusterFilterAdapter',
  'initJourneyCompassAdapter',
  'initJourneySelectedCard',
  'initSemanticDiveUiSubscriptions',
  'initFocusNeighborRailSubscriptions',
  'initRouteTraceSubscriptions',
  'initThreadInspectorAdapter',
  'initMapStateSubscriptions',
  'initViewControllerAdapter',
  'setupMobileSearchSheetToggle',
] as const;

// ── Structural Tests ─────────────────────────────────────────────────────────

describe('W11-T7: adapters.ts exists and exports initAdapters', () => {
  it('orchestration file exists and exports initAdapters function', async () => {
    const mod = await import('../../src/lib/orchestration/adapters');
    expect(typeof mod.initAdapters).toBe('function');
  });

  it('orchestration file exports areAdaptersInitialized', async () => {
    const mod = await import('../../src/lib/orchestration/adapters');
    expect(typeof mod.areAdaptersInitialized).toBe('function');
  });
});

describe('W11-T7: adapters-bridge.ts re-exports all 11 adapter init functions', () => {
  it('bridge file exists', () => {
    const src = readBridgeSource();
    expect(src.length).toBeGreaterThan(0);
  });

  for (const name of ADAPTER_INIT_NAMES) {
    it(`re-exports ${name}`, () => {
      const src = readBridgeSource();
      expect(src).toContain(`export { ${name} }`);
    });
  }
});

describe('W11-T7: adapters.ts body calls all 11 init functions', () => {
  const src = readOrchestrationSource();

  for (const name of ADAPTER_INIT_NAMES) {
    it(`calls ${name}() in initAdapters body`, () => {
      // Verify the function is called (not just imported) inside the file
      const callPattern = new RegExp(`${name}\\(`);
      expect(callPattern.test(src)).toBe(true);
    });
  }
});

// ── Bridge Source Path Verification ──────────────────────────────────────────

describe('W11-T7: adapters-bridge.ts imports from correct source modules', () => {
  it('re-exports initJourneyLifecycleAdapter from journey-lifecycle-adapter', () => {
    const src = readBridgeSource();
    expect(src).toContain("from '../../../js/modules/journey-lifecycle-adapter'");
  });

  it('re-exports initClusterFilterAdapter from cluster-filter-controller', () => {
    const src = readBridgeSource();
    expect(src).toContain("from '../orchestration/cluster-filter-controller'");
  });

  it('re-exports initJourneyCompassAdapter from journey-compass-controller-bridge', () => {
    const src = readBridgeSource();
    expect(src).toContain("from '@lib/engine/journey-compass-controller-bridge'");
  });

  it('re-exports initSemanticDiveUiSubscriptions from src/lib/journey/semantic-dive', () => {
    const src = readBridgeSource();
    expect(src).toContain("from '../journey/semantic-dive'");
  });
});

// ── Runtime Test ─────────────────────────────────────────────────────────────

describe('W11-T7: runtime — initAdapters() invokes all 11 adapters', () => {
  beforeEach(async () => {
    // Reset the module state by re-importing (vitest module cache)
    vi.resetModules();
  });

  it('calls all 11 adapter init functions exactly once without throwing', async () => {
    // Mock the bridge module so we can count calls.
    // Note: vi.mock is hoisted to module load, so the mock factory must
    // reference a module-scope binding. We expose the mock store at module
    // scope (W11-MUTABLE_MOCK_FNS) and reset/seed it here.
    Object.fromEntries(
      ADAPTER_INIT_NAMES.map((name) => {
        if (!W11_MUTABLE_MOCK_FNS[name]) W11_MUTABLE_MOCK_FNS[name] = vi.fn();
        return [name, W11_MUTABLE_MOCK_FNS[name]];
      })
    );

    vi.mock('@lib/engine/adapters-bridge', () => W11_MUTABLE_MOCK_FNS);

    const { initAdapters, areAdaptersInitialized } = await import(
      '../../src/lib/orchestration/adapters'
    );

    // Should not be initialized before calling
    expect(areAdaptersInitialized()).toBe(false);

    // Provide minimal deps — each adapter init will receive its slice
    const mockDeps = {
      journeyLifecycle: {
        previewInsideNextThread: vi.fn(),
        getNextWalkCandidateForIndex: vi.fn(),
        applyLocalNeighborhoodFocus: vi.fn(),
        setSemanticDiveMode: vi.fn(),
        getInterestingBusinessNote: vi.fn(),
        buildSelectedMatchNarrative: vi.fn(),
        hasColdDegradedSemanticFallback: vi.fn(),
        getColdDegradedRouteCopy: vi.fn(),
        getSelectedBusinessRoleLabel: vi.fn(),
        isFieldNodeFocusContext: vi.fn(),
        revealSelectedBusinessCard: vi.fn(),
        describeThreadLensForPoint: vi.fn(),
        hydrateLeadContext: vi.fn(),
        shouldUseFloatingFocusJourneyOnly: vi.fn(),
        setLastCanvasNodePick: vi.fn(),
        setLastCanvasNodeHover: vi.fn(),
        setLastCanvasNodeFocusPick: vi.fn(),
      },
      clusterFilter: {
        applyFilters: vi.fn(),
        clearSearchGlow: vi.fn(),
        updateUrlState: vi.fn(),
        clearShortSemanticSearchState: vi.fn(),
      },
      switchView: vi.fn(),
      journeySelectedCard: {
        getStrandArrivalNote: vi.fn(),
        updateTraversalUi: vi.fn(),
      },
      threadInspector: {
        summarizeNeighborReason: vi.fn(),
        getInsideRelationshipLabel: vi.fn(),
        getCurrentTrailFocusIndex: vi.fn(),
        getFocusThreadCurvePoint: vi.fn(),
      },
      refreshCompositionState: vi.fn(),
      isCompactSearchViewport: vi.fn(),
    };

    // Should not throw
    expect(() => initAdapters(mockDeps)).not.toThrow();

    // All 11 should have been called exactly once
    for (const name of ADAPTER_INIT_NAMES) {
      expect(W11_MUTABLE_MOCK_FNS[name]).toHaveBeenCalledTimes(1);
    }

    // Should now be initialized
    expect(areAdaptersInitialized()).toBe(true);

    // Calling again should be a no-op (still 1 call each)
    initAdapters(mockDeps);
    for (const name of ADAPTER_INIT_NAMES) {
      expect(W11_MUTABLE_MOCK_FNS[name]).toHaveBeenCalledTimes(1);
    }
  });
});
