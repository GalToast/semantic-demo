/**
 * search-results-arrow-keys-render-contract.test.ts
 *
 * A2-8: Search results must not create one Tab stop per result.
 * The list should expose a single active result to Tab and use
 * arrow keys for intra-list movement (WAI-ARIA listbox pattern).
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SEARCH_RESULTS = resolve(import.meta.dirname, '../../src/components/SearchResults.svelte');

function readSource(): string {
  return readFileSync(SEARCH_RESULTS, 'utf-8');
}

describe('A2-8: search results arrow-key navigation', () => {
  const src = readSource();

  it('tracks the active result index via a derived value', () => {
    expect(src).toContain('activeIndex');
    expect(src).toMatch(/let\s+activeIndex\s*=\s*\$derived\.by/);
  });

  it('exposes only the active result as a tab stop (roving tabindex)', () => {
    expect(src).toMatch(/tabindex=\{order\s*===\s*activeIndex\s*\?\s*0\s*:\s*-1\}/);
  });

  it('uses listbox/option ARIA roles on the container and results', () => {
    expect(src).toContain('role="listbox"');
    expect(src).toContain('role="option"');
  });

  it('declares aria-activedescendant on the listbox container', () => {
    expect(src).toContain('aria-activedescendant=');
  });

  it('marks each option with aria-selected', () => {
    expect(src).toContain('aria-selected={order === activeIndex}');
  });

  it('has a keydown handler on the results list container', () => {
    expect(src).toContain('onkeydown={handleContainerKeyDown}');
  });

  it('keydown handler covers ArrowDown, ArrowUp, ArrowRight, ArrowLeft', () => {
    expect(src).toContain('ArrowDown');
    expect(src).toContain('ArrowUp');
    expect(src).toContain('ArrowRight');
    expect(src).toContain('ArrowLeft');
  });

  it('keydown handler covers Home and End keys', () => {
    expect(src).toContain("'Home'");
    expect(src).toContain("'End'");
  });

  it('keydown handler triggers click on Enter/Space', () => {
    expect(src).toContain("'Enter'");
    expect(src).toContain("' '");
    expect(src).toContain('handleResultClick');
  });

  it('does not trap Tab — lets it move to the next landmark', () => {
    expect(src).toContain('Do NOT preventDefault for Tab');
  });
});
