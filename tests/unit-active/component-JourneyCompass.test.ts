/**
 * @vitest-environment node
 *
 * component-JourneyCompass.test.ts — Source-inspection contract tests for
 * src/components/JourneyCompass.svelte (575 LOC, 1 prior test).
 *
 * Verifies structural contracts without rendering the component:
 *  1. Root section with id="journey-compass", class, and data-* attributes
 *  2. Key imports: appState, journeyStore, parityMap, getBypassAttr
 *  3. Three journey action buttons with correct IDs
 *  4. Step indicators with data-journey-step attributes
 *  5. Map trail strip and btn-map-county elements
 *  6. Focus-dive button with correct class and data-journey-action
 *  7. ARIA live region and label contracts
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const SRC = resolve(__dirname, '../../src/components/JourneyCompass.svelte');

function readSource(): string {
    return readFileSync(SRC, 'utf-8');
}

describe('JourneyCompass component', () => {
    let source: string;

    beforeAll(() => {
        source = readSource();
    });

    it('root section has id="journey-compass" and class="journey-compass glass-heavy"', () => {
        expect(source).toMatch(/<section\s/);
        expect(source).toContain('id="journey-compass"');
        expect(source).toContain('class="journey-compass glass-heavy"');
    });

    it('root section carries key data-* parity attributes', () => {
        expect(source).toContain('data-phase={phase}');
        expect(source).toContain('data-density={density}');
        expect(source).toContain('data-copy={copy}');
        expect(source).toContain('data-actions={actionsProfile}');
        expect(source).toContain('data-navigation-owner={navigationOwner}');
        expect(source).toContain('aria-live="polite"');
    });

    it('imports appState, journeyStore, parityMap, getBypassAttr', () => {
        expect(source).toMatch(/import\s*\{[^}]*appState[^}]*\}\s*from\s*['"]@lib\/state\/app\.svelte['"]/);
        expect(source).toMatch(/import\s*\{[^}]*journeyStore[^}]*\}\s*from\s*['"]@lib\/stores\/journey\.svelte\.ts['"]/);
        expect(source).toMatch(/import\s*\{[^}]*parityMap[^}]*getBypassAttr[^}]*\}\s*from\s*['"]@lib\/orchestration\/parity-attrs\.svelte['"]/);
    });

    it('renders three journey action buttons with correct IDs', () => {
        expect(source).toContain('id="btn-journey-primary"');
        expect(source).toContain('id="btn-journey-secondary"');
        expect(source).toContain('id="btn-journey-tertiary"');
    });

    it('journey buttons carry data-journey-action and aria-label attributes', () => {
        expect(source).toContain('data-journey-action={actionKey(primaryAction)}');
        expect(source).toContain('aria-label={buttonLabel(primaryAction, \'primary\')}');
        expect(source).toContain('aria-label={buttonLabel(compass.secondaryAction, \'secondary\')}');
    });

    it('renders #map-trail-strip and #btn-map-county elements', () => {
        expect(source).toContain('id="map-trail-strip"');
        expect(source).toContain('class="map-trail-strip"');
        expect(source).toContain('id="btn-map-county"');
        expect(source).toContain('class="map-county-reset-btn"');
    });

    it('focus-dive button has correct class and data-journey-action', () => {
        expect(source).toContain('id="btn-focus-dive"');
        expect(source).toContain('class="focus-stage-dive-btn"');
        expect(source).toContain('data-journey-action="enter-inside"');
        expect(source).toContain('aria-label="Explore the neighborhood around this business"');
    });

    it('step indicators use data-journey-step and aria-label', () => {
        expect(source).toContain('data-journey-step={stepPhase}');
        expect(source).toContain('class="journey-compass-step"');
        expect(source).toMatch(/aria-label=\{`\$\{stepIndex \+ 1\}\. /);
    });

    // ── PR-C: Mode picker dedup ────────────────────────────────────────────

    it('PR-C: adds suppress-step-indicators class gated by focus/inside phase', () => {
        expect(source).toContain('class:suppress-step-indicators={suppressStepIndicators}');
        expect(source).toContain('let suppressStepIndicators = $derived(');
        expect(source).toMatch(/phase === 'focus' \|\| phase === 'inside'/);
    });

    it('PR-C: adds suppress-actions class gated by focus/inside phase on desktop', () => {
        expect(source).toContain('class:suppress-actions={suppressJourneyActions}');
        expect(source).toContain('let suppressJourneyActions = $derived(');
        expect(source).toMatch(/\(phase === 'focus' \|\| phase === 'inside'\) && !\$viewport\.isCompact/);
    });

    it('PR-C: CSS hides step indicators under .suppress-step-indicators', () => {
        expect(source).toContain('.journey-compass.suppress-step-indicators [data-journey-step]');
        expect(source).toContain('display: none;');
    });

    it('PR-C: CSS hides action buttons under .suppress-actions', () => {
        expect(source).toContain('.journey-compass.suppress-actions .journey-compass-actions');
        expect(source).toContain('display: none;');
    });
});
