import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Centralized friendly-copy regression guard for the highest-exposure copy
// surfaces that were cleaned in the W48-J follow-up sweep.
const FILES = [
    '../../src/lib/journey/canvas-keyboard-nav.ts',
    '../../src/lib/journey/focus-ui.ts',
    '../../src/lib/journey/semantic-guide.ts',
    '../../src/lib/journey/search-trail-cue-renderer.ts',
    '../../src/lib/ui/cluster-labels.ts',
    '../../src/lib/ui/ui-feedback.ts',
    '../../src/lib/ui/loading.ts',
    '../../src/components/FocusCard.svelte',
    '../../src/components/Legend.svelte',
    '../../src/components/LoadingOverlay.svelte',
    '../../src/components/Placeholder2D.svelte',
    '../../src/components/MapSummary.svelte',
    '../../src/components/SearchTrailCue.svelte',
    '../../src/components/TrailControls.svelte',
    '../../src/components/WalkBreadcrumb.svelte',
    '../../src/components/JourneyCompass.svelte',
    '../../src/lib/orchestration/compass-controller.ts',
].map((p) => resolve(__dirname, p))

const FORBIDDEN = ['semantic', 'mycelium', 'signal']

// Literal values that contain a forbidden word but are NOT user-visible copy:
// internal state values, CSS ids, import paths, comments, or product brand.
const EXCLUDE_LITERALS = new Set([
    'semantic neighbor',
    'semantic-dive',
    'semantic',
    '@lib/journey/semantic-guide-payload',
    '@lib/engine/semantic-threads',
    'mycelium',
    'Semantic Explorer',
    '[Loading] deferred semantic threads load failed:',
    '[Loading] deferred mycelium creation failed:',
    'The Semantic Explorer is offline or blocked right now. Refresh after the connection recovers.',
    'obscure SIGNAL indicator',
    'Follow the trail back to its source…',
])

function readAll(): string {
    return FILES.map((p) => readFileSync(p, 'utf8')).join('\n')
}

function stripComments(src: string): string {
    return src
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '')
}

function* extractLiterals(src: string): Generator<string> {
    // Capture single, double, and template string literals.
    const re = /(['"`])(?:\\.|(?!\1).)*\1/gs
    let m
    while ((m = re.exec(src)) !== null) {
        const quote = m[1]
        const inner = m[0].slice(1, -1)
        if (EXCLUDE_LITERALS.has(inner)) continue
        // For template literals, strip embedded expressions so we only test the
        // rendered text (conditions/internal-state values like 'semantic' are
        // excluded, but real copy between expressions is still checked).
        const rendered = quote === '\`'
            ? inner.replace(/\$\{[^}]*\}/g, '')
            : inner
        yield rendered
    }
}

describe('friendly-copy regression guard (journey + chrome surfaces)', () => {
    const src = readAll()
    const stripped = stripComments(src)

    it('does not expose forbidden jargon in user-facing string literals', () => {
        const offenders: { file?: string; literal: string; word: string }[] = []
        for (let i = 0; i < FILES.length; i++) {
            const fileSrc = readFileSync(FILES[i]!, 'utf8')
            const fileStripped = stripComments(fileSrc)
            for (const literal of extractLiterals(fileStripped)) {
                for (const word of FORBIDDEN) {
                    if (new RegExp(`\\b${word}\\b`, 'i').test(literal)) {
                        offenders.push({ file: FILES[i], literal, word })
                    }
                }
            }
        }
        expect(offenders).toEqual([])
    })

    it('locks the new friendly phrasings', () => {
        expect(stripped).toContain('End of this group')
        expect(stripped).toContain('business in')
        expect(stripped).toContain('Category')
        expect(stripped).toContain('businesses match')
        expect(stripped).toContain('Starting point')
        expect(stripped).toContain('Side stop')
        expect(stripped).toContain('strongest match')
        expect(stripped).toContain('See more')
        expect(stripped).toContain('Connections are live.')
        expect(stripped).toContain('Business status')
        expect(stripped).toContain('Business view')
        expect(stripped).toContain('No map location yet')
        expect(stripped).toContain('Mobile preview')
        expect(stripped).toContain('Open full 3D experience')
        expect(stripped).toContain('Journey path')
        expect(stripped).toContain('Journey stops')
        expect(stripped).toContain('Walk controls')
        expect(stripped).toContain('Show walk')
        expect(stripped).toContain('Walk history')
        expect(stripped).toContain('Walk stops')
        expect(stripped).toContain('Map route')
    })
})
