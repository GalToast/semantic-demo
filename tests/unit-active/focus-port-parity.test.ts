/**
 * focus-port-parity.test.ts
 *
 * W11-T7 parity regression coverage.
 *
 * The 3 newly ported focus subsystem files in src/lib/focus/ (anchor-indicator,
 * stage-dom, stage-renderer) must behave functionally identically to their
 * legacy siblings in js/modules/. The implementations may differ in plumbing
 * (e.g., the new port pulls state from the Svelte 5 state class instead of
 * the legacy Proxy), but the public behavior must match so the W11 bridge
 * migration stays safe.
 *
 * This test asserts parity for the trivia-filtering surface of
 * stage-renderer.ts — the cleanest parity target since the inputs are pure
 * values with no Three.js or DOM dependencies. The DOM-coupled surfaces
 * (anchor-indicator, stage-dom) and the rest of stage-renderer
 * (syncSelectedCardContentVariant, etc.) are covered by the engine-kernel
 * tests in tests/unit/.
 *
 * Active vitest suite (tests/unit-active/).
 */

import { describe, it, expect } from 'vitest';
import * as legacy from '../../src/lib/journey/focus-stage-renderer.ts';
import * as port from '../../src/lib/focus/stage-renderer.ts';

const SAMPLE_TRIVIA: ReadonlyArray<readonly [string, string]> = [
    ['Pending research.', 'TRIVIA_BLOCKLIST.exact match'],
    ['Has both email and phone.', 'TRIVIA_BLOCKLIST.equals match'],
    ['Family-owned nursery known locally for native plants.', 'keep'],
    ['no useful public info available', 'TRIVIA_BLOCKLIST.prefixes match'],
    ['Verified phone from FMCSA carrier records', 'TRIVIA_BLOCKLIST.substrings match'],
    ['', 'empty string'],
    ['has both email and phone.', 'case-sensitive equals (lowercase)']
] as const;

const SAMPLE_POINTS: ReadonlyArray<{ readonly label: string; readonly point: unknown }> = [
    { label: 'null', point: null },
    { label: 'trivia in exact blocklist', point: { trivia: 'Pending research.' } },
    { label: 'trivia in equals blocklist', point: { trivia: 'Has both email and phone.' } },
    { label: 'useful public trivia', point: { trivia: 'Family-owned nursery known locally for native plants.' } },
    { label: 'trivia with negative prefix', point: { trivia: 'no useful public info available' } },
    { label: 'trivia with internal substring', point: { trivia: 'Verified phone from FMCSA carrier records' } },
    { label: 'point with email + phone only', point: { email: 'a@b.com', phone: '555-1234' } },
    { label: 'point with website only', point: { website: 'https://example.com' } },
    { label: 'point with everything', point: { email: 'a@b.com', phone: '555-1234', website: 'https://example.com', trivia: 'Family-owned nursery.' } },
    { label: 'empty point', point: {} }
];

describe('focus stage renderer port parity (W11-T7)', () => {
    it('legacy and port both expose the trivia surface', () => {
        expect(legacy.TRIVIA_BLOCKLIST).toBeDefined();
        expect(legacy.rejectsTrivia).toBeTypeOf('function');
        expect(legacy.getInterestingBusinessNote).toBeTypeOf('function');
        expect(port.TRIVIA_BLOCKLIST).toBeDefined();
        expect(port.rejectsTrivia).toBeTypeOf('function');
        expect(port.getInterestingBusinessNote).toBeTypeOf('function');
    });

    it('TRIVIA_BLOCKLIST has the same top-level key set', () => {
        const legacyKeys = Object.keys(legacy.TRIVIA_BLOCKLIST).sort();
        const portKeys = Object.keys(port.TRIVIA_BLOCKLIST).sort();
        expect(portKeys).toEqual(legacyKeys);
    });

    it('TRIVIA_BLOCKLIST exact + equals arrays match the legacy', () => {
        expect(port.TRIVIA_BLOCKLIST.exact).toEqual(legacy.TRIVIA_BLOCKLIST.exact);
        expect(port.TRIVIA_BLOCKLIST.equals).toEqual(legacy.TRIVIA_BLOCKLIST.equals);
    });

    it('TRIVIA_BLOCKLIST prefixes + substrings + minLength match the legacy', () => {
        expect(port.TRIVIA_BLOCKLIST.prefixes).toEqual(legacy.TRIVIA_BLOCKLIST.prefixes);
        expect(port.TRIVIA_BLOCKLIST.substrings).toEqual(legacy.TRIVIA_BLOCKLIST.substrings);
        expect(port.TRIVIA_BLOCKLIST.minLength).toBe(legacy.TRIVIA_BLOCKLIST.minLength);
    });

    describe('rejectsTrivia() agrees with legacy on canonical samples', () => {
        for (const [trivia, label] of SAMPLE_TRIVIA) {
            it(`agrees on ${label}`, () => {
                expect(port.rejectsTrivia(trivia)).toBe(legacy.rejectsTrivia(trivia));
            });
        }
    });

    describe('getInterestingBusinessNote() agrees with legacy on canonical points', () => {
        for (const { label, point } of SAMPLE_POINTS) {
            it(`agrees on ${label}`, () => {
                const legacyResult = legacy.getInterestingBusinessNote(point as any);
                const portResult = port.getInterestingBusinessNote(point as any);
                expect(portResult).toBe(legacyResult);
            });
        }
    });

    describe('legacy public exports are a superset of port exports', () => {
        // Catches accidental deletions in the port. Other direction (legacy
        // having extras) is the BOTH pattern; we expect the two to converge.
        const PARITY_FUNCTIONS = [
            'rejectsTrivia',
            'getInterestingBusinessNote',
            'TRIVIA_BLOCKLIST',
            'syncSelectedCardContentVariant',
            'updateSelectedCardHeading',
            'triggerSelectedCardFade',
            'buildSelectedMatchNarrative',
            'renderSignalBadges',
            'renderSelectedMetaStrip',
            'renderSelectedMatchPanel',
            'renderSelectedActionRow'
        ];

        for (const name of PARITY_FUNCTIONS) {
            it(`both legacy and port export ${name}`, () => {
                expect(legacy).toHaveProperty(name);
                expect(port).toHaveProperty(name);
            });
        }
    });
});
