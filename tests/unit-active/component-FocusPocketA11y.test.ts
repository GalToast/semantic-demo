/**
 * component-FocusPocketA11y.test.ts — Component test for FocusPocketA11y.svelte
 *
 * Uses source-inspection (readFileSync + string assertions) to verify the
 * a11y/structure contract. The component imports focusStore from
 * @lib/stores/focus.svelte which hits circular dependency chains in the vitest
 * environment, preventing a full render(). This pattern matches the
 * established component-FocusCard.test.ts approach.
 *
 * Verifies:
 *  1. Root ul#focus-pocket-a11y has role="list" and aria-label="Neighborhood businesses"
 *  2. Root element has class focus-pocket-a11y and aria-live="polite"
 *  3. Each <li> has role="button", tabindex="0", and aria-label with node.label and node.role
 *  4. Each <li> contains span.role-dot with aria-hidden="true" and data-role attribute
 *  5. Each <li> contains span.label for the business name
 *  6. Toggle button #focus-pocket-list-toggle with aria-expanded and aria-controls
 *  7. Toggle button text switches between "View as list" and "Hide list"
 *  8. Svelte event handlers: onclick calls focusOnNode, onkeydown calls handleKeydown
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const SOURCE_PATH = resolve(__dirname, '../../src/components/FocusPocketA11y.svelte');

function readSource(): string {
    return readFileSync(SOURCE_PATH, 'utf-8');
}

describe('FocusPocketA11y component', () => {
    let source: string;

    beforeAll(() => {
        source = readSource();
    });

    it('root ul#focus-pocket-a11y has role="list" and aria-label="Neighborhood businesses"', () => {
        expect(source).toContain('id="focus-pocket-a11y"');
        expect(source).toContain('role="list"');
        expect(source).toContain('aria-label="Neighborhood businesses"');
    });

    it('root element has class focus-pocket-a11y and aria-live="polite"', () => {
        expect(source).toContain('class="focus-pocket-a11y"');
        expect(source).toContain('aria-live="polite"');
    });

    it('each <li> has role="button", tabindex="0", and aria-label with label and role', () => {
        expect(source).toContain('role="button"');
        expect(source).toContain('tabindex={0}');
        expect(source).toContain('aria-label="{node.label} ({node.role})"');
    });

    it('each <li> contains span.role-dot with aria-hidden="true" and data-role attribute', () => {
        expect(source).toContain('class="role-dot"');
        expect(source).toContain('data-role={node.role}');
        expect(source).toContain('aria-hidden="true"');
    });

    it('each <li> contains span.label for the business name', () => {
        expect(source).toContain('class="label"');
        expect(source).toContain('{node.label}');
    });

    it('toggle button #focus-pocket-list-toggle has aria-expanded and aria-controls', () => {
        expect(source).toContain('id="focus-pocket-list-toggle"');
        expect(source).toContain('type="button"');
        expect(source).toContain('aria-expanded={isVisible}');
        expect(source).toContain('aria-controls="focus-pocket-a11y"');
    });

    it('toggle button text switches between "View as list" and "Hide list"', () => {
        expect(source).toContain("isVisible ? 'Hide list' : 'View as list'");
    });

    it('svelte event handlers wire onclick to focusOnNode and onkeydown to handleKeydown', () => {
        expect(source).toContain('onclick={() => focusOnNode(node)}');
        expect(source).toContain('onkeydown={(event) => handleKeydown(event, node)}');
    });
});
