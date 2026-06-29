/**
 * @vitest-environment node
 *
 * component-DevTelemetry.test.ts — Source-inspection contract tests for
 * src/components/DevTelemetry.svelte (335 LOC, 0 prior tests).
 *
 * Verifies structural contracts without rendering the component:
 *  1. Root div with role="region", aria-label, aria-live="off"
 *  2. Key imports: configureTelemetry, telemetryStore, onMount, onDestroy
 *  3. visible prop with default false (tree-shake gate)
 *  4. Event counts table and recent events list with aria-labels
 *  5. Auto-scroll and clear action buttons
 *  6. Svelte 5 runes: $state, $derived
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const SRC = resolve(__dirname, '../../src/components/DevTelemetry.svelte');

function readSource(): string {
    return readFileSync(SRC, 'utf-8');
}

describe('DevTelemetry component', () => {
    let source: string;

    beforeAll(() => {
        source = readSource();
    });

    it('root div has role="region", aria-label, and aria-live="off"', () => {
        expect(source).toContain('class="dev-telemetry"');
        expect(source).toContain('role="region"');
        expect(source).toContain('aria-label="Dev telemetry overlay"');
        expect(source).toContain('aria-live="off"');
    });

    it('imports configureTelemetry, telemetryStore from @lib/telemetry', () => {
        expect(source).toMatch(
            /import\s*\{[^}]*configureTelemetry[^}]*\}\s*from\s*['"]@lib\/telemetry['"]/
        );
        expect(source).toMatch(
            /import\s*\{[^}]*telemetryStore[^}]*\}\s*from\s*['"]@lib\/telemetry['"]/
        );
    });

    it('imports onMount and onDestroy from svelte', () => {
        expect(source).toMatch(
            /import\s*\{\s*onMount\s*,\s*onDestroy\s*\}\s*from\s*['"]svelte['"]/
        );
    });

    it('visible prop defaults to false (tree-shake gate)', () => {
        expect(source).toMatch(/visible\s*=\s*false/);
        expect(source).toContain('{#if visible && mounted}');
    });

    it('event counts section and recent events section have aria-labels', () => {
        expect(source).toContain('aria-label="Event counts"');
        expect(source).toContain('aria-label="Recent events"');
    });

    it('auto-scroll and clear buttons exist', () => {
        expect(source).toContain('auto-scroll:');
        expect(source).toContain('onclick={toggleAutoScroll}');
        expect(source).toContain('onclick={handleClear}');
    });

    it('uses $state and $derived runes (Svelte 5)', () => {
        const stateCount = (source.match(/\$state/g) ?? []).length;
        const derivedCount = (source.match(/\$derived/g) ?? []).length;
        expect(stateCount).toBeGreaterThanOrEqual(3);
        expect(derivedCount).toBeGreaterThanOrEqual(1);
    });
});
