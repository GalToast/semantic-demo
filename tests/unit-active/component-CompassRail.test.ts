/**
 * component-CompassRail.test.ts — Component test for CompassRail.svelte
 *
 * Verifies:
 *  1. Renders div.compass-rail with role="navigation" and aria-label="Journey compass"
 *  2. Root element has id="compass-rail"
 *  3. Renders each compass step as a button.compass-step
 *  4. Each step button has aria-label starting with "Navigate to"
 *  5. Each step contains a .step-dot span and .step-label span
 *  6. Step label text is non-empty and matches known phase names
 *  7. Root element has class "compass-steps"
 *  8. Root element is hidden when visible is false
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import CompassRail from '../../src/components/CompassRail.svelte';

describe('CompassRail component', () => {
    it('renders div.compass-rail with role="navigation" and aria-label="Journey compass"', () => {
        const { container } = render(CompassRail, { props: { visible: true } });
        const rail = container.querySelector('.compass-rail');
        expect(rail).toBeTruthy();
        expect(rail!.getAttribute('role')).toBe('navigation');
        expect(rail!.getAttribute('aria-label')).toBe('Journey compass');
    });

    it('root element has id="compass-rail"', () => {
        const { container } = render(CompassRail, { props: { visible: true } });
        const rail = container.querySelector('#compass-rail');
        expect(rail).toBeTruthy();
        expect(rail!.tagName).toBe('DIV');
    });

    it('renders each compass step as a button.compass-step', () => {
        const { container } = render(CompassRail, { props: { visible: true } });
        const steps = container.querySelectorAll('button.compass-step');
        expect(steps.length).toBeGreaterThan(0);
    });

    it('each step button has aria-label starting with "Navigate to"', () => {
        const { container } = render(CompassRail, { props: { visible: true } });
        const steps = container.querySelectorAll('button.compass-step');
        steps.forEach((step) => {
            const label = step.getAttribute('aria-label');
            expect(label).toBeTruthy();
            expect(label!.startsWith('Navigate to')).toBe(true);
        });
    });

    it('each step contains a .step-dot span and .step-label span', () => {
        const { container } = render(CompassRail, { props: { visible: true } });
        const steps = container.querySelectorAll('button.compass-step');
        steps.forEach((step) => {
            const dot = step.querySelector('.step-dot');
            expect(dot).toBeTruthy();
            expect(dot!.tagName).toBe('SPAN');
            const label = step.querySelector('.step-label');
            expect(label).toBeTruthy();
            expect(label!.tagName).toBe('SPAN');
        });
    });

    it('step label text is non-empty and matches known phase names', () => {
        const knownPhases = ['overview', 'search', 'focus', 'inside', 'map'];
        const { container } = render(CompassRail, { props: { visible: true } });
        const labels = container.querySelectorAll('.step-label');
        labels.forEach((label) => {
            const text = label.textContent!.trim().toLowerCase();
            expect(text.length).toBeGreaterThan(0);
            expect(knownPhases).toContain(text);
        });
    });

    it('root element has class "compass-steps"', () => {
        const { container } = render(CompassRail, { props: { visible: true } });
        const rail = container.querySelector('.compass-rail');
        expect(rail).toBeTruthy();
        expect(rail!.classList.contains('compass-steps')).toBe(true);
    });

    it('root element is hidden when visible is false', () => {
        const { container } = render(CompassRail, { props: { visible: false } });
        const rail = container.querySelector('.compass-rail');
        expect(rail).toBeNull();
    });
});
