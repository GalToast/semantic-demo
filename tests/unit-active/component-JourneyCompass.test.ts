/**
 * component-JourneyCompass.test.ts — Component test for JourneyCompass.svelte
 *
 * Uses source-inspection (readFileSync + string assertions) to verify the
 * a11y/structure contract. The component imports multiple stores (navStore,
 * journeyStore, focusStore) which hit circular dependency chains in the vitest
 * environment, preventing a full render(). This pattern matches the
 * established component-FocusCard.test.ts approach.
 *
 * Verifies:
 *  1. Root section#journey-compass has class journey-compass and data-phase attribute
 *  2. Root element has aria-live="polite" for screen reader announcements
 *  3. Journey step spans have data-journey-step attribute with aria-label
 *  4. #journey-compass-kicker, #journey-compass-title, #journey-compass-note divs exist
 *  5. Action buttons #btn-journey-primary, #btn-journey-secondary, #btn-journey-tertiary
 *  6. #map-trail-strip div with hidden attribute and aria-hidden
 *  7. #btn-focus-dive button with aria-label and data-journey-action
 *  8. #focus-stage-inside-controls with Next Stop, Map, County buttons
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const SOURCE_PATH = resolve(__dirname, '../../src/components/JourneyCompass.svelte');

function readSource(): string {
    return readFileSync(SOURCE_PATH, 'utf-8');
}

describe('JourneyCompass component', () => {
    let source: string;

    beforeAll(() => {
        source = readSource();
    });

    it('root section#journey-compass has class journey-compass and data-phase attribute', () => {
        expect(source).toContain('id="journey-compass"');
        expect(source).toContain('class="journey-compass glass-heavy"');
        expect(source).toContain('data-phase={phase}');
    });

    it('root element has data-density and data-actions attributes', () => {
        expect(source).toContain('data-density={density}');
        expect(source).toContain('data-actions={actionsProfile}');
        expect(source).toContain('data-navigation-owner={navigationOwner}');
    });

    it('root element has aria-live="polite" for screen reader announcements', () => {
        expect(source).toContain('aria-live="polite"');
    });

    it('journey step spans have data-journey-step and aria-label with phase description', () => {
        expect(source).toContain('data-journey-step={stepPhase}');
        expect(source).toContain('class="journey-compass-step"');
        expect(source).toContain('aria-label={`${stepIndex + 1}. ${stepPhase}:');
    });

    it('compass content divs #journey-compass-kicker, #journey-compass-title, #journey-compass-note exist', () => {
        expect(source).toContain('id="journey-compass-kicker"');
        expect(source).toContain('id="journey-compass-title"');
        expect(source).toContain('id="journey-compass-note"');
    });

    it('action buttons #btn-journey-primary, #btn-journey-secondary, #btn-journey-tertiary exist', () => {
        expect(source).toContain('id="btn-journey-primary"');
        expect(source).toContain('id="btn-journey-secondary"');
        expect(source).toContain('id="btn-journey-tertiary"');
        expect(source).toContain('class="journey-compass-actions"');
    });

    it('#map-trail-strip div has hidden attribute and aria-hidden', () => {
        expect(source).toContain('id="map-trail-strip"');
        expect(source).toContain('class="map-trail-strip"');
        expect(source).toContain('hidden={!showMapTrailStrip}');
        expect(source).toContain('aria-hidden={!showMapTrailStrip');
    });

    it('#btn-focus-dive button has aria-label and data-journey-action="enter-inside"', () => {
        expect(source).toContain('id="btn-focus-dive"');
        expect(source).toContain('class="focus-stage-dive-btn"');
        expect(source).toContain('data-journey-action="enter-inside"');
        expect(source).toContain('aria-label="Explore the neighborhood around this business"');
    });

    it('#focus-stage-inside-controls contains Next Stop, Map, County buttons', () => {
        expect(source).toContain('id="focus-stage-inside-controls"');
        expect(source).toContain('id="btn-inside-next"');
        expect(source).toContain('id="btn-inside-map"');
        expect(source).toContain('id="btn-inside-county"');
        expect(source).toContain('Next Stop');
    });
});
