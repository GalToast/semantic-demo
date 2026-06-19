/**
 * mobile-mode-chip-icons.test.ts — Regression test for Ticket UI-8
 *
 * Verifies that mode chips use SVG sprite icons instead of single-letter
 * text prefixes. On mobile (≤768px), icons are visible and text labels
 * hidden; on desktop, text labels are shown and icons hidden.
 *
 * The SVG sprite symbols live in src/index.html and are referenced from
 * Header.svelte via <use href="#icon-..."> in the mode-chip markup.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const PROJECT_ROOT = resolve(import.meta.dirname, '../..');
const HEADER_SVELTE = join(PROJECT_ROOT, 'src/components/Header.svelte');
const INDEX_HTML = join(PROJECT_ROOT, 'src/index.html');

/** Read a file as UTF-8 string */
function read(path: string): string {
  return readFileSync(path, 'utf-8');
}

/** All six mode IDs that must have SVG icon mappings */
const REQUIRED_MODES = ['overview', 'search', 'trail', 'focus', 'inside', 'map'] as const;

/** Expected icon-id mappings (mode → sprite symbol id) */
const EXPECTED_ICONS: Record<string, string> = {
  overview: 'icon-mycelium',
  search: 'icon-search',
  trail: 'icon-trail-bloom',
  focus: 'icon-orbit',
  inside: 'icon-zoom-in',
  map: 'icon-map',
};

describe('UI-8: mobile mode chip icons', () => {
  const headerSrc = read(HEADER_SVELTE);
  const indexHtml = read(INDEX_HTML);

  // ── Markup: SVG <use> replaces text letters ──────────────────────────────

  describe('Header.svelte uses SVG sprite icons', () => {
    it('renders <svg> with <use href="#{mode.iconId}"> template syntax', () => {
      // Source uses Svelte template: <use href="#{mode.iconId}"/>
      expect(headerSrc).toContain('<use href="#{mode.iconId}"/>');
    });

    it('maps each mode to a known sprite icon id', () => {
      for (const mode of REQUIRED_MODES) {
        const iconId = EXPECTED_ICONS[mode];
        expect(headerSrc).toContain(`'${iconId}'`);
      }
    });

    it('does not use single-letter text icons (M, S, T, F, I, G)', () => {
      // The old pattern was icon: 'M', icon: 'S', etc. in the modes array
      // After the fix, the field is iconId with sprite references
      expect(headerSrc).not.toMatch(/icon:\s*'[MSTFIG]'/);
      expect(headerSrc).toMatch(/iconId:\s*'icon-/);
    });

    it('hides .chip-icon on desktop (display: none)', () => {
      // The base style should hide the SVG icon; media query shows it on mobile
      expect(headerSrc).toMatch(/\.chip-icon\s*\{[^}]*display:\s*none/s);
    });

    it('shows .chip-icon on mobile via media query', () => {
      // The file must contain both the 768px media query and a .chip-icon display:block rule
      expect(headerSrc).toContain('@media (max-width: 768px)');
      // After the media query, .chip-icon must have display: block somewhere
      const afterMedia = headerSrc.substring(headerSrc.indexOf('@media (max-width: 768px)'));
      expect(afterMedia).toMatch(/\.chip-icon[\s\S]*display:\s*block/);
    });

    it('hides .chip-label on mobile via media query', () => {
      const afterMedia = headerSrc.substring(headerSrc.indexOf('@media (max-width: 768px)'));
      expect(afterMedia).toMatch(/\.chip-label[\s\S]*display:\s*none/);
    });
  });

  // ── SVG sprite: symbols exist in index.html ──────────────────────────────

  describe('SVG sprite symbols exist in index.html', () => {
    it('contains all six required symbol definitions', () => {
      for (const mode of REQUIRED_MODES) {
        const symbolId = EXPECTED_ICONS[mode];
        expect(indexHtml).toContain(`id="${symbolId}"`);
      }
    });

    it('each symbol has a viewBox="0 0 24 24"', () => {
      for (const mode of REQUIRED_MODES) {
        const symbolId = EXPECTED_ICONS[mode];
        // Find the symbol block and check viewBox
        const symbolRegex = new RegExp(
          `<symbol\\s+id="${symbolId}"\\s+viewBox="0 0 24 24">`
        );
        expect(indexHtml).toMatch(symbolRegex);
      }
    });
  });

  // ── Semantic correctness ─────────────────────────────────────────────────

  describe('icon-to-mode semantic mapping', () => {
    it('overview maps to icon-mycelium (galaxy view)', () => {
      expect(EXPECTED_ICONS.overview).toBe('icon-mycelium');
    });

    it('search maps to icon-search', () => {
      expect(EXPECTED_ICONS.search).toBe('icon-search');
    });

    it('trail maps to icon-trail-bloom', () => {
      expect(EXPECTED_ICONS.trail).toBe('icon-trail-bloom');
    });

    it('focus maps to icon-orbit (focus ring metaphor)', () => {
      expect(EXPECTED_ICONS.focus).toBe('icon-orbit');
    });

    it('inside maps to icon-zoom-in (go deeper)', () => {
      expect(EXPECTED_ICONS.inside).toBe('icon-zoom-in');
    });

    it('map maps to icon-map', () => {
      expect(EXPECTED_ICONS.map).toBe('icon-map');
    });
  });
});
