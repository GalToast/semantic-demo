/**
 * @vitest-environment node
 *
 * component-Placeholder2D.test.ts — Source-inspection contract tests for
 * src/components/Placeholder2D.svelte (430 LOC, 0 prior tests).
 *
 * Verifies structural contracts without rendering the component:
 *  1. Root <main> element with correct class + aria-label + data-testid
 *  2. SVG aria-hidden="true" (decorative orb cluster)
 *  3. Key imports: engineReady, CONFIG, CLUSTER_COLORS
 *  4. CTA button with tap-target attributes and aria-describedby
 *  5. "Preview" badge label (W47-C copy contract)
 *  6. Legend list with data-testid and aria-label
 *  7. prefers-reduced-motion media queries (a11y motion contract)
 *  8. placeholder-hint paragraph linked from CTA
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const SRC = resolve(__dirname, '../../src/components/Placeholder2D.svelte');

function readSource(): string {
    return readFileSync(SRC, 'utf-8');
}

describe('Placeholder2D component', () => {
    let source: string;

    beforeAll(() => {
        source = readSource();
    });

    it('root <main> has class="placeholder-2d", aria-label, and data-testid', () => {
        expect(source).toMatch(/<main\s/);
        expect(source).toContain('class="placeholder-2d"');
        expect(source).toContain('aria-label="Semantic explorer preview"');
        expect(source).toContain('data-testid="placeholder-2d"');
    });

    it('SVG orb cluster is aria-hidden="true" (decorative)', () => {
        expect(source).toMatch(/<svg[\s\S]*?aria-hidden="true"/);
        expect(source).toContain('class="placeholder-svg"');
    });

    it('imports engineReady, CONFIG, and CLUSTER_COLORS', () => {
        expect(source).toMatch(/import\s*\{[^}]*engineReady[^}]*\}\s*from\s*['"]@lib\/stores\/engine-ready\.svelte['"]/);
        expect(source).toMatch(/import\s*\{[^}]*CONFIG[^}]*\}\s*from\s*['"]@lib\/engine\/config['"]/);
        expect(source).toMatch(/import\s*\{[^}]*CLUSTER_COLORS[^}]*\}\s*from\s*['"]@lib\/utils\/design-tokens['"]/);
    });

    it('CTA button has data-testid, aria-label, aria-describedby, and min tap target', () => {
        expect(source).toContain('data-testid="placeholder-cta"');
        expect(source).toContain('aria-label="Enter 3D scene"');
        expect(source).toContain('aria-describedby="placeholder-hint"');
        expect(source).toContain('min-height: 44px');
    });

    it('contains "Preview" badge for W47-C copy contract', () => {
        expect(source).toContain('class="placeholder-badge"');
        expect(source).toContain('>Preview<');
    });

    it('legend list has data-testid and aria-label for a11y', () => {
        expect(source).toContain('data-testid="placeholder-legend"');
        expect(source).toContain('aria-label="Business categories in the dataset"');
        expect(source).toContain('class="placeholder-legend"');
    });

    it('prefers-reduced-motion media queries gate animations', () => {
        expect(source).toContain('prefers-reduced-motion: no-preference');
        expect(source).toContain('prefers-reduced-motion: reduce');
        expect(source).toMatch(/animation:\s*none\s*!important/);
    });

    it('placeholder-hint paragraph exists and is linked from CTA via id', () => {
        expect(source).toContain('id="placeholder-hint"');
        expect(source).toContain('class="placeholder-hint"');
        expect(source).toContain('Tap to load the full scene');
    });
});
