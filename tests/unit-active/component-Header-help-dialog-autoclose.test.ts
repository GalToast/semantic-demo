/**
 * @component-Header-help-dialog-autoclose.test.ts
 *
 * W49-I: Help dialog must auto-close when the user wants to interact with
 * the search surface. The dialog's showModal() backdrop blocks pointer
 * events + .focus() calls, stranding the user.
 *
 * Header.svelte registers document-level capture-phase listeners for
 * focusin (focus into search bar), keydown (/, char keys, Backspace,
 * Delete), and pointerdown (any click outside the dialog). All three
 * call closeHelpDialog when the dialog is open.
 *
 * Real coverage is the integration test (a11y-baseline.spec.js
 * `search-mode` state, which previously timed out). This unit test pins
 * the listener wiring so a future refactor can't silently remove it.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function readHeader(): string {
    // Read inside a function so vitest's per-test execution refreshes the
    // source if a watch-mode rebuild produced a new version.
    return readFileSync(
        resolve(__dirname, '../../src/components/Header.svelte'),
        'utf-8'
    );
}

describe('W49-I: Help dialog auto-close listeners', () => {
    it('registers focusin + keydown + pointerdown capture listeners that all call closeHelpDialog', () => {
        const src = readHeader();
        const listeners = {
            focusin: /document\.addEventListener\(\s*['"]focusin['"]\s*,\s*handleSearchSurfaceFocus\s*,\s*true\s*\)/.test(
                src
            ),
            keydown: /document\.addEventListener\(\s*['"]keydown['"]\s*,\s*handleSearchSurfaceKeydown\s*,\s*true\s*\)/.test(
                src
            ),
            pointerdown: /document\.addEventListener\(\s*['"]pointerdown['"]\s*,\s*handleSearchSurfacePointerdown\s*,\s*true\s*\)/.test(
                src
            ),
        };

        // Each handler must guard on helpDialog?.open (no-op when closed).
        // Counted globally so a future drop is the only way this number changes.
        const guardRegex = /if\s*\(\s*!helpDialog\?\.open\s*\)\s*return/g;
        const guardsTotal = (src.match(guardRegex) ?? []).length;

        // Cleanup on unmount removes all three (no listener leaks across HMR).
        const cleanup = {
            focusin: /removeEventListener\(\s*['"]focusin['"]/.test(src),
            keydown: /removeEventListener\(\s*['"]keydown['"]/.test(src),
            pointerdown: /removeEventListener\(\s*['"]pointerdown['"]/.test(src),
        };

        expect(listeners).toEqual({
            focusin: true,
            keydown: true,
            pointerdown: true,
        });
        expect(guardsTotal).toBe(3);
        expect(cleanup).toEqual({
            focusin: true,
            keydown: true,
            pointerdown: true,
        });
    });

    it('preserves the existing Escape handler on the dialog (no overwrite)', () => {
        // Regression guard: the document-level keydown listener must NOT
        // have removed the dialog's own Escape handler, which is what
        // explicit dismissal relies on.
        const escapeHandler = /onkeydown=\{[^}]*e\.key\s*===\s*['"]Escape['"][^}]*closeHelpDialog/.test(
            readHeader()
        );
        expect(escapeHandler, 'Escape → closeHelpDialog handler still required').toBe(true);
    });
});
