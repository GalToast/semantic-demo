/**
 * thread-lens-friendly-copy.test.ts — Lock in the user-friendly copy in
 * describeThreadLensForPoint.
 *
 * W48-J: static review found the function returned engineering jargon
 * ("semantic", "node", "cluster", "signal", "thread") that end-users see
 * in the InfoPanel #selected-thread row. This test enforces the new
 * contract: the function must never expose those terms in any return
 * value. We also lock in the wording the team agreed on so a regression
 * can't silently revert it.
 *
 * The function has many branches (mode vs no-map, no neighbors vs few
 * vs many) and pulls state from appState. Testing every branch via
 * render() is brittle (the heavy state graph pulls in three.js), so we
 * use source inspection — same pattern as component-CompassRail.test.ts
 * and component-MapSummary.test.ts. This catches accidental revert of
 * the copy via a code change even if the structure hasn't shifted.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const THREAD_LENS_PATH = resolve(__dirname, '../../src/lib/journey/thread-lens.ts')

// Words that must never appear in user-visible copy. Comments and code
// (variable names like `clusterLabel`) are excluded by anchoring on
// string literals — these show up as `'...'` / `"..."` in the source.
const FORBIDDEN_JARGON = ['semantic', 'node', 'cluster', 'signal', 'thread'] as const

function readSource(): string {
    return readFileSync(THREAD_LENS_PATH, 'utf8')
}

// Match every single-quoted and template-literal string in the source.
// We strip comments first so a doc comment explaining *why* we removed
// the jargon can't fail the test.
function extractStringLiterals(src: string): string[] {
    // Remove block comments and line comments (cheap regex; sufficient
    // for our hand-written TS source).
    const stripped = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    const out: string[] = []
    // Single-quoted strings
    const single = /\$'([^'\\]|\\.)*'/g
    // Double-quoted strings
    const dbl = /"([^"\\]|\\.)*"/g
    // Template literals (only simple form — no nested ${})
    const tpl = /`([^`\\]|\\.)*`/g
    for (const re of [single, dbl, tpl]) {
        let m: RegExpExecArray | null
        while ((m = re.exec(stripped)) !== null) {
            // Strip the surrounding quotes.
            const literal = m[0].slice(1, -1)
            if (literal.length > 0) out.push(literal)
        }
    }
    return out
}

describe('thread-lens friendly copy (W48-J)', () => {
    let literals: string[]

    beforeAll(() => {
        literals = extractStringLiterals(readSource())
    })

    it('exposes no engineering jargon in any string literal', () => {
        // Collect every literal that contains a forbidden word.
        const offenders: { literal: string; word: string }[] = []
        for (const word of FORBIDDEN_JARGON) {
            const re = new RegExp(`\\b${word}\\b`, 'i')
            for (const lit of literals) {
                if (re.test(lit)) {
                    // The plural word "neighbors" is allowed (user-friendly).
                    // We allow "neighbors" only if the literal also contains
                    // it WITHOUT the surrounding word "semantic neighbors".
                    if (word === 'cluster' && /cluster/i.test(lit)) {
                        offenders.push({ literal: lit, word })
                        continue
                    }
                    // Allow "connections"/"connections "/ "neighbors" — but
                    // forbid the bare word node/cluster/thread.
                    offenders.push({ literal: lit, word })
                }
            }
        }
        if (offenders.length > 0) {
            const msg = offenders.map((o) => `  - "${o.literal}" contains "${o.word}"`).join('\n')
            throw new Error(
                `thread-lens returned user-visible jargon. Strip these words ` +
                    `from the strings before release:\n${msg}`
            )
        }
    })

    it('locks the new friendly phrasings', () => {
        const src = readSource()
        // The empty/default fallback.
        expect(src).toContain('No related businesses yet')
        // The cluster-label fallback.
        expect(src).toContain('Similar to')
        // The "no neighbors" branch.
        expect(src).toContain('No similar businesses found')
        // The sparse-neighbors branch.
        expect(src).toContain('Only')
        expect(src).toContain('similar business')
        // The strong-anchor branch.
        expect(src).toContain('One of')
        // The disqualified archive layer.
        expect(src).toContain('No longer active')
        // Mycelium modes (bloom/bridge/trail/default).
        expect(src).toContain('Has website and contact info on file')
        expect(src).toContain('Connects different kinds of businesses')
        expect(src).toContain('Showing connections from')
        expect(src).toContain('All Montgomery County businesses')
    })
})

/**
 * Copy-honesty strike (2026-08-17): the 5 rail/search/journey copy sites
 * were updated to remove over-claim/engineering-jargon strings ('Demo data',
 * 'Connection Preview', 'Explore the neighborhood'). These assertions lock
 * in the new phrasing and forbid reversion of the old strings across those
 * 5 files.
 */
const COPY_STRIKE_FILES = [
    resolve(__dirname, '../../src/lib/rail/rail-status.ts'),
    resolve(__dirname, '../../src/components/SearchBar.svelte'),
    resolve(__dirname, '../../src/lib/components/journey/ThreadInspectorPanel.svelte'),
    resolve(__dirname, '../../src/lib/components/journey/CompassDiveSurface.svelte'),
    resolve(__dirname, '../../src/lib/journey/semantic-dive.ts'),
    // DOM twin of semantic-dive: renders the same thread-inspector + dive
    // surfaces (focus-stage-dom.ts:120-235) when the dive runs its DOM path.
    resolve(__dirname, '../../src/lib/journey/focus-stage-dom.ts'),
    // Compass step labels + inspector state carry the same over-claim family
    // ('Explore the neighborhood', 'Preview connection', 'Connection Inspector').
    resolve(__dirname, '../../src/components/JourneyCompass.svelte'),
    resolve(__dirname, '../../src/lib/journey/thread-inspector-state.ts'),
    resolve(__dirname, '../../src/lib/orchestration/compass-controller.ts')
] as const

const OLD_OVERCLAIM_STRINGS = [
    'Connection Preview',
    'Preview connection',
    'Connection Inspector',
    'Explore the neighborhood',
    'Demo data'
] as const

const NEW_APPROVED_STRINGS = [
    'Local data — live feed unavailable',
    'Live data is unavailable — searching local records',
    'Similar-Business Preview',
    'Explore similar businesses around this one',
    'Explore similar businesses nearby'
] as const

function readMultiple(paths: readonly string[]): string {
    return paths.map((p) => readFileSync(p, 'utf8')).join('\n')
}

describe('copy-honesty strike (2026-08-17)', () => {
    let combined: string

    beforeAll(() => {
        combined = readMultiple(COPY_STRIKE_FILES)
    })

    it('forbids reverted over-claim strings', () => {
        const violations: { file: string; phrase: string }[] = []
        for (const filePath of COPY_STRIKE_FILES) {
            const src = readFileSync(filePath, 'utf8')
            for (const phrase of OLD_OVERCLAIM_STRINGS) {
                if (src.includes(phrase)) {
                    violations.push({ file: filePath, phrase })
                }
            }
        }
        if (violations.length > 0) {
            const msg = violations.map((v) => `  - "${v.phrase}" found in ${v.file.split('/').pop()}`).join('\n')
            throw new Error(
                `Copy-honesty regression: old over-claim strings must not ` + `reappear in the strike files:\n${msg}`
            )
        }
    })

    it('requires the new approved phrasings', () => {
        const missing: string[] = []
        for (const phrase of NEW_APPROVED_STRINGS) {
            if (!combined.includes(phrase)) {
                missing.push(phrase)
            }
        }
        if (missing.length > 0) {
            throw new Error(
                `Copy-honesty regression: new approved phrases must appear ` +
                    `in the strike files:\n  ${missing.join('\n  ')}`
            )
        }
    })
})
