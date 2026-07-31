/**
 * splash-style-aaa.test.ts — Static contract test for Splash.svelte styles
 *
 * jsdom lacks a layout engine, so component tests cannot assert computed
 * element sizes. This file reads the component source and verifies the
 * style block declares WCAG AAA 2.5.5 minimum heights (>=44px) for the
 * interactive targets inside the welcome modal.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const SRC = resolve(__dirname, '../../src/components/Splash.svelte')

describe('Splash.svelte style block — WCAG AAA touch targets', () => {
    it('declares 44px min-height for .splash-submit', () => {
        const source = readFileSync(SRC, 'utf-8')
        const styleMatch = source.match(/<style[^>]*>([\s\S]*?)<\/style>/i)
        expect(styleMatch).toBeTruthy()
        const styleBlock = styleMatch![1]
        const rule = styleBlock.match(/\.splash-submit\s*\{[^}]*min-height:\s*(?:4[4-9]|[5-9]\d)px[^}]*\}/s)
        expect(rule).toBeTruthy()
    })

    it('declares 44px min-height for .splash-cta', () => {
        const source = readFileSync(SRC, 'utf-8')
        const styleMatch = source.match(/<style[^>]*>([\s\S]*?)<\/style>/i)
        expect(styleMatch).toBeTruthy()
        const styleBlock = styleMatch![1]
        const rule = styleBlock.match(/\.splash-cta\s*\{[^}]*min-height:\s*(?:4[4-9]|[5-9]\d)px[^}]*\}/s)
        expect(rule).toBeTruthy()
    })

    it('keeps .splash-search-input at 44px min-height', () => {
        const source = readFileSync(SRC, 'utf-8')
        const styleMatch = source.match(/<style[^>]*>([\s\S]*?)<\/style>/i)
        expect(styleMatch).toBeTruthy()
        const styleBlock = styleMatch![1]
        const rule = styleBlock.match(/\.splash-search-input\s*\{[^}]*min-height:\s*(?:4[4-9]|[5-9]\d)px[^}]*\}/s)
        expect(rule).toBeTruthy()
    })
})
