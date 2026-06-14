/**
 * canvas-aria-keyshortcuts-render-contract.test.ts — A2-7 regression test
 *
 * Verifies that the Canvas component declares aria-keyshortcuts on the
 * <canvas> element so screen reader users discover available keyboard
 * shortcuts for the 3D business explorer.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const PROJECT_ROOT = resolve(import.meta.dirname, '../..');
const CANVAS_COMPONENT = join(PROJECT_ROOT, 'src/components/Canvas.svelte');

function read(path: string): string {
  return readFileSync(path, 'utf-8');
}

/** Expected key tokens per WCAG aria-keyshortcuts spec */
const EXPECTED_KEYS = [
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Home',
  'End',
  'Plus',
  'Minus',
] as const;

describe('A2-7: Canvas aria-keyshortcuts', () => {
  let canvasSrc: string;

  beforeAll(() => {
    canvasSrc = read(CANVAS_COMPONENT);
  });

  it('canvas element has aria-keyshortcuts attribute', () => {
    expect(canvasSrc).toMatch(/aria-keyshortcuts="/);
  });

  it('canvas retains role="application"', () => {
    expect(canvasSrc).toMatch(/role="application"/);
  });

  it('canvas retains aria-label for accessible name', () => {
    expect(canvasSrc).toMatch(/aria-label="3D semantic business explorer"/);
  });

  it('aria-keyshortcuts declares all navigation and zoom keys', () => {
    for (const key of EXPECTED_KEYS) {
      expect(canvasSrc).toContain(key);
    }
  });

  it('aria-keyshortcuts value matches expected token list', () => {
    const attrMatch = canvasSrc.match(/aria-keyshortcuts="([^"]+)"/);
    expect(attrMatch).not.toBeNull();
    const tokens = attrMatch![1].split(/\s+/);
    expect(tokens).toEqual([...EXPECTED_KEYS]);
  });

  it('canvas element has tabindex for focusability', () => {
    expect(canvasSrc).toMatch(/tabindex=\{interactive \? 0 : -1\}/);
  });
});
