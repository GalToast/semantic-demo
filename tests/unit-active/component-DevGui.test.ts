/**
 * component-DevGui.test.ts — Component test for DevGui.svelte
 *
 * Uses source-inspection (readFileSync + string assertions) to verify the
 * a11y/structure contract. The component lazy-imports lil-gui and depends
 * on import.meta.env.DEV, preventing a full render() in the vitest env.
 * This pattern matches the FocusCard approach.
 *
 * Verifies:
 *  1. Template is gated by {#if visible}
 *  2. Rendered div has role="complementary"
 *  3. Rendered div has aria-label="Developer tools"
 *  4. Props interface defines optional visible prop
 *  5. Auto-rotate state exposed for GUI binding
 *  6. Focus personality override state exposed
 *  7. onMount block checks visible prop before creating GUI
 *  8. GUI cleanup via return () => guiInstance?.destroy()
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const SOURCE_PATH = resolve(__dirname, '../../src/components/DevGui.svelte');

function readSource(): string {
    return readFileSync(SOURCE_PATH, 'utf-8');
}

describe('DevGui component', () => {
    let source: string;

    beforeAll(() => {
        source = readSource();
    });

    it('template is gated by {#if visible}', () => {
        expect(source).toContain('{#if visible}');
    });

    it('rendered div has role="complementary"', () => {
        expect(source).toContain('role="complementary"');
    });

    it('rendered div has aria-label="Developer tools"', () => {
        expect(source).toContain('aria-label="Developer tools"');
    });

    it('props interface defines optional visible prop with default false', () => {
        expect(source).toContain('interface Props');
        expect(source).toContain('visible?: boolean');
        expect(source).toContain('visible = false');
    });

    it('auto-rotate state exposed for GUI binding', () => {
        expect(source).toContain('autoRotateEnabled');
        expect(source).toContain('Auto-rotate');
    });

    it('focus personality override state exposed', () => {
        expect(source).toContain('focusPersonalityOverride');
        expect(source).toContain('Force personality');
    });

    it('onMount block checks visible prop before creating GUI', () => {
        expect(source).toContain('onMount');
        expect(source).toContain('if (!visible) return;');
    });

    it('GUI cleanup via return () => guiInstance?.destroy()', () => {
        expect(source).toContain('guiInstance?.destroy()');
    });
});
