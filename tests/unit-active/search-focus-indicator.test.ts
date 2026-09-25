/**
 * search-focus-indicator.test.ts — Verify the search focus indicator + kbd shortcut chip
 *
 * UI-3: The P1 quickjump search shortcut (/ key) lacked visual feedback.
 * This test ensures:
 * 1. The SearchInput.svelte file contains the <kbd> shortcut hint
 * 2. CSS hides the kbd when .search-input-wrap:focus-within
 * 3. A focus state is defined for .search-input-wrap (outline/box-shadow)
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const SEARCH_INPUT_PATH = resolve(__dirname, '../../src/components/SearchInput.svelte');

function readSource(): string {
  return readFileSync(SEARCH_INPUT_PATH, 'utf-8');
}

describe('Search focus indicator (UI-3)', () => {
  let source: string;

  beforeAll(() => {
    source = readSource();
  });

  it('contains a <kbd> shortcut hint element', () => {
    expect(source).toContain('class="search-shortcut-hint"');
    expect(source).toContain('aria-hidden="true"');
    expect(source).toContain('<kbd');
  });

  it('renders the "/" character inside the kbd chip', () => {
    // The kbd element should contain just "/" as text
    const kbdMatch = source.match(/<kbd[^>]*>\/<\/kbd>/);
    expect(kbdMatch).toBeTruthy();
  });

  it('hides the kbd chip when search input is focused (focus-within)', () => {
    // The CSS should have a rule that hides the shortcut hint on focus-within
    expect(source).toContain('.search-input-wrap:focus-within .search-shortcut-hint');
    expect(source).toContain('opacity: 0');
  });

  it('defines a visible focus state for .search-input-wrap', () => {
    // The wrapper should have a focus-within rule with visible styling
    expect(source).toContain('.search-input-wrap:focus-within');
    // Should include either box-shadow or outline for the focus ring
    const hasFocusRing =
      source.includes('box-shadow') && source.includes('.search-input-wrap:focus-within');
    const hasFocusOutline =
      source.includes('outline') && source.includes('.search-input-wrap:focus-within');
    expect(hasFocusRing || hasFocusOutline).toBe(true);
  });

  it('defines a focus-visible state for #search-input', () => {
    // The input itself should have a focus-visible rule
    expect(source).toContain('.search-input:focus-visible');
  });

  it('the kbd chip has pointer-events: none so it does not intercept clicks', () => {
    expect(source).toContain('pointer-events: none');
  });
});
