/**
 * component-Legend.test.ts — Component test for Legend.svelte
 *
 * Verifies:
 *  1. Renders aside#legend-panel with aria-label="Business category legend"
 *  2. Panel has aria-hidden="true" when open=false (default)
 *  3. Renders h2.legend-title with text "Categories"
 *  4. Renders .legend-list with role="group" and descriptive aria-label
 *  5. Renders one legend-item button per canonical CLUSTER_NAMES entry
 *  6. Each button has type="button" and aria-pressed attribute
 *  7. Each button contains .legend-swatch, .legend-label, and .legend-count spans
 *  8. Button with open=true and concealedByFocus=false gets aria-hidden="false"
 *
 * The "one per cluster" count in (5) is asserted against the canonical
 * CLUSTER_NAMES length from @lib/utils/ui-presentation rather than a hardcoded
 * number, so adding a new category to the canonical list automatically keeps
 * this test in sync.
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import Legend from '../../src/components/Legend.svelte';
import { CLUSTER_NAMES } from '@lib/utils/ui-presentation';

describe('Legend component', () => {
    it('renders aside#legend-panel with aria-label="Business category legend"', () => {
        const { container } = render(Legend);
        const panel = container.querySelector('#legend-panel');
        expect(panel).toBeTruthy();
        expect(panel!.tagName).toBe('ASIDE');
        expect(panel!.getAttribute('aria-label')).toBe('Business category legend');
    });

    it('panel has aria-hidden="true" when open=false (default)', () => {
        const { container } = render(Legend);
        const panel = container.querySelector('#legend-panel');
        expect(panel!.getAttribute('aria-hidden')).toBe('true');
    });

    it('panel gets aria-hidden="false" when open=true', () => {
        const { container } = render(Legend, { props: { open: true } });
        const panel = container.querySelector('#legend-panel');
        expect(panel!.getAttribute('aria-hidden')).toBe('false');
    });

    it('renders h2.legend-title with text "Categories"', () => {
        const { container } = render(Legend);
        const title = container.querySelector('h2.legend-title');
        expect(title).toBeTruthy();
        expect(title!.textContent).toContain('Categories');
    });

    it('renders .legend-list with role="group" and descriptive aria-label', () => {
        const { container } = render(Legend);
        const list = container.querySelector('.legend-list');
        expect(list).toBeTruthy();
        expect(list!.getAttribute('role')).toBe('group');
        expect(list!.getAttribute('aria-label')).toContain('Business categories');
    });

    it('renders one legend-item button per canonical cluster', () => {
        const { container } = render(Legend);
        const items = container.querySelectorAll('button.legend-item');
        expect(items.length).toBe(CLUSTER_NAMES.length);
    });

    it('each button has type="button" and aria-pressed attribute', () => {
        const { container } = render(Legend);
        const items = container.querySelectorAll('button.legend-item');
        items.forEach((btn) => {
            expect(btn.getAttribute('type')).toBe('button');
            expect(btn.getAttribute('aria-pressed')).not.toBeNull();
        });
    });

    it('each button contains .legend-swatch, .legend-label, and .legend-count spans', () => {
        const { container } = render(Legend);
        const items = container.querySelectorAll('button.legend-item');
        items.forEach((btn) => {
            expect(btn.querySelector('.legend-swatch')).toBeTruthy();
            expect(btn.querySelector('.legend-label')).toBeTruthy();
            expect(btn.querySelector('.legend-count')).toBeTruthy();
        });
    });
});
