/**
 * legend-display-none-offscreen.test.ts
 *
 * Ticket UI-4: display:none on translated-off-screen Legend (mobile).
 *
 * Per the Mimo + M3 audits, the legend panel was translated off-screen
 * (transform: translateX(-120%)) on mobile focus but still had
 * display:block, consuming GPU/compositor resources while invisible.
 *
 * The fix: a CSS rule that adds display:none to #legend-panel when the
 * Svelte component's .open class is absent.
 *
 * Run: npx vitest run tests/unit-active/legend-display-none-offscreen.test.ts
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

function readStateCss(): string {
    const p = resolve(__dirname, '../../css/mobile_premium__state.css');
    return readFileSync(p, 'utf-8');
}

function readLegendComponent(): string {
    const p = resolve(__dirname, '../../src/components/Legend.svelte');
    return readFileSync(p, 'utf-8');
}

describe('UI-4: legend display:none when off-screen', () => {
    it('mobile_premium__state.css contains display:none for #legend-panel:not(.open)', () => {
        const css = readStateCss();
        // Match the rule that hides the legend when not open
        expect(css).toMatch(/#legend-panel:not\(\.open\)\s*\{[^}]*display\s*:\s*none/);
    });

    it('the rule does not use !important', () => {
        const css = readStateCss();
        // Extract the block around #legend-panel:not(.open)
        const block = css.slice(
            css.indexOf('#legend-panel:not(.open)'),
            css.indexOf('}', css.indexOf('#legend-panel:not(.open)') + 1) + 1,
        );
        expect(block).not.toContain('!important');
    });

    it('Legend.svelte applies .open class that re-enables display', () => {
        const src = readLegendComponent();
        // The component should have a class:open binding
        expect(src).toMatch(/class:open/);
        // The scoped CSS should set transform on .legend (off-screen default)
        expect(src).toMatch(/\.legend\s*\{[^}]*transform\s*:\s*translateX\(-120%\)/);
    });

    it('the fix uses a CSS-only approach (no JS state change required)', () => {
        const css = readStateCss();
        // The rule should be a plain CSS selector, not dependent on JS toggling display
        const idx = css.indexOf('#legend-panel:not(.open)');
        expect(idx).toBeGreaterThan(-1);
        // Verify it appears after the existing expanded-state block (cascade order)
        const expandedBlock = css.indexOf('focus-search');
        expect(idx).toBeGreaterThan(expandedBlock);
    });
});
