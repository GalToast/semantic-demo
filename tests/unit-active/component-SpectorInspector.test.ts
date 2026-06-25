/**
 * component-SpectorInspector.test.ts — Component test for SpectorInspector.svelte
 *
 * Uses source-inspection pattern (readFileSync + string assertions) since
 * SpectorInspector is a Three.js debug overlay with dev-only dependencies
 * (spectorjs package) that cannot be resolved in the vitest environment.
 *
 * Verifies:
 *  1. Conditional rendering gated by {#if visible}
 *  2. Root aside has .spector-status class and aria-live="polite"
 *  3. Status dot span has .spector-status__dot class and aria-hidden="true"
 *  4. Status label span has .spector-status__label class
 *  5. data-phase attribute on aside for CSS-driven state coloring
 *  6. Dev-only guard: import.meta.env.DEV check before loading spectorjs
 *  7. window.__spector bridge exposed with capture/stop/resume methods
 *  8. onDestroy cleanup removes window.__spector and window.__spectorStatus
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const SPECTOR_PATH = resolve(__dirname, '../../src/components/SpectorInspector.svelte');

function readSource(): string {
    return readFileSync(SPECTOR_PATH, 'utf-8');
}

describe('SpectorInspector component (source-inspection)', () => {
    let source: string;

    beforeAll(() => {
        source = readSource();
    });

    it('template is gated by {#if visible} conditional rendering', () => {
        expect(source).toContain('{#if visible}');
        expect(source).toContain('{/if}');
    });

    it('root aside has .spector-status class and aria-live="polite"', () => {
        expect(source).toContain('class="spector-status"');
        expect(source).toContain('aria-live="polite"');
    });

    it('status dot span has .spector-status__dot class and aria-hidden="true"', () => {
        expect(source).toContain('class="spector-status__dot"');
        expect(source).toContain('aria-hidden="true"');
    });

    it('status label span has .spector-status__label class', () => {
        expect(source).toContain('class="spector-status__label"');
        expect(source).toContain('Spector: {phase}');
    });

    it('data-phase attribute on aside for CSS-driven state coloring', () => {
        expect(source).toContain('data-phase={phase}');
        expect(source).toContain('.spector-status[data-phase="loading"]');
        expect(source).toContain('.spector-status[data-phase="ready"]');
        expect(source).toContain('.spector-status[data-phase="error"]');
    });

    it('dev-only guard checks import.meta.env.DEV before loading spectorjs', () => {
        expect(source).toContain('import.meta.env.DEV');
        expect(source).toContain("phase = 'idle'");
        expect(source).toContain("phase = 'loading'");
    });

    it('window.__spector bridge exposed with capture/stop/resume methods', () => {
        expect(source).toContain('window.__spector');
        expect(source).toContain('capture:');
        expect(source).toContain('stop:');
        expect(source).toContain('resume:');
        expect(source).toContain('listCanvases:');
        expect(source).toContain('isReady:');
    });

    it('onDestroy cleanup removes window.__spector and window.__spectorStatus', () => {
        // W48-Phase-3: src/window.d.ts declares typed Window properties
        // for __spector and __spectorStatus, so the cleanup uses
        // `delete window.__spector` directly (no per-use cast needed).
        expect(source).toContain('onDestroy');
        expect(source).toContain('delete window.__spector');
        expect(source).toContain('delete window.__spectorStatus');
        // Guard: no per-use `as unknown as` cast on the delete
        expect(source).not.toMatch(/delete\s+\(window\s+as\s+unknown/);
    });
});
