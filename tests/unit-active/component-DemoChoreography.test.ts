/**
 * component-DemoChoreography.test.ts — Component test for DemoChoreography.svelte
 *
 * Uses source-inspection (readFileSync + string assertions) to verify the
 * a11y/structure contract. The component imports from demo.svelte.ts and
 * businessRecords which hit circular dependencies in the vitest environment,
 * preventing a full render(). This pattern matches the FocusCard approach.
 *
 * Verifies:
 *  1. Root .demo-choreography div has id="demo-choreography"
 *  2. Root element has aria-live="polite" for live region
 *  3. Root element has aria-label="Guided demo"
 *  4. Dismiss button has .demo-dismiss class and aria-label="Dismiss demo"
 *  5. Dismiss button uses × (multiply sign) as visible text
 *  6. Status paragraph .demo-status displays phase labels
 *  7. Phase labels object contains all expected phases
 *  8. Conditional rendering gated by eligible && isDemoActive()
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const SOURCE_PATH = resolve(__dirname, '../../src/components/DemoChoreography.svelte');

function readSource(): string {
    return readFileSync(SOURCE_PATH, 'utf-8');
}

describe('DemoChoreography component', () => {
    let source: string;

    beforeAll(() => {
        source = readSource();
    });

    it('root .demo-choreography div has id="demo-choreography"', () => {
        expect(source).toContain('class="demo-choreography"');
        expect(source).toContain('id="demo-choreography"');
    });

    it('root element has aria-live="polite" for live region', () => {
        expect(source).toContain('aria-live="polite"');
    });

    it('root element has aria-label="Guided demo"', () => {
        expect(source).toContain('aria-label="Guided demo"');
    });

    it('dismiss button has .demo-dismiss class and aria-label="Dismiss demo"', () => {
        expect(source).toContain('class="demo-dismiss"');
        expect(source).toContain('aria-label="Dismiss demo"');
    });

    it('dismiss button uses × (multiply sign) as visible text', () => {
        expect(source).toContain('onclick={dismissDemo}');
        expect(source).toContain('>&times;</button>');
    });

    it('status paragraph .demo-status displays phase labels', () => {
        expect(source).toContain('class="demo-status"');
        expect(source).toContain('{phaseLabels[demoPhase()]');
    });

    it('phase labels object contains all expected phases', () => {
        expect(source).toContain('OVERVIEW:');
        expect(source).toContain('SEARCH:');
        expect(source).toContain('FOCUS:');
        expect(source).toContain('THREADS:');
        expect(source).toContain('NEIGHBORS:');
        expect(source).toContain('TRAIL:');
        expect(source).toContain('DIVE:');
        expect(source).toContain('FILTER:');
        expect(source).toContain('MAP:');
        expect(source).toContain('RETURN:');
        expect(source).toContain('COMPLETE:');
        expect(source).toContain('CANCELLED:');
    });

    it('conditional rendering gated by eligible && isDemoActive()', () => {
        expect(source).toContain('{#if eligible && isDemoActive()}');
    });
});
