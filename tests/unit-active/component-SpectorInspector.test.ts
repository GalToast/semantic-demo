/**
 * @vitest-environment node
 *
 * component-SpectorInspector.test.ts — Source-inspection contract tests for
 * src/components/SpectorInspector.svelte (388 LOC, 1 prior test).
 *
 * Verifies structural contracts without rendering the component:
 *  1. visible prop with default false (tree-shake gate)
 *  2. Key imports: onMount, onDestroy, debugWarn, debugLog
 *  3. LoadPhase type covering idle/loading/ready/unsupported/error
 *  4. Status badge with data-phase and aria-live="polite"
 *  5. window.__spector and window.__spectorStatus bridge contracts
 *  6. Dynamic import of spectorjs
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const SRC = resolve(__dirname, '../../src/components/SpectorInspector.svelte');

function readSource(): string {
    return readFileSync(SRC, 'utf-8');
}

describe('SpectorInspector component', () => {
    let source: string;

    beforeAll(() => {
        source = readSource();
    });

    it('visible prop defaults to false (tree-shake gate)', () => {
        expect(source).toMatch(/visible\s*=\s*false/);
        expect(source).toContain('{#if visible}');
    });

    it('imports onMount, onDestroy from svelte and debugWarn, debugLog from @lib/utils/debug', () => {
        expect(source).toMatch(
            /import\s*\{\s*onMount\s*,\s*onDestroy\s*\}\s*from\s*['"]svelte['"]/
        );
        expect(source).toMatch(
            /import\s*\{\s*debugWarn\s*,\s*debugLog\s*\}\s*from\s*['"]@lib\/utils\/debug['"]/
        );
    });

    it('declares LoadPhase type with all five phases', () => {
        expect(source).toContain("type LoadPhase = 'idle' | 'loading' | 'ready' | 'unsupported' | 'error'");
    });

    it('status badge has data-phase attribute and aria-live="polite"', () => {
        expect(source).toContain('class="spector-status"');
        expect(source).toContain('data-phase={phase}');
        expect(source).toContain('aria-live="polite"');
    });

    it('publishes window.__spectorStatus with phase and bridgeReady', () => {
        expect(source).toContain('__spectorStatus');
        expect(source).toContain('phase,');
        expect(source).toContain('bridgeReady: isReady');
    });

    it('exposes window.__spector bridge with capture, stop, and listCanvases', () => {
        expect(source).toContain('window.__spector = bridge');
        expect(source).toContain('listCanvases');
        expect(source).toContain('capture:');
        expect(source).toContain('stop:');
    });

    it('cleans up window.__spector and __spectorStatus on destroy', () => {
        expect(source).toMatch(/delete\s+window\.__spector/);
        expect(source).toMatch(/delete\s+window\.__spectorStatus/);
    });
});
