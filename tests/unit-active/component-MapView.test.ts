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
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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
})

/**
 * W48 mock-fallback regression contract.
 *
 * The previous MapView.svelte had a `setLegacyView()` function that mutated
 * `appState.currentView` via `(appState as unknown as RuntimeState).currentView = view`,
 * where `RuntimeState` was a locally-fabricated interface declaring
 * `currentView?: string` — widening the actual `ViewName` (5-value string
 * union) to `string` and bypassing the type system entirely. This dishonest
 * cast let ANY string be assigned to a typed property.
 *
 * The fix: drop the cast (direct assignment is type-safe because the parameter
 * type 'galaxy' | 'map' is a subset of ViewName) and delete the `RuntimeState`
 * and `RuntimeMap` interfaces that existed only to support the cast.
 *
 * These tests lock in the absence of the cast and the dead interfaces so a
 * future contributor who reaches for a similar escape hatch fails the contract.
 */
describe('W48: no dishonest appState.currentView cast in MapView', () => {
    const MAPVIEW_SRC_PATH = resolve(__dirname, '../../src/components/MapView.svelte');

    function readMapViewSource(): string {
        return readFileSync(MAPVIEW_SRC_PATH, 'utf-8');
    }

    it('does not cast "appState as unknown as RuntimeState"', () => {
        const src = readMapViewSource();
        expect(
            src,
            'MapView must not use "as unknown as RuntimeState" casts to mutate appState.currentView'
        ).not.toMatch(/appState\s+as\s+unknown\s+as\s+RuntimeState/);
    });

    it('does not declare a local RuntimeState interface', () => {
        // The local RuntimeState interface existed only to widen the cast target.
        // With direct assignment it is dead code.
        const src = readMapViewSource();
        expect(
            src,
            'MapView must not declare a local interface RuntimeState (it was only used for the dishonest cast)'
        ).not.toMatch(/interface\s+RuntimeState/);
    });

    it('does not declare a local RuntimeMap interface', () => {
        // The local RuntimeMap interface existed only as a member of RuntimeState.
        // With RuntimeState gone, RuntimeMap is also dead.
        const src = readMapViewSource();
        expect(
            src,
            'MapView must not declare a local interface RuntimeMap (it was only used inside the deleted RuntimeState)'
        ).not.toMatch(/interface\s+RuntimeMap/);
    });

    it('setLegacyView routes currentView through writeNavStateMirror (no cast)', () => {
        // Verify the function body uses writeNavStateMirror, the canonical
        // single-writer funnel (cbc770bb refactor).
        const src = readMapViewSource();
        const fnIdx = src.indexOf('function setLegacyView');
        expect(fnIdx, 'setLegacyView function must exist').toBeGreaterThan(-1);
        // Extract body up to the matching closing brace.
        const bodyStart = src.indexOf('{', fnIdx);
        let depth = 1;
        let i = bodyStart + 1;
        while (i < src.length && depth > 0) {
            const c = src[i];
            if (c === '{') depth++;
            else if (c === '}') depth--;
            i++;
        }
        const body = src.slice(bodyStart, i);
        expect(
            body,
            'setLegacyView must route through writeNavStateMirror'
        ).toMatch(/writeNavStateMirror\(\{\s*currentView:\s*view/);
        expect(
            body,
            'setLegacyView must not contain any "as unknown as" cast'
        ).not.toMatch(/as\s+unknown\s+as/);
    });
});
