/**
 * @file w11-t8-app-init-extensions.test.ts
 *
 * Structural and contract tests for W11-T8 Wave 1:
 *   - Complete __APP_ACTIONS__ bridge registry (19+ methods)
 *   - WebGL context restore handler (setupWebglContextRestore)
 *
 * These tests verify the source structure — not runtime behavior — so they
 * can run without a real WebGL context or full engine init.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// ── Helpers ──────────────────────────────────────────────────────────────────

const APP_INIT_PATH = resolve(import.meta.dirname, '../../src/lib/orchestration/app-init.ts');
const LEGACY_APP_PATH = resolve(import.meta.dirname, '../../js/modules/app.ts');

function readSource(path: string): string {
  return readFileSync(path, 'utf-8');
}

// Read sources at module level so all describe blocks can access them
const src = readSource(APP_INIT_PATH);

// ── Structural Tests ─────────────────────────────────────────────────────────

describe('W11-T8: app-init.ts __APP_ACTIONS__ completeness', () => {

  // Original 9 actions (pre-W11-T8)
  const originalActions = [
    'switchView',
    'focusOnNode',
    'setTrailDepth',
    'setSemanticDiveMode',
    'refreshCompositionState',
    'resetExplorationFocus',
    'resetExperienceState',
    'clearSearch',
    'returnToOverview',
  ];

  // New 10 actions added in W11-T8 Wave 1
  const newActions = [
    'search',
    'setTrailFromSeed',
    'traverseNeighbor',
    'inspectThreadNeighbor',
    'pinThreadNeighbor',
    'unpinThreadInspection',
    'clearThreadInspection',
    'walkThreadNeighbor',
    'requestSemanticGuide',
    'showSemanticThreadsDetail',
  ];

  it('has all 9 original __APP_ACTIONS__ methods', () => {
    for (const action of originalActions) {
      // Match both object-literal and property-assignment forms
      expect(src).toMatch(
        new RegExp(`\\b${action}\\b\\s*[:=]`)
      );
    }
  });

  it('has all 10 new __APP_ACTIONS__ methods added in W11-T8', () => {
    for (const action of newActions) {
      // Verify the action key appears in __APP_ACTIONS__ assignment context
      expect(src).toMatch(
        new RegExp(`__APP_ACTIONS__\\.\\w*${action}\\b`)
      );
    }
  });

  it('has 19+ total action keys (original 9 + new 10)', () => {
    // Count unique action names referenced in the __APP_ACTIONS__ object
    // Collect keys from property assignments: __APP_ACTIONS__.keyName =
    const assignmentKeys = [...src.matchAll(/__APP_ACTIONS__\.(\w+)\s*=/g)];

    // Collect keys from the object literal: keyName: (value) =>
    const literalBlock = src.match(/__APP_ACTIONS__\s*=\s*\{[\s\S]*?\n\s*\};/);
    const literalKeys = literalBlock ? [...literalBlock[0].matchAll(/\b(\w+)\s*:/g)] : [];

    const allKeys = new Set<string>();
    for (const m of assignmentKeys) {
      allKeys.add(m[1]);
    }
    for (const m of literalKeys) {
      allKeys.add(m[1]);
    }

    expect(allKeys.size).toBeGreaterThanOrEqual(19);
  });
});

describe('W11-T8: app-init.ts WebGL context restore handler', () => {

  it('has a setupWebglContextRestore function', () => {
    expect(src).toContain('function setupWebglContextRestore');
  });

  it('subscribes to webglcontextlost event', () => {
    expect(src).toContain("addEventListener('webglcontextlost'");
  });

  it('subscribes to webglcontextrestored event', () => {
    expect(src).toContain("addEventListener('webglcontextrestored'");
  });

  it('returns a cleanup function that removes both listeners', () => {
    expect(src).toContain("removeEventListener('webglcontextlost'");
    expect(src).toContain("removeEventListener('webglcontextrestored'");
  });

  it('calls setupWebglContextRestore() from appInit()', () => {
    expect(src).toContain('setupWebglContextRestore()');
  });

  it('wires cleanup into the returned cleanup function', () => {
    expect(src).toContain('_unsubWebglRestore?.()');
  });
});

describe('W11-T8: app-init.ts imports the new bridge modules', () => {

  it('imports search from window-actions-bridge', () => {
    expect(src).toMatch(/import.*\bsearch\b.*from.*window-actions-bridge/);
  });

  it('imports setTrailFromSeed from journey-neighborhood-bridge', () => {
    expect(src).toMatch(/import.*setTrailFromSeed.*from.*journey-neighborhood-bridge/);
  });

  it('imports traverseNeighbor and walkThreadNeighbor from journey-thread-settler-bridge', () => {
    expect(src).toMatch(/import.*traverseNeighbor.*walkThreadNeighbor.*from.*journey-thread-settler-bridge/);
  });

  it('imports thread inspector methods from thread-inspector-bridge', () => {
    // The import spans multiple lines, so check each name and the module path
    // appear in the same import block.
    const importBlock = src.match(/import\s*\{[\s\S]*?\}\s*from\s*'@lib\/engine\/thread-inspector-bridge'/g);
    expect(importBlock).not.toBeNull();
    const block = importBlock![0];
    expect(block).toContain('inspectThreadNeighbor');
    expect(block).toContain('pinThreadNeighbor');
    expect(block).toContain('unpinThreadInspection');
    expect(block).toContain('clearThreadInspection');
  });

  it('imports requestSemanticGuide from journey/semantic-guide', () => {
    expect(src).toMatch(/import.*requestSemanticGuide.*from.*journey\/semantic-guide/);
  });

  it('imports showSemanticThreadsDetail from semantic-guide-bridge', () => {
    expect(src).toMatch(/import.*showSemanticThreadsDetail.*from.*semantic-guide-bridge/);
  });
});

describe('W11-T8: Legacy parity — all legacy actions present in Svelte', () => {
  const legacySrc = readSource(LEGACY_APP_PATH);
  const svelteSrc = readSource(APP_INIT_PATH);

  // Extract action keys from legacy __APP_ACTIONS__ block
  const legacyMatch = legacySrc.match(/__APP_ACTIONS__\s*=\s*\{([\s\S]*?)\n\s*\};/);
  expect(legacyMatch).not.toBeNull();

  const legacyKeys = [...legacyMatch![1].matchAll(/\b(\w+)\s*:/g)].map((m) => m[1]);

  it('every legacy action key is present in Svelte app-init.ts', () => {
    for (const key of legacyKeys) {
      // Check either object literal or property assignment
      const inLiteral = svelteSrc.includes(`${key}:`);
      const inAssignment = svelteSrc.includes(`__APP_ACTIONS__.${key}`);
      expect(inLiteral || inAssignment).toBe(true);
    }
  });
});

// ── Runtime Import Test ──────────────────────────────────────────────────────

describe('W11-T8: installWindowGlobals runtime safety', () => {
  it('exports appInit and isAppInitComplete functions', () => {
    // Structural check: the source file exports the two main functions.
    // We avoid runtime import because the module imports engine bridges
    // that require a full WebGL/Three.js context.
    expect(src).toContain('export async function appInit');
    expect(src).toContain('export function isAppInitComplete');
  });
});
