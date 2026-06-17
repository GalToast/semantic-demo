/**
 * component-MapSummary.test.ts — Component test for MapSummary.svelte
 *
 * Uses source-inspection (readFileSync + string assertions) to verify the
 * a11y/structure contract. The component imports from journey and navigation
 * stores which hit circular dependency chains in the vitest environment,
 * preventing a full render().
 *
 * Verifies:
 *  1. Root .map-summary with id="map-trail" and role="img"
 *  2. Root has aria-label="Journey trail mini-map"
 *  3. .map-title contains "Trail"
 *  4. SVG .map-svg with viewBox and aria-hidden="true"
 *  5. SVG contains <line> elements for connection lines
 *  6. SVG contains <circle> elements for node dots
 *  7. .map-stops container for stop labels
 *  8. .map-stop items with .stop-num and .stop-name sub-elements
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const MAP_SUMMARY_PATH = resolve(__dirname, '../../src/components/MapSummary.svelte');

function readSource(): string {
    return readFileSync(MAP_SUMMARY_PATH, 'utf-8');
}

describe('MapSummary component', () => {
    let source: string;

    beforeAll(() => {
        source = readSource();
    });

    it('root .map-summary with id="map-trail" and role="img"', () => {
        expect(source).toContain('class="map-summary"');
        expect(source).toContain('id="map-trail"');
        expect(source).toContain('role="img"');
    });

    it('root has aria-label="Journey trail mini-map"', () => {
        expect(source).toContain('aria-label="Journey trail mini-map"');
    });

    it('.map-title contains "Trail"', () => {
        expect(source).toContain('class="map-title"');
        expect(source).toContain('Trail');
    });

    it('SVG .map-svg with viewBox and aria-hidden="true"', () => {
        expect(source).toContain('class="map-svg"');
        expect(source).toContain('viewBox="0 0 164 70"');
        expect(source).toContain('aria-hidden="true"');
    });

    it('SVG contains <line> elements for connection lines', () => {
        expect(source).toContain('<line');
        expect(source).toContain('stroke="rgba(78, 205, 196, 0.3)"');
        expect(source).toContain('stroke-width="1.5"');
        expect(source).toContain('stroke-linecap="round"');
    });

    it('SVG contains <circle> elements for node dots', () => {
        expect(source).toContain('<circle');
        expect(source).toContain('fill={isCurrent ? \'#4ecdc4\'');
    });

    it('.map-stops container for stop labels', () => {
        expect(source).toContain('class="map-stops"');
    });

    it('.map-stop items with .stop-num and .stop-name sub-elements', () => {
        expect(source).toContain('class="map-stop"');
        expect(source).toContain('class="stop-num"');
        expect(source).toContain('class="stop-name"');
    });
});
