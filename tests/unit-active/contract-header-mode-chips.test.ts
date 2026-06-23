/**
 * contract-header-mode-chips.test.ts — Worker B (A2-5b)
 *
 * Verifies the roving tabindex radiogroup pattern on Header.svelte:
 *  1. Only the active mode chip has tabindex="0"; all others have tabindex="-1"
 *  2. Radiogroup container has aria-keyshortcuts for arrow/Home/End navigation
 *  3. Each chip carries a data-mode attribute for keyboard focus targeting
 *  4. handleModeKeydown and handleModeFocusin are wired to the container
 *  5. selectMode syncs activeIndex with the chosen mode
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const PROJECT_ROOT = resolve(import.meta.dirname, '../..');
const HEADER = join(PROJECT_ROOT, 'src/components/Header.svelte');

function read(path: string): string {
  return readFileSync(path, 'utf-8');
}

describe('A2-5b: Header mode-chip roving tabindex radiogroup', () => {
  let src: string;

  beforeAll(() => {
    src = read(HEADER);
  });

  // ── 1. Roving tabindex ────────────────────────────────────────────────

  describe('roving tabindex on mode chips', () => {
    it('active chip gets tabindex={0} via ternary on isActive()', () => {
      expect(src).toMatch(/tabindex=\{isActive\(mode\.id\) \? 0 : -1\}/);
    });

    it('exactly 6 mode chips are rendered via {#each modes}', () => {
      const eachMatch = src.match(/\{#each modes as mode \(mode\.id\)\}/);
      expect(eachMatch).toBeTruthy();
    });
  });

  // ── 2. Radiogroup container ARIA ──────────────────────────────────────

  describe('radiogroup container attributes', () => {
    it('container has role="radiogroup"', () => {
      expect(src).toMatch(/role="radiogroup"/);
    });

    it('container has aria-label="View mode"', () => {
      expect(src).toMatch(/aria-label="View mode"/);
    });

    it('container has aria-keyshortcuts covering all navigation keys', () => {
      expect(src).toMatch(/aria-keyshortcuts="[^"]*ArrowUp[^"]*ArrowDown[^"]*ArrowLeft[^"]*ArrowRight[^"]*Home[^"]*End[^"]*"/);
    });

    it('container has onkeydown={handleModeKeydown}', () => {
      expect(src).toMatch(/onkeydown=\{handleModeKeydown\}/);
    });

    it('container has onfocusin={handleModeFocusin}', () => {
      expect(src).toMatch(/onfocusin=\{handleModeFocusin\}/);
    });
  });

  // ── 3. data-mode attribute ────────────────────────────────────────────

  describe('data-mode on each chip', () => {
    it('each button carries data-mode={mode.id}', () => {
      expect(src).toMatch(/data-mode=\{mode\.id\}/);
    });
  });

  // ── 4. Keyboard handler logic ─────────────────────────────────────────

  describe('handleModeKeydown function', () => {
    it('handles ArrowRight and ArrowDown with skip-disabled wrap', () => {
      expect(src).toMatch(/case 'ArrowRight':/);
      expect(src).toMatch(/case 'ArrowDown':/);
      // Skip-disabled navigation: arrows advance to the next *enabled* chip.
      expect(src).toMatch(/nextEnabledIndex\(activeIndex, 1\)/);
    });

    it('handles ArrowLeft and ArrowUp with skip-disabled wrap', () => {
      expect(src).toMatch(/case 'ArrowLeft':/);
      expect(src).toMatch(/case 'ArrowUp':/);
      expect(src).toMatch(/nextEnabledIndex\(activeIndex, -1\)/);
    });

    it('handles Home to jump to first enabled chip', () => {
      expect(src).toMatch(/case 'Home':/);
      expect(src).toMatch(/newIndex = firstEnabled;/);
    });

    it('handles End to jump to last enabled chip', () => {
      expect(src).toMatch(/case 'End':/);
      expect(src).toMatch(/newIndex = lastEnabled;/);
    });

    it('skips locked (disabled) chips in arrow navigation', () => {
      // nextEnabledIndex uses isModeLocked to skip selection-dependent chips.
      expect(src).toMatch(/function nextEnabledIndex/);
      expect(src).toMatch(/isModeLocked\(m\.id\)/);
    });

    it('focuses the target chip via .mode-chip[data-mode] selector', () => {
      expect(src).toMatch(/\.mode-chip\[data-mode=/);
    });

    it('prevents default on navigation keys', () => {
      // At least 4 preventDefault calls in the switch (ArrowRight/Down, ArrowLeft/Up, Home, End)
      const preventCount = (src.match(/e\.preventDefault\(\)/g) ?? []).length;
      expect(preventCount).toBeGreaterThanOrEqual(4);
    });
  });

  // ── 5. focusin handler ────────────────────────────────────────────────

  describe('handleModeFocusin function', () => {
    it('syncs activeIndex when a chip receives focus', () => {
      expect(src).toMatch(/function handleModeFocusin/);
      expect(src).toMatch(/classList\.contains\('mode-chip'\)/);
      expect(src).toMatch(/getAttribute\('data-mode'\)/);
    });
  });

  // ── 6. selectMode syncs activeIndex ───────────────────────────────────

  describe('selectMode activeIndex sync', () => {
    it('updates activeIndex after mode dispatch', () => {
      expect(src).toMatch(/activeIndex = idx;/);
    });

    it('finds index by modeId match', () => {
      expect(src).toMatch(/modes\.findIndex\(\(m\) => m\.id === modeId\)/);
    });
  });

  // ── 7. activeIndex initialization ─────────────────────────────────────

  describe('activeIndex initialization', () => {
    it('initializes from currentMode/currentSurface at mount', () => {
      expect(src).toMatch(/let activeIndex = \$state\(Math\.max\(0, modes\.findIndex/);
    });

    it('updates activeIndex in the navStore subscription', () => {
      expect(src).toMatch(/if \(idx >= 0\) activeIndex = idx;/);
    });
  });

  // ── 8. Selection-dependent mode disabling (a11y UX) ────────────────────
  // trail/focus/inside require a focused node; they are proactively disabled
  // (aria-disabled) rather than appearing active but no-oping without a selection.

  describe('selection-dependent mode disabling', () => {
    it('defines the selection-dependent mode set (trail/focus/inside)', () => {
      expect(src).toMatch(/SELECTION_DEPENDENT_MODES/);
      expect(src).toMatch(/'trail'/);
      expect(src).toMatch(/'focus'/);
      expect(src).toMatch(/'inside'/);
    });

    it('tracks whether a selection exists via focusedIndex', () => {
      expect(src).toMatch(/hasSelection/);
      expect(src).toMatch(/focusedIndex\(\)/);
    });

    it('exposes isModeLocked(modeId) helper', () => {
      expect(src).toMatch(/function isModeLocked/);
    });

    it('renders disabled + aria-disabled on chips when locked', () => {
      expect(src).toMatch(/disabled=\{isModeLocked\(mode\.id\)\}/);
      expect(src).toMatch(/aria-disabled=\{isModeLocked\(mode\.id\)\}/);
    });

    it('guards selectMode against locked modes (defense in depth)', () => {
      expect(src).toMatch(/if \(isModeLocked\(modeId\)\) return/);
    });
  });
});
