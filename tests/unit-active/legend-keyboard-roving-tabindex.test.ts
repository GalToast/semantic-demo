/**
 * legend-keyboard-roving-tabindex.test.ts
 *
 * A2-3: The category legend must not create one Tab stop per category.
 * It should expose one active category button to Tab and use arrow keys
 * for intra-legend movement.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const LEGEND = resolve(import.meta.dirname, '../../src/components/Legend.svelte');

function readLegend(): string {
  return readFileSync(LEGEND, 'utf-8');
}

describe('A2-3: legend keyboard roving tabindex', () => {
  const src = readLegend();

  it('tracks the active legend button index', () => {
    expect(src).toContain('activeLegendButtonIndex');
    expect(src).toMatch(/let\s+legendButtons:\s*HTMLButtonElement\[\]/);
  });

  it('only exposes the active visible legend item as a tab stop', () => {
    expect(src).toMatch(/tabindex=\{open\s*&&\s*!concealedByFocus\s*&&\s*i\s*===\s*activeLegendButtonIndex\s*\?\s*0\s*:\s*-1\}/);
  });

  it('supports arrow key navigation inside the legend group', () => {
    expect(src).toContain('function handleLegendKeydown');
    for (const key of ['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft', 'Home', 'End']) {
      expect(src).toContain(`case '${key}'`);
    }
  });

  it('adds an accessible keyboard hint to the legend item group', () => {
    expect(src).toMatch(/role="group"[^>]*aria-label="Business categories\. Use arrow keys to move between categories\."/);
  });
});
