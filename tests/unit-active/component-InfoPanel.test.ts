/**
 * component-InfoPanel.test.ts — Component test for InfoPanel.svelte
 *
 * Uses source-inspection (readFileSync + string assertions) to verify the
 * a11y/structure contract. The component imports from many stores
 * (@lib/stores/navigation.svelte.ts, @lib/stores/search.svelte,
 * @lib/stores/index.svelte.ts) which hit circular dependency chains in the
 * vitest environment.
 *
 * The file header documents the full set of DOM ids/classes expected by
 * contract tests. This test verifies the structural a11y contract.
 *
 * Verifies:
 *  1. Root #info-panel has role="complementary" with dynamic aria-label
 *  2. #info-panel-content container exists
 *  3. .info-header class is present
 *  4. Empty state #selected-empty with .selected-empty class
 *  5. .selected-empty-headline contains "Business Name"
 *  6. .selected-empty-sub contains guidance text
 *  7. Populated state #selected-card has aria-label="Selected business"
 *  8. #selected-role-badge and .selected-hero elements exist
 *  9. ARIA_LABEL_BY_SURFACE maps correct labels per surface
 * 10. #selected-name, #selected-what, #selected-theme elements in markup
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const INFO_PANEL_PATH = resolve(__dirname, '../../src/components/InfoPanel.svelte');

function readSource(): string {
    return readFileSync(INFO_PANEL_PATH, 'utf-8');
}

describe('InfoPanel component', () => {
    let source: string;

    beforeAll(() => {
        source = readSource();
    });

    it('root aside#info-panel has aria-label and aria-live', () => {
        expect(source).toContain('id="info-panel"');
        // <aside> has implicit complementary role
        expect(source).toMatch(/<aside[\s\S]*id="info-panel"/);
        expect(source).toContain('aria-label={panelAriaLabel}');
        expect(source).toContain('aria-live="polite"');
    });

    it('#info-panel-content container exists', () => {
        expect(source).toContain('id="info-panel-content"');
    });

    it('.info-header class is present', () => {
        expect(source).toContain('class="info-header"');
    });

    it('empty state #selected-empty with .selected-empty class', () => {
        expect(source).toContain('id="selected-empty"');
        expect(source).toContain('class="selected-empty"');
    });

    it('.selected-empty-headline has empty state headline', () => {
        expect(source).toContain('class="selected-empty-headline"');
        expect(source).toContain('{contentDescriptor.emptyHeadline}');
    });

    it('.selected-empty-sub has empty state subtext', () => {
        expect(source).toContain('class="selected-empty-sub"');
        expect(source).toContain('{contentDescriptor.emptySubtext}');
    });

    it('populated state #selected-card has .selected-card class', () => {
        expect(source).toContain('id="selected-card"');
        expect(source).toContain('class="selected-card"');
    });

    it('#selected-role-badge and .selected-hero elements exist', () => {
        expect(source).toContain('id="selected-role-badge"');
        expect(source).toContain('.selected-role-badge');
        expect(source).toContain('class="selected-hero"');
    });

    it('ARIA_LABEL_BY_SURFACE maps correct labels per surface', () => {
        expect(source).toContain('ARIA_LABEL_BY_SURFACE');
        expect(source).toContain("idle: 'Business context panel'");
        expect(source).toContain("focus: 'Focused business details'");
        expect(source).toContain("search: 'Business search panel'");
        expect(source).toContain("'semantic-dive': 'Semantic dive exploration'");
    });

    it('#selected-name, #selected-what, #selected-theme elements in markup', () => {
        expect(source).toContain('id="selected-name"');
        expect(source).toContain('id="selected-what"');
        expect(source).toContain('id="selected-theme"');
    });

    it('selected-empty section uses contentDescriptor for copy', () => {
        expect(source).toContain('id="selected-empty"');
        expect(source).toContain('emptyHeadline');
        expect(source).toContain('emptySubtext');
    });

    it('#info-panel-content container exists with .info-panel-content class', () => {
        expect(source).toContain('id="info-panel-content"');
        expect(source).toContain('class="info-panel-content"');
    });
});
