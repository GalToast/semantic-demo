/**
 * component-FocusPocket.test.ts — Component test for FocusPocket.svelte
 *
 * Uses source-inspection (readFileSync + string assertions) to verify the
 * a11y/structure contract. The component imports from navStore, focus.svelte,
 * and data-store.svelte which hit circular dependencies in the vitest env,
 * preventing a full render(). This pattern matches the FocusCard approach.
 *
 * Verifies:
 *  1. Root div has id="focus-pocket"
 *  2. Root div has role="region"
 *  3. Root div has aria-label="Focus pocket — neighborhood constellation"
 *  4. Root div has tabindex="-1" (programmatic focus only)
 *  5. Conditional rendering gated by {#if hasFocus_}
 *  6. Loading shimmer .focus-pocket-loading has role="status"
 *  7. Loading shimmer has aria-label="Loading neighborhood data"
 *  8. Two .pocket-shimmer divs (default + .short variant)
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const SOURCE_PATH = resolve(__dirname, '../../src/components/FocusPocket.svelte');

function readSource(): string {
    return readFileSync(SOURCE_PATH, 'utf-8');
}

describe('FocusPocket component', () => {
    let source: string;

    beforeAll(() => {
        source = readSource();
    });

    it('root div has id="focus-pocket"', () => {
        expect(source).toContain('id="focus-pocket"');
    });

    it('root div has role="region"', () => {
        expect(source).toContain('role="region"');
    });

    it('root div has aria-label="Focus pocket — neighborhood constellation"', () => {
        expect(source).toContain('aria-label="Focus pocket — neighborhood constellation"');
    });

    it('root div has tabindex="-1" (programmatic focus only)', () => {
        expect(source).toContain('tabindex="-1"');
    });

    it('conditional rendering gated by {#if hasFocus_}', () => {
        expect(source).toContain('{#if hasFocus_}');
    });

    it('loading shimmer .focus-pocket-loading has role="status"', () => {
        expect(source).toContain('class="focus-pocket-loading"');
        expect(source).toContain('role="status"');
    });

    it('loading shimmer has aria-label="Loading neighborhood data"', () => {
        expect(source).toContain('aria-label="Loading neighborhood data"');
    });

    it('two .pocket-shimmer divs (default + .short variant)', () => {
        const pocketShimmerMatches = source.match(/class="pocket-shimmer/g);
        expect(pocketShimmerMatches).toHaveLength(2);
        expect(source).toContain('class="pocket-shimmer short"');
    });
});
