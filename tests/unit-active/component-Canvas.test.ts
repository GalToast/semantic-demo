/**
 * component-Canvas.test.ts — Component test for Canvas.svelte (Three.js)
 *
 * Uses source-inspection pattern (readFileSync + string assertions) because
 * Canvas depends on Three.js which cannot render in the vitest environment.
 *
 * Verifies:
 *  1. #map-container has aria-hidden="true" (non-semantic overlay)
 *  2. #map-container has data-active-view="idle" default state
 *  3. #canvas-container has semantic-canvas-container class and z-index CSS variable
 *  4. canvas.semantic-canvas has role="application" for interactive 3D widget
 *  5. canvas has aria-label="3D semantic business explorer"
 *  6. canvas has aria-keyshortcuts covering full keyboard navigation set
 *  7. canvas binds dynamic width/height from $viewport with $viewport.dpr
 *  8. a11y suppression comment is present for interactive/noninteractive role
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const CANVAS_PATH = resolve(__dirname, '../../src/components/Canvas.svelte');

function readSource(): string {
    return readFileSync(CANVAS_PATH, 'utf-8');
}

describe('Canvas component (source-inspection)', () => {
    let source: string;

    beforeAll(() => {
        source = readSource();
    });

    it('#map-container has aria-hidden="true"', () => {
        expect(source).toContain('id="map-container"');
        expect(source).toContain('aria-hidden="true"');
    });

    it('#map-container has data-active-view="idle" default state', () => {
        expect(source).toContain('data-active-view="idle"');
    });

    it('#canvas-container has semantic-canvas-container class and z-index CSS variable', () => {
        expect(source).toContain('id="canvas-container"');
        expect(source).toContain('class="semantic-canvas-container"');
        expect(source).toContain("z-index: var(--z-canvas)");
    });

    it('canvas.semantic-canvas has role="application"', () => {
        expect(source).toContain('class="semantic-canvas"');
        expect(source).toContain('role="application"');
    });

    it('canvas has aria-label="3D semantic business explorer"', () => {
        expect(source).toContain('aria-label="3D semantic business explorer"');
    });

    it('canvas has aria-keyshortcuts covering full keyboard navigation set', () => {
        expect(source).toContain('aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight Home End Plus Minus"');
    });

    it('canvas binds dynamic width/height from $viewport with $viewport.dpr', () => {
        expect(source).toContain('width={$viewport.width * $viewport.dpr}');
        expect(source).toContain('height={$viewport.height * $viewport.dpr}');
    });

    it('a11y suppression comment present for interactive/noninteractive role', () => {
        expect(source).toContain('a11y_no_interactive_element_to_noninteractive_role');
    });
});
