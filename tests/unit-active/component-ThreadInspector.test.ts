/**
 * component-ThreadInspector.test.ts — Component test for ThreadInspector.svelte
 *
 * Uses source-inspection (readFileSync + string assertions) to verify the
 * a11y/structure contract. The component imports from focus and navigation
 * stores which hit circular dependency chains in the vitest environment,
 * preventing a full render().
 *
 * Verifies:
 *  1. Root .thread-inspector with id="thread-inspector" and role="complementary"
 *  2. Root has aria-label="Thread connection inspector"
 *  3. Section .focus-thread-inspector with aria-labelledby
 *  4. Header .inspector-header with kicker text and close button
 *  5. h2 .focus-thread-inspector-title with id
 *  6. Copy paragraph .focus-thread-inspector-copy with id
 *  7. Meta stats .focus-thread-inspector-meta for segments/braids/endpoints
 *  8. Action buttons: #btn-thread-pin, #btn-thread-follow, #btn-thread-clear
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const THREAD_INSPECTOR_PATH = resolve(__dirname, '../../src/components/ThreadInspector.svelte');

function readSource(): string {
    return readFileSync(THREAD_INSPECTOR_PATH, 'utf-8');
}

describe('ThreadInspector component', () => {
    let source: string;

    beforeAll(() => {
        source = readSource();
    });

    it('root .thread-inspector with id="thread-inspector" and role="complementary"', () => {
        expect(source).toContain('class="thread-inspector"');
        expect(source).toContain('id="thread-inspector"');
        expect(source).toContain('role="complementary"');
    });

    it('root has aria-label="Thread connection inspector"', () => {
        expect(source).toContain('aria-label="Thread connection inspector"');
    });

    it('section .focus-thread-inspector with aria-labelledby', () => {
        expect(source).toContain('class="focus-thread-inspector active"');
        expect(source).toContain('id="focus-thread-inspector"');
        expect(source).toContain('aria-labelledby="focus-thread-inspector-title"');
    });

    it('header .inspector-header with kicker text and close button', () => {
        expect(source).toContain('class="inspector-header"');
        expect(source).toContain('Connection Preview');
        expect(source).toContain('aria-label="Close inspector"');
        expect(source).toContain('&times;');
    });

    it('h2 .focus-thread-inspector-title with id', () => {
        expect(source).toContain('id="focus-thread-inspector-title"');
        expect(source).toMatch(/class="[^"]*\bfocus-thread-inspector-title\b[^"]*"/);
    });

    it('copy paragraph .focus-thread-inspector-copy with id', () => {
        expect(source).toContain('id="focus-thread-inspector-copy"');
        expect(source).toMatch(/class="[^"]*\bfocus-thread-inspector-copy\b[^"]*"/);
        expect(source).toContain('Previewing the semantic connection');
    });

    it('meta stats .focus-thread-inspector-meta for segments/braids/endpoints', () => {
        expect(source).toContain('id="focus-thread-inspector-meta"');
        expect(source).toMatch(/class="[^"]*\bfocus-thread-inspector-meta\b[^"]*"/);
        expect(source).toContain('segments');
        expect(source).toContain('braids');
        expect(source).toContain('endpoints');
    });

    it('action buttons: #btn-thread-pin, #btn-thread-follow, #btn-thread-clear', () => {
        expect(source).toContain('id="btn-thread-pin"');
        expect(source).toContain('class="thread-action primary"');
        expect(source).toContain('id="btn-thread-follow"');
        expect(source).toContain('id="btn-thread-clear"');
        expect(source).toContain('aria-label="Thread actions"');
    });
});
