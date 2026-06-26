import { describe, it, expect } from 'vitest';

/**
 * @vitest-environment jsdom
 *
 * Constants & pure helpers contract tests — Phase 6c extension (2026-06-26)
 *
 * These 3 files (camera.svelte.ts, url-state.ts, parity-attrs.svelte.ts) are
 * all heavily state-coupled (10+ store dependencies each). Most of their
 * public API requires Svelte runtime / appState mocking. This file covers
 * the small subset that IS testable in isolation:
 *
 *   - url-state.ts: getRequestedUrlDepth (promoted to exported for testing)
 *     — parses + clamps a `depth` URL param to [0, 2]
 *
 *   - camera.svelte.ts: CAMERA_CONFIG, OVERVIEW_CAMERA_POSE
 *     — shape validation only (constants should have all expected fields
 *     with sensible types; values are tuned for W46 visual identity and
 *     should not be asserted verbatim)
 *
 *   - parity-attrs.svelte.ts: PARITY_ATTRIBUTES, PARITY_ATTRIBUTE_KEYS
 *     — manifest shape + uniqueness + key-set consistency
 */
import { getRequestedUrlDepth } from '@lib/orchestration/url-state';
import { CAMERA_CONFIG, OVERVIEW_CAMERA_POSE } from '@lib/stores/camera.svelte';
import {
    PARITY_ATTRIBUTES,
    PARITY_ATTRIBUTE_KEYS
} from '@lib/orchestration/parity-attrs.svelte';

describe('camera/url-state/parity-attrs constants — Phase 6c extension', () => {
    // ── getRequestedUrlDepth (url-state.ts) ────────────────────────────────

    describe('getRequestedUrlDepth', () => {
        it('returns 0 when no depth param is present', () => {
            const params = new URLSearchParams('');
            expect(getRequestedUrlDepth(params)).toBe(0);
        });

        it('returns the parsed depth for valid integers', () => {
            expect(getRequestedUrlDepth(new URLSearchParams('depth=1'))).toBe(1);
            expect(getRequestedUrlDepth(new URLSearchParams('depth=2'))).toBe(2);
        });

        it('clamps negative values to 0', () => {
            expect(getRequestedUrlDepth(new URLSearchParams('depth=-5'))).toBe(0);
        });

        it('clamps values > 2 to 2', () => {
            expect(getRequestedUrlDepth(new URLSearchParams('depth=5'))).toBe(2);
            expect(getRequestedUrlDepth(new URLSearchParams('depth=999'))).toBe(2);
        });

        it('returns 0 for non-numeric depth', () => {
            expect(getRequestedUrlDepth(new URLSearchParams('depth=abc'))).toBe(0);
        });

        it('returns 0 for empty depth value', () => {
            // URLSearchParams('depth=') returns '' which Number('') is 0
            expect(getRequestedUrlDepth(new URLSearchParams('depth='))).toBe(0);
        });

        it('handles decimal values (clamped, not rounded)', () => {
            // 1.5 is in [0, 2], so it passes through as-is
            expect(getRequestedUrlDepth(new URLSearchParams('depth=1.5'))).toBe(1.5);
            // 0.4 is in [0, 2]
            expect(getRequestedUrlDepth(new URLSearchParams('depth=0.4'))).toBe(0.4);
        });

        it('ignores other params (only reads `depth`)', () => {
            const params = new URLSearchParams('other=5&depth=1');
            expect(getRequestedUrlDepth(params)).toBe(1);
        });
    });

    // ── CAMERA_CONFIG (camera.svelte.ts) ───────────────────────────────────

    describe('CAMERA_CONFIG', () => {
        it('exposes all expected timing constants', () => {
            expect(CAMERA_CONFIG.AUTO_ROTATE_BASE_SPEED).toBeTypeOf('number');
            expect(CAMERA_CONFIG.AUTO_ROTATE_IDLE_MS).toBeTypeOf('number');
            expect(CAMERA_CONFIG.AUTO_ROTATE_MANUAL_IDLE_MS).toBeTypeOf('number');
            expect(CAMERA_CONFIG.AUTO_ROTATE_SOFT_RESUME_MS).toBeTypeOf('number');
        });

        it('exposes all expected orbit-distance constants', () => {
            expect(CAMERA_CONFIG.ORBIT_MIN_DISTANCE_DEFAULT).toBeTypeOf('number');
            expect(CAMERA_CONFIG.ORBIT_MIN_DISTANCE_INSIDE).toBeTypeOf('number');
            expect(CAMERA_CONFIG.ORBIT_MAX_DISTANCE_DEFAULT).toBeTypeOf('number');
            expect(CAMERA_CONFIG.ORBIT_MAX_DISTANCE_FREE).toBeTypeOf('number');
        });

        it('exposes all expected orbit-speed constants', () => {
            expect(CAMERA_CONFIG.ORBIT_ROTATE_SPEED_DEFAULT).toBeTypeOf('number');
            expect(CAMERA_CONFIG.ORBIT_ROTATE_SPEED_FREE).toBeTypeOf('number');
            expect(CAMERA_CONFIG.ORBIT_PAN_SPEED_DEFAULT).toBeTypeOf('number');
            expect(CAMERA_CONFIG.ORBIT_PAN_SPEED_FREE).toBeTypeOf('number');
        });

        it('exposes timing constants for search/mobile', () => {
            expect(CAMERA_CONFIG.SELECTED_CARD_FADE_MS).toBeTypeOf('number');
            expect(CAMERA_CONFIG.MOBILE_ROUTE_FIELD_PEEK_MS).toBeTypeOf('number');
            expect(CAMERA_CONFIG.SEARCH_TRAIL_CUE_MIN_DWELL_MS).toBeTypeOf('number');
        });

        it('all constants are positive numbers', () => {
            for (const [key, value] of Object.entries(CAMERA_CONFIG)) {
                expect(value, `${key} should be positive`).toBeGreaterThan(0);
            }
        });

        it('FREE orbit speed is greater than DEFAULT orbit speed', () => {
            // Sanity: free mode should allow faster camera motion
            expect(CAMERA_CONFIG.ORBIT_ROTATE_SPEED_FREE).toBeGreaterThan(
                CAMERA_CONFIG.ORBIT_ROTATE_SPEED_DEFAULT
            );
            expect(CAMERA_CONFIG.ORBIT_PAN_SPEED_FREE).toBeGreaterThan(
                CAMERA_CONFIG.ORBIT_PAN_SPEED_DEFAULT
            );
        });
    });

    // ── OVERVIEW_CAMERA_POSE (camera.svelte.ts) ───────────────────────────

    describe('OVERVIEW_CAMERA_POSE', () => {
        it('has position and target tuples of length 3', () => {
            expect(OVERVIEW_CAMERA_POSE.position).toHaveLength(3);
            expect(OVERVIEW_CAMERA_POSE.target).toHaveLength(3);
        });

        it('has all-numeric position and target values', () => {
            for (const v of OVERVIEW_CAMERA_POSE.position) {
                expect(v).toBeTypeOf('number');
                expect(Number.isFinite(v)).toBe(true);
            }
            for (const v of OVERVIEW_CAMERA_POSE.target) {
                expect(v).toBeTypeOf('number');
                expect(Number.isFinite(v)).toBe(true);
            }
        });

        it('positions camera at a non-zero distance from origin (overview is not embedded in scene)', () => {
            const distance = Math.hypot(...OVERVIEW_CAMERA_POSE.position);
            expect(distance).toBeGreaterThan(0.1);
        });
    });

    // ── PARITY_ATTRIBUTES (parity-attrs.svelte.ts) ────────────────────────

    describe('PARITY_ATTRIBUTES manifest', () => {
        it('manifest is non-empty', () => {
            expect(PARITY_ATTRIBUTES.length).toBeGreaterThan(0);
        });

        it('every descriptor has key, description, source', () => {
            for (const attr of PARITY_ATTRIBUTES) {
                expect(typeof attr.key).toBe('string');
                expect(attr.key.length).toBeGreaterThan(0);
                expect(typeof attr.description).toBe('string');
                expect(attr.description.length).toBeGreaterThan(0);
                expect(typeof attr.source).toBe('string');
                expect(attr.source.length).toBeGreaterThan(0);
            }
        });

        it('keys are unique (no duplicate body data-attrs)', () => {
            const keys = PARITY_ATTRIBUTES.map((a) => a.key);
            expect(new Set(keys).size).toBe(keys.length);
        });

        it('keys are valid DOM data-attr suffixes (kebab-case, no spaces)', () => {
            for (const attr of PARITY_ATTRIBUTES) {
                expect(attr.key, `${attr.key} should be kebab-case`).toMatch(/^[a-z][a-zA-Z0-9]*$/);
            }
        });

        it('PARITY_ATTRIBUTE_KEYS set has same size as manifest', () => {
            expect(PARITY_ATTRIBUTE_KEYS.size).toBe(PARITY_ATTRIBUTES.length);
        });

        it('PARITY_ATTRIBUTE_KEYS contains every manifest key', () => {
            for (const attr of PARITY_ATTRIBUTES) {
                expect(PARITY_ATTRIBUTE_KEYS.has(attr.key)).toBe(true);
            }
        });

        it('covers expected journey/compass attribute keys (sanity for CSS hooks)', () => {
            // These keys are read by the legacy CSS in src/css/. If they
            // are renamed, the visual chrome breaks. Document them.
            const expectedKeys = [
                'journeyCompass',
                'journeyCompassPhase',
                'navMode',
                'navSurface'
            ];
            for (const key of expectedKeys) {
                expect(PARITY_ATTRIBUTE_KEYS.has(key), `${key} missing from manifest`).toBe(true);
            }
        });
    });
});