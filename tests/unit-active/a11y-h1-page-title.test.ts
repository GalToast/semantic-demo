/**
 * a11y-h1-page-title.test.ts — WCAG 1.3.1 heading hierarchy contract test
 *
 * Verifies:
 *  1. App.svelte contains exactly one <h1> element
 *  2. The H1 is visible (not .sr-only or display:none)
 *  3. The H1 is the first heading on the page
 *  4. The H1 text is descriptive of the page
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const PROJECT_ROOT = resolve(import.meta.dirname, '../..');
const APP_SVELTE = join(PROJECT_ROOT, 'src/App.svelte');

function read(path: string): string {
  return readFileSync(path, 'utf-8');
}

describe('A11y: H1 page title (A2-6)', () => {
  let appSrc: string;

  beforeAll(() => {
    appSrc = read(APP_SVELTE);
  });

  describe('H1 existence and uniqueness', () => {
    it('contains exactly one <h1> element in the template', () => {
      // Extract the template portion (between last </script> and first <style>)
      const scriptEnd = appSrc.lastIndexOf('</script>');
      const styleStart = appSrc.indexOf('<style>');
      const template = appSrc.substring(scriptEnd, styleStart);
      const h1Matches = template.match(/<h1[\s>]/g);
      expect(h1Matches).toHaveLength(1);
    });

    it('the H1 has descriptive text content', () => {
      const h1Match = appSrc.match(/<h1[^>]*>([^<]+)<\/h1>/);
      expect(h1Match).not.toBeNull();
      const text = h1Match![1].trim();
      expect(text.length).toBeGreaterThan(5);
      // Should mention the app name
      expect(text.toLowerCase()).toMatch(/semantic|explorer/);
    });
  });

  describe('H1 visibility', () => {
    it('the H1 does not have sr-only class', () => {
      const h1Match = appSrc.match(/<h1[^>]*>/);
      expect(h1Match).not.toBeNull();
      expect(h1Match![0]).not.toContain('sr-only');
    });

    it('the H1 does not have display:none style', () => {
      // Check the H1 element itself doesn't have inline display:none
      const h1Match = appSrc.match(/<h1[^>]*>/);
      expect(h1Match).not.toBeNull();
      expect(h1Match![0]).not.toContain('display:none');
      expect(h1Match![0]).not.toContain('display: none');
    });

    it('the H1 has a visible class for styling', () => {
      const h1Match = appSrc.match(/<h1[^>]*class="([^"]*)"[^>]*>/);
      expect(h1Match).not.toBeNull();
      const classes = h1Match![1];
      // Should have a class that provides visible styling (not sr-only)
      expect(classes).not.toBe('sr-only');
      expect(classes.length).toBeGreaterThan(0);
    });
  });

  describe('H1 heading hierarchy', () => {
    it('the H1 is before any H2 or H3 in the template', () => {
      const scriptEnd = appSrc.lastIndexOf('</script>');
      const template = appSrc.substring(scriptEnd);
      const h1Index = template.search(/<h1[\s>]/);
      const h2Index = template.search(/<h2[\s>]/);
      const h3Index = template.search(/<h3[\s>]/);

      expect(h1Index).toBeGreaterThan(-1);

      // H1 should come before any H2 or H3 (if they exist)
      if (h2Index > -1) {
        expect(h1Index).toBeLessThan(h2Index);
      }
      if (h3Index > -1) {
        expect(h1Index).toBeLessThan(h3Index);
      }
    });

    it('the H1 is before the <main> landmark (first heading on page)', () => {
      const mainStart = appSrc.indexOf('<main id="main-content"');
      const h1Index = appSrc.indexOf('<h1', mainStart > -1 ? 0 : 0);

      expect(mainStart).toBeGreaterThan(-1);
      expect(h1Index).toBeGreaterThan(-1);
      // H1 must come before <main> in the template
      expect(h1Index).toBeLessThan(mainStart);
    });
  });
});
