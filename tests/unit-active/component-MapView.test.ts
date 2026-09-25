/**
 * component-MapView.test.ts — Component test foundation for MapView.svelte
 *
 * Verifies:
 *  1. Renders section.map-view with role="application"
 *  2. Section has aria-label="Interactive business map of Montgomery County"
 *  3. Renders header with .map-view-kicker and h2.map-view-title
 *  4. Renders .map-status with role="status" and aria-live="polite"
 *  5. Renders loading shimmer with aria-hidden="true"
 *  6. Renders footer with back button having aria-label="Return to overview"
 *  7. Back button is type="button" to prevent form submission
 *  8. Renders attribution text in footer
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import MapView from '../../src/components/MapView.svelte';

describe('MapView component', () => {
    it('renders section.map-view with role="application"', () => {
        const { container } = render(MapView);
        const section = container.querySelector('section.map-view');
        expect(section).toBeTruthy();
        expect(section!.getAttribute('role')).toBe('application');
    });

    it('section has aria-label="Interactive business map of Montgomery County"', () => {
        const { container } = render(MapView);
        const section = container.querySelector('section.map-view');
        expect(section!.getAttribute('aria-label')).toBe('Interactive business map of Montgomery County');
    });

    it('renders header with kicker and title', () => {
        const { container } = render(MapView);
        const kicker = container.querySelector('.map-view-kicker');
        const title = container.querySelector('h2.map-view-title');
        expect(kicker).toBeTruthy();
        expect(kicker!.textContent).toContain('MAP');
        expect(title).toBeTruthy();
        expect(title!.textContent).toContain('County terrain');
    });

    it('renders .map-status with role="status" and aria-live="polite"', () => {
        const { container } = render(MapView);
        const status = container.querySelector('.map-status');
        expect(status).toBeTruthy();
        expect(status!.getAttribute('role')).toBe('status');
        expect(status!.getAttribute('aria-live')).toBe('polite');
    });

    it('renders loading shimmer with aria-hidden="true"', () => {
        const { container } = render(MapView);
        const shimmer = container.querySelector('.map-shimmer');
        expect(shimmer).toBeTruthy();
        expect(shimmer!.getAttribute('aria-hidden')).toBe('true');
        // Shimmer should contain multiple shimmer-row divs
        const rows = shimmer!.querySelectorAll('.shimmer-row');
        expect(rows.length).toBeGreaterThanOrEqual(3);
    });

    it('renders footer with back button having aria-label="Return to overview"', () => {
        const { container } = render(MapView);
        const btn = container.querySelector('.map-back-btn');
        expect(btn).toBeTruthy();
        expect(btn!.getAttribute('aria-label')).toBe('Return to overview');
        expect(btn!.tagName).toBe('BUTTON');
    });

    it('back button is type="button"', () => {
        const { container } = render(MapView);
        const btn = container.querySelector('.map-back-btn');
        expect(btn!.getAttribute('type')).toBe('button');
    });

    it('renders attribution text in footer', () => {
        const { container } = render(MapView);
        const attribution = container.querySelector('.map-attribution');
        expect(attribution).toBeTruthy();
        expect(attribution!.textContent).toContain('OpenStreetMap');
    });
});
