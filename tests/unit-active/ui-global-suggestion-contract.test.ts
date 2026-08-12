import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('ui-global-suggestion-contract', () => {
    beforeEach(() => {
        vi.resetModules()
    })

    it('setupWindowStateBindings runs without throw in jsdom', async () => {
        const { setupWindowStateBindings } = await import('@lib/ui/global-bindings')
        expect(() => setupWindowStateBindings()).not.toThrow()
    })

    it('disposeEventListeners is idempotent no-throw', async () => {
        const { disposeEventListeners } = await import('@lib/ui/global-bindings')
        expect(() => disposeEventListeners()).not.toThrow()
        expect(() => disposeEventListeners()).not.toThrow()
    })

    it('bindSuggestionControls is a no-throw function in jsdom', async () => {
        const { bindSuggestionControls } = await import('@lib/ui/suggestion-bindings')
        expect(typeof bindSuggestionControls).toBe('function')
        expect(() => bindSuggestionControls()).not.toThrow()
    })

    it('disposeSuggestionBindings is a no-throw function in jsdom', async () => {
        const { disposeSuggestionBindings } = await import('@lib/ui/suggestion-bindings')
        expect(typeof disposeSuggestionBindings).toBe('function')
        expect(() => disposeSuggestionBindings()).not.toThrow()
    })

    it('repeated setup/dispose cycles are idempotent no-throw', async () => {
        const globalMod = await import('@lib/ui/global-bindings')
        const suggestionMod = await import('@lib/ui/suggestion-bindings')
        for (let i = 0; i < 3; i++) {
            expect(() => globalMod.setupWindowStateBindings()).not.toThrow()
            expect(() => suggestionMod.bindSuggestionControls()).not.toThrow()
            expect(() => globalMod.disposeEventListeners()).not.toThrow()
            expect(() => suggestionMod.disposeSuggestionBindings()).not.toThrow()
        }
    })
})
