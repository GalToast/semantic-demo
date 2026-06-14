/**
 * a11y-landmark-labels.test.ts — Regression test for Worker E (UI-A11y)
 *
 * Verifies screen-reader affordances across three components:
 *   1. InfoPanel complementary landmark has a non-empty, contextual aria-label
 *   2. Mode radio buttons have full-word aria-labels (not single-letter)
 *   3. FocusCard business name heading carries title + aria-label with the full name
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const PROJECT_ROOT = resolve(import.meta.dirname, '../..');
const INFO_PANEL = join(PROJECT_ROOT, 'src/components/InfoPanel.svelte');
const HEADER = join(PROJECT_ROOT, 'src/components/Header.svelte');
const FOCUS_CARD = join(PROJECT_ROOT, 'src/components/FocusCard.svelte');

function read(path: string): string {
  return readFileSync(path, 'utf-8');
}

/** Full mode labels that screen readers must announce */
const EXPECTED_LABELS = ['Overview', 'Search', 'Trail', 'Focus', 'Inside', 'Map'] as const;

describe('A11y: landmark labels and screen-reader affordances', () => {
  let infoPanelSrc: string;
  let headerSrc: string;
  let focusCardSrc: string;

  beforeAll(() => {
    infoPanelSrc = read(INFO_PANEL);
    headerSrc = read(HEADER);
    focusCardSrc = read(FOCUS_CARD);
  });

  // ── 1. Info Panel: complementary landmark aria-label ────────────────────

  describe('InfoPanel complementary landmark', () => {
    it('has a non-empty dynamic aria-label (not hardcoded string)', () => {
      // The aside must use a variable for aria-label, not a static string
      expect(infoPanelSrc).toMatch(/aria-label=\{panelAriaLabel\}/);
    });

    it('defines aria-label mapping for idle surface', () => {
      expect(infoPanelSrc).toContain("idle: 'Business context panel'");
    });

    it('defines aria-label mapping for focus surface', () => {
      expect(infoPanelSrc).toContain("focus: 'Focused business details'");
    });

    it('defines aria-label mapping for search surface', () => {
      expect(infoPanelSrc).toContain("search: 'Business search panel'");
    });

    it('has a fallback label for unknown surfaces', () => {
      expect(infoPanelSrc).toContain("?? 'Business information'");
    });

    it('derives panelAriaLabel from effectiveSurface', () => {
      expect(infoPanelSrc).toMatch(/let panelAriaLabel\s*=\s*\$derived/);
      expect(infoPanelSrc).toContain('ARIA_LABEL_BY_SURFACE[effectiveSurface]');
    });
  });

  // ── 2. Mode radios: full-word aria-labels ──────────────────────────────

  describe('Header mode chip radios', () => {
    it('radiogroup has aria-label', () => {
      expect(headerSrc).toMatch(/role="radiogroup"[^>]*aria-label="View mode"/);
    });

    it('each radio button carries aria-label={mode.label}', () => {
      // The button must have aria-label={mode.label} to ensure full-word
      // accessible names even when chip-label is CSS-hidden on mobile
      expect(headerSrc).toMatch(/aria-label=\{mode\.label\}/);
    });

    it('mode labels include all six required names', () => {
      for (const label of EXPECTED_LABELS) {
        expect(headerSrc).toContain(`label: '${label}'`);
      }
    });
  });

  // ── 3. FocusCard: business name heading truncation affordance ──────────

  describe('FocusCard business name heading', () => {
    it('heading has title attribute bound to selectedRecord.name', () => {
      expect(focusCardSrc).toMatch(/title=\{selectedRecord\.name\}/);
    });

    it('heading has aria-label attribute bound to selectedRecord.name', () => {
      expect(focusCardSrc).toMatch(/aria-label=\{selectedRecord\.name\}/);
    });

    it('heading is an h2 with id="focus-stage-name"', () => {
      expect(focusCardSrc).toContain('id="focus-stage-name"');
      expect(focusCardSrc).toMatch(/<h2[^>]*id="focus-stage-name"/);
    });

    it('heading has aria-live="polite" for dynamic name updates', () => {
      expect(focusCardSrc).toContain('aria-live="polite"');
    });
  });
});
