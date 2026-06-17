/**
 * component-JourneyChrome.test.ts — Component test for JourneyChrome.svelte
 *
 * Verifies:
 *  1. Component mounts without error when visible=true
 *  2. Component mounts without error when visible=false
 *  3. When visible=false, .journey-chrome is absent from DOM
 *  4. When visible=true (idle gate), .journey-chrome is absent from DOM
 *  5. When visible=true (idle gate), .journey-header is absent
 *  6. When visible=true (idle gate), .trail-controls is absent
 *  7. When visible=true (idle gate), #btn-prev-node is absent
 *  8. When visible=true (idle gate), #focus-stage-journey is absent
 *
 * Note: JourneyChrome wraps its entire template in
 * `{#if visible && !isJourneyIdle}`. The isJourneyIdle derived value is true
 * in the default test environment (stores start idle), so no child elements
 * render. These tests verify the conditional-gate behavior is working.
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import JourneyChrome from '../../src/components/JourneyChrome.svelte';

describe('JourneyChrome component', () => {
    it('component mounts without error when visible=true', () => {
        const { container } = render(JourneyChrome, { props: { visible: true } });
        expect(container).toBeTruthy();
    });

    it('component mounts without error when visible=false', () => {
        const { container } = render(JourneyChrome, { props: { visible: false } });
        expect(container).toBeTruthy();
    });

    it('when visible=false, .journey-chrome is absent from DOM', () => {
        const { container } = render(JourneyChrome, { props: { visible: false } });
        const chrome = container.querySelector('.journey-chrome');
        expect(chrome).toBeNull();
    });

    it('when visible=true (idle gate), .journey-chrome is absent from DOM', () => {
        const { container } = render(JourneyChrome, { props: { visible: true } });
        const chrome = container.querySelector('.journey-chrome');
        expect(chrome).toBeNull();
    });

    it('when visible=true (idle gate), .journey-header is absent', () => {
        const { container } = render(JourneyChrome, { props: { visible: true } });
        const header = container.querySelector('.journey-header');
        expect(header).toBeNull();
    });

    it('when visible=true (idle gate), .trail-controls is absent', () => {
        const { container } = render(JourneyChrome, { props: { visible: true } });
        const controls = container.querySelector('.trail-controls');
        expect(controls).toBeNull();
    });

    it('when visible=true (idle gate), #btn-prev-node is absent', () => {
        const { container } = render(JourneyChrome, { props: { visible: true } });
        const prevBtn = container.querySelector('#btn-prev-node');
        expect(prevBtn).toBeNull();
    });

    it('when visible=true (idle gate), #focus-stage-journey is absent', () => {
        const { container } = render(JourneyChrome, { props: { visible: true } });
        const focusStage = container.querySelector('#focus-stage-journey');
        expect(focusStage).toBeNull();
    });
});
