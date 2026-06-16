import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as environment from '../../src/lib/utils/environment';

describe('environment', () => {
    let originalInnerWidth;
    let originalInnerHeight;
    let originalMatchMedia;
    let originalDevicePixelRatio;

    beforeEach(() => {
        originalInnerWidth = window.innerWidth;
        originalInnerHeight = window.innerHeight;
        originalMatchMedia = window.matchMedia;
        originalDevicePixelRatio = window.devicePixelRatio;
    });

    afterEach(() => {
        window.innerWidth = originalInnerWidth;
        window.innerHeight = originalInnerHeight;
        window.matchMedia = originalMatchMedia;
        window.devicePixelRatio = originalDevicePixelRatio;
    });

    it('getViewportSize returns innerWidth and innerHeight', () => {
        window.innerWidth = 800;
        window.innerHeight = 600;
        expect(environment.getViewportSize()).toEqual({ width: 800, height: 600 });
    });

    it('isMobileViewport returns true for width <= 768', () => {
        window.innerWidth = 768;
        expect(environment.isMobileViewport()).toBe(true);
        expect(environment.isMobile()).toBe(true);

        window.innerWidth = 769;
        expect(environment.isMobileViewport()).toBe(false);
    });

    it('isCompactFocusStage returns true for width <= 768', () => {
        window.innerWidth = 768;
        expect(environment.isCompactFocusStage()).toBe(true);
    });

    it('prefersReducedMotion checks matchMedia', () => {
        window.matchMedia = vi.fn().mockImplementation(query => ({
            matches: query === '(prefers-reduced-motion: reduce)'
        }));
        expect(environment.prefersReducedMotion()).toBe(true);

        window.matchMedia = vi.fn().mockImplementation(() => ({ matches: false }));
        expect(environment.prefersReducedMotion()).toBe(false);
    });

    it('hasCoarsePointer checks matchMedia', () => {
        window.matchMedia = vi.fn().mockImplementation(query => ({
            matches: query === '(pointer: coarse)'
        }));
        expect(environment.hasCoarsePointer()).toBe(true);
    });

    it('isCompactLandscape checks dimensions', () => {
        window.innerWidth = 768;
        window.innerHeight = 740;
        expect(environment.isCompactLandscape()).toBe(true);

        window.innerHeight = 741;
        expect(environment.isCompactLandscape()).toBe(false);
    });

    it('isUltraCompactPortrait checks dimensions', () => {
        window.innerWidth = 430;
        window.innerHeight = 800;
        expect(environment.isUltraCompactPortrait()).toBe(true);

        window.innerWidth = 431;
        expect(environment.isUltraCompactPortrait()).toBe(false);
    });

    it('getDevicePixelRatio returns devicePixelRatio', () => {
        window.devicePixelRatio = 2;
        expect(environment.getDevicePixelRatio()).toBe(2);
    });
});
