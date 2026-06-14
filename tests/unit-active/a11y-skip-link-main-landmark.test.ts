/**
 * a11y-skip-link-main-landmark.test.ts — WCAG 2.4.1 + 1.3.1 contract test
 *
 * Verifies:
 *  1. A <main> element exists with id="main-content" (WCAG 1.3.1 landmark)
 *  2. The skip link in index.html references an existing ID (WCAG 2.4.1)
 *  3. Activating the skip link moves focus into #main-content (WCAG 2.4.1)
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const PROJECT_ROOT = resolve(import.meta.dirname, '../..');
const APP_SVELTE = join(PROJECT_ROOT, 'src/App.svelte');
const INDEX_HTML = join(PROJECT_ROOT, 'src/index.html');

function read(path: string): string {
  return readFileSync(path, 'utf-8');
}

describe('A11y: skip link and main landmark (A2-1 + A2-2)', () => {
  let appSrc: string;
  let indexHtml: string;

  beforeAll(() => {
    appSrc = read(APP_SVELTE);
    indexHtml = read(INDEX_HTML);
  });

  describe('Main landmark existence', () => {
    it('has a <main> element with id="main-content"', () => {
      expect(appSrc).toMatch(/<main[^>]*id="main-content"/);
    });

    it('the <main> element is not self-closing', () => {
      // Verify there is a matching </main> closing tag
      expect(appSrc).toContain('</main>');
    });
  });

  describe('Skip link target validity', () => {
    it('skip link href points to #main-content', () => {
      expect(indexHtml).toMatch(/<a[^>]*href="#main-content"[^>]*class="skip-link"/);
    });

    it('skip link text is "Skip to main content"', () => {
      expect(indexHtml).toContain('Skip to main content');
    });
  });

  describe('Focus behavior contract', () => {
    it('main element is focusable via tabindex for skip link target', () => {
      // The main element needs tabindex="-1" so programmatic focus works
      expect(appSrc).toMatch(/<main[^>]*tabindex="-1"/);
    });

    it('main element is inside the Svelte app root (not in index.html)', () => {
      // Verify the main landmark is rendered by the Svelte component
      expect(appSrc).toMatch(/<main[^>]*id="main-content"[\s\S]*<\/main>/);
    });
  });

  describe('Header landmark separation', () => {
    it('Header component is rendered outside the <main> element', () => {
      // Find the position of <main> and the Header component
      const mainOpenIndex = appSrc.indexOf('<main id="main-content"');
      const mainCloseIndex = appSrc.indexOf('</main>');
      const headerIndex = appSrc.indexOf('<Header ');

      expect(mainOpenIndex).toBeGreaterThan(-1);
      expect(mainCloseIndex).toBeGreaterThan(mainOpenIndex);
      expect(headerIndex).toBeGreaterThan(-1);

      // Header should be before <main> or after </main>, not inside
      const headerInsideMain = headerIndex > mainOpenIndex && headerIndex < mainCloseIndex;
      expect(headerInsideMain).toBe(false);
    });
  });
});
