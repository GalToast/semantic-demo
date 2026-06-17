/**
 * component-Header.test.ts — Component test for Header.svelte
 *
 * Verifies:
 *  1. Renders header#app-header with .app-header class
 *  2. Contains .header-brand with .brand-mark and .brand-label
 *  3. Renders #btn-legend button with aria-label
 *  4. Renders #btn-keyboard-help button with aria-label
 *  5. Renders .mode-chips#mode-chips with role="radiogroup"
 *  6. Mode-chips container has aria-label="View mode"
 *  7. Renders 6 mode chips with role="radio" and aria-checked
 *  8. Default active mode is "overview" (aria-checked="true")
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import Header from '../../src/components/Header.svelte';

describe('Header component', () => {
    it('renders header#app-header with .app-header class', () => {
        const { container } = render(Header);
        const header = container.querySelector('header#app-header');
        expect(header).toBeTruthy();
        expect(header!.classList.contains('app-header')).toBe(true);
    });

    it('contains .header-brand with .brand-mark and .brand-label', () => {
        const { container } = render(Header);
        const brand = container.querySelector('.header-brand');
        expect(brand).toBeTruthy();
        const mark = brand!.querySelector('.brand-mark');
        expect(mark).toBeTruthy();
        expect(mark!.textContent).toContain('SE');
        const label = brand!.querySelector('.brand-label');
        expect(label).toBeTruthy();
        expect(label!.textContent).toContain('Semantic Explorer');
    });

    it('renders #btn-legend button with aria-label', () => {
        const { container } = render(Header);
        const btn = container.querySelector('#btn-legend');
        expect(btn).toBeTruthy();
        expect(btn!.tagName).toBe('BUTTON');
        const label = btn!.getAttribute('aria-label');
        expect(label).toBeTruthy();
        expect(label!.length).toBeGreaterThan(0);
    });

    it('renders #btn-keyboard-help button with aria-label', () => {
        const { container } = render(Header);
        const btn = container.querySelector('#btn-keyboard-help');
        expect(btn).toBeTruthy();
        expect(btn!.tagName).toBe('BUTTON');
        expect(btn!.getAttribute('aria-label')).toBe('Open keyboard shortcuts');
    });

    it('renders .mode-chips#mode-chips with role="radiogroup"', () => {
        const { container } = render(Header);
        const chips = container.querySelector('.mode-chips#mode-chips');
        expect(chips).toBeTruthy();
        expect(chips!.getAttribute('role')).toBe('radiogroup');
    });

    it('mode-chips container has aria-label="View mode"', () => {
        const { container } = render(Header);
        const chips = container.querySelector('#mode-chips');
        expect(chips).toBeTruthy();
        expect(chips!.getAttribute('aria-label')).toBe('View mode');
    });

    it('renders 6 mode chips with role="radio" and aria-checked', () => {
        const { container } = render(Header);
        const chips = container.querySelectorAll('.mode-chip[role="radio"]');
        expect(chips.length).toBe(6);
        chips.forEach((chip) => {
            expect(chip.hasAttribute('aria-checked')).toBe(true);
            expect(chip.hasAttribute('data-mode')).toBe(true);
            expect(chip.hasAttribute('aria-label')).toBe(true);
        });
    });

    it('default active mode is "overview" (aria-checked="true")', () => {
        const { container } = render(Header);
        const overviewChip = container.querySelector('.mode-chip[data-mode="overview"]');
        expect(overviewChip).toBeTruthy();
        expect(overviewChip!.getAttribute('aria-checked')).toBe('true');
        expect(overviewChip!.getAttribute('role')).toBe('radio');
        // Other chips should not be active
        const searchChip = container.querySelector('.mode-chip[data-mode="search"]');
        expect(searchChip!.getAttribute('aria-checked')).toBe('false');
    });
});
