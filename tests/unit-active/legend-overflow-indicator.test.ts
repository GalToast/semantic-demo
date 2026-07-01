/**
 * legend-overflow-indicator.test.ts
 *
 * PR-O3: the 21-entry category legend at desktop renders only ~6 entries
 * (map mode, 38vh max-height) or ~10 entries (other modes, 60vh). The
 * remaining 11-15 categories are scrollable but the panel had no visible
 * affordance — users had no way to know more content existed below.
 *
 * The fix: a "N of M shown • scroll for more ↓" indicator that:
 *   1. Appears only when the panel's content overflows its max-height
 *   2. Pins to the bottom of the panel via `position: sticky; bottom: 0`
 *   3. Measures via ResizeObserver on the panel itself (the scroll
 *      container — not the inner .legend-list, which doesn't clip)
 *
 * Run: npx vitest run tests/unit-active/legend-overflow-indicator.test.ts
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

function readLegendComponent(): string {
    const p = resolve(__dirname, '../../src/components/Legend.svelte');
    return readFileSync(p, 'utf-8');
}

describe('PR-O3: legend overflow indicator', () => {
    it('binds the panel element to a reactive ref (bind:this on the <aside>)', () => {
        const src = readLegendComponent();
        // The <aside id="legend-panel"> must use bind:this so we can measure
        expect(src).toMatch(/<aside[^>]*bind:this=\{panelEl\}/);
    });

    it('declares panelEl, panelScrollHeight, panelClientHeight as $state', () => {
        const src = readLegendComponent();
        expect(src).toMatch(/let\s+panelEl[^]*\$state/);
        expect(src).toMatch(/let\s+panelScrollHeight\s*=\s*\$state/);
        expect(src).toMatch(/let\s+panelClientHeight\s*=\s*\$state/);
    });

    it('derives hasOverflow from panelScrollHeight > panelClientHeight', () => {
        const src = readLegendComponent();
        expect(src).toMatch(/hasOverflow\s*=\s*\$derived\(panelScrollHeight\s*>\s*panelClientHeight/);
    });

    it('measures via ResizeObserver on the panel (not the inner list)', () => {
        const src = readLegendComponent();
        // The ResizeObserver must observe panelEl (the scroll container)
        const roBlock = src.slice(
            src.indexOf('new ResizeObserver'),
            src.indexOf('new ResizeObserver') + 400
        );
        expect(roBlock).toMatch(/ro\.observe\(panelEl\)/);
    });

    it('renders the indicator only when hasOverflow is true', () => {
        const src = readLegendComponent();
        expect(src).toMatch(/\{#if hasOverflow\}[\s\S]{0,200}legend-overflow-indicator/);
    });

    it('indicator text shows "N of M shown" pattern', () => {
        const src = readLegendComponent();
        expect(src).toMatch(/\{approxVisibleCount\}\s*of\s*\{clusterEntries\.length\}\s*shown/);
    });

    it('indicator hint is "scroll for more ↓"', () => {
        const src = readLegendComponent();
        expect(src).toContain('scroll for more');
    });

    it('indicator uses position: sticky; bottom: 0 to pin during scroll', () => {
        const src = readLegendComponent();
        const cssBlock = src.slice(
            src.indexOf('.legend-overflow-indicator'),
            src.indexOf('}', src.indexOf('.legend-overflow-indicator') + 200)
        );
        expect(cssBlock).toContain('position: sticky');
        expect(cssBlock).toContain('bottom: 0');
    });

    it('indicator has aria-live="polite" so screen readers announce the count', () => {
        const src = readLegendComponent();
        expect(src).toMatch(/aria-live="polite"[^>]*data-testid="legend-overflow"|data-testid="legend-overflow"[^>]*aria-live="polite"/);
    });
});
