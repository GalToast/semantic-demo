/**
 * main-deep-link-bypass.test.ts — PR-B2: deep-link splash dismissal
 *
 * Verifies parseUrlParams() classifies deep-link URLs correctly so
 * main.ts can dismiss the Splash gesture gate before app-init completes.
 */
import { describe, it, expect } from 'vitest'
import { isDeepLinkParams } from '@lib/orchestration/responsive-renderer'

describe('PR-B2 deep-link detection in parseUrlParams', () => {
    function classify(search: string): { isDeepLink: boolean } {
        return { isDeepLink: isDeepLinkParams(new URLSearchParams(search)) }
    }

    it('classifies ?anchor=519 as deep-link', () => {
        expect(classify('?anchor=519').isDeepLink).toBe(true)
    })

    it('classifies ?record=519 as deep-link (PR-B4)', () => {
        expect(classify('?record=519').isDeepLink).toBe(true)
    })

    it('classifies ?q=coffee as deep-link', () => {
        expect(classify('?q=coffee').isDeepLink).toBe(true)
    })

    it('classifies ?view=map as deep-link (subagent review addition)', () => {
        expect(classify('?view=map').isDeepLink).toBe(true)
    })

    it('classifies non-idle surface share links as deep-links', () => {
        expect(classify('?surface=focus-search').isDeepLink).toBe(true)
        expect(classify('?surface=map-trail&cluster=3').isDeepLink).toBe(true)
    })

    it('classifies ?q=coffee&anchor=519 as deep-link (combined)', () => {
        expect(classify('?q=coffee&anchor=519').isDeepLink).toBe(true)
    })

    it('does NOT classify empty URL as deep-link (splash stays)', () => {
        expect(classify('').isDeepLink).toBe(false)
    })

    it('does NOT classify ?q=a (single char) as deep-link', () => {
        expect(classify('?q=a').isDeepLink).toBe(false)
    })

    it('does NOT classify ?story=foo as deep-link (story prompts fire post-splash)', () => {
        expect(classify('?story=foo').isDeepLink).toBe(false)
    })

    it('does NOT classify ?view=galaxy as deep-link', () => {
        expect(classify('?view=galaxy').isDeepLink).toBe(false)
    })

    it('does NOT classify the default idle surface as deep-link', () => {
        expect(classify('?surface=idle').isDeepLink).toBe(false)
    })

    it('does NOT classify ?demo=force as deep-link (onboarding flag, not a deep link)', () => {
        expect(classify('?demo=force').isDeepLink).toBe(false)
    })

    it('classifies combined deep links (anchor + view + q)', () => {
        expect(classify('?q=roofing&anchor=1&view=map').isDeepLink).toBe(true)
    })

    it('handles ?q with extra whitespace (trim before length check)', () => {
        expect(classify('?q=%20%20coffee%20%20').isDeepLink).toBe(true)
    })
})
