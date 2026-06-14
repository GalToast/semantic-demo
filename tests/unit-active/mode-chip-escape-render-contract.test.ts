/**
 * mode-chip-escape-render-contract.test.ts
 *
 * A2-4: Escape key must return the user to Overview mode from search, focus,
 * or inside states so keyboard users are never trapped without a mode-switch
 * affordance.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const APP = resolve(import.meta.dirname, '../../src/App.svelte');

function readApp(): string {
  return readFileSync(APP, 'utf-8');
}

describe('A2-4: Escape returns to Overview mode', () => {
  const src = readApp();

  it('has a keydown handler that listens for Escape', () => {
    expect(src).toContain("e.key === 'Escape'");
  });

  it('imports dispatchNavTransition and NAV_TRANSITION_ACTIONS from navigation store', () => {
    expect(src).toMatch(/import\s*\{[^}]*dispatchNavTransition[^}]*\}\s*from\s*'@\/?lib\/stores\/navigation'/);
    expect(src).toMatch(/import\s*\{[^}]*NAV_TRANSITION_ACTIONS[^}]*\}\s*from\s*'@\/?lib\/stores\/navigation'/);
  });

  it('dispatches RETURN_OVERVIEW on Escape when not already in idle', () => {
    expect(src).toContain('NAV_TRANSITION_ACTIONS.RETURN_OVERVIEW');
    // Must be inside the Escape branch (after the Escape key check)
    const escapeIdx = src.indexOf("e.key === 'Escape'");
    // Find RETURN_OVERVIEW that appears AFTER the Escape check
    const returnIdx = src.indexOf('NAV_TRANSITION_ACTIONS.RETURN_OVERVIEW', escapeIdx);
    expect(returnIdx).toBeGreaterThan(escapeIdx);
  });

  it('guards the return-overview dispatch so it only fires when mode/surface is non-idle', () => {
    // The guard should check navStore() for mode !== 'overview' or surface !== 'idle'
    expect(src).toMatch(/mode\s*!==\s*'overview'\s*\|\|\s*surface\s*!==\s*'idle'/);
  });

  it('clears the search input text before returning to overview', () => {
    const escapeIdx = src.indexOf("e.key === 'Escape'");
    const returnIdx = src.indexOf('NAV_TRANSITION_ACTIONS.RETURN_OVERVIEW', escapeIdx);
    const escapeBlock = src.slice(escapeIdx, returnIdx);
    expect(escapeBlock).toContain('searchInput');
    expect(escapeBlock).toContain("searchInput.value = ''");
  });
});
