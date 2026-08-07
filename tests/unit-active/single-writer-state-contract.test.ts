/**
 * single-writer-state-contract.test.ts — enforce the single-writer discipline
 * on appState top-level fields.
 *
 * WHY (2026-08-07): 8 of ~26 bugs fixed this session were the same class —
 * appState fields written from 2+ modules that drift (filter mirror,
 * currentPersonality type, seededUnit x3, searchSummary zombie, emptyQuery
 * twin, pointsMaterial mirror, resetFocus/camera aliasing). The nav drift
 * tracer only covers NAV_DRIFT_KEYS; everything else drifts silently.
 *
 * WHAT IT CHECKS: every top-level `appState.<field> =` write is grouped by
 * field. A field with 3+ WRITER FILES is a contract violation (sprawl).
 * Fields with 2 writers are ALLOWED when they are the documented patterns:
 *   - the owning store/funnel + a boot/reset path
 *   - a state mirror deliberately pinned by contract tests (Tier-D engine
 *     boundary: pointsMesh/pointsMaterial/nodeSporeMesh/nodeSporeMaterial)
 *   - a store that mirrors into appState (navigation-state funnel, camera
 *     store) + the module that owns the semantic value
 *
 * This is a static-source scan (regex), same family as the window-global
 * allowlist contract. False-positive guard: re-check the ALLOWED_2_WRITERS
 * set when a test fails — do NOT widen the limit to 4+ blindly.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import { resolve, join, relative } from 'path'

const ROOT = resolve(__dirname, '../..')
const SRC = join(ROOT, 'src')

// Fields with exactly 2 writer files that are KNOWN-INTENTIONAL:
// <field>: '<reason>' — add here only with a concrete reason + evidence.
const ALLOWED_2_WRITERS: Record<string, string> = {
    points: 'data-store owns the canonical set; main.ts boot-wires it once',
    pointsMesh: 'Tier-D engine-boundary mirror (lifecycle null + mycelium port) — contract-pinned',
    pointsMaterial: 'Tier-D engine-boundary mirror — contract-pinned (state-three-handles tests)',
    nodeSporeMesh: 'Tier-D engine-boundary mirror — contract-pinned',
    nodeSporeMaterial: 'Tier-D engine-boundary mirror — contract-pinned',
    searchResults: 'results-ui renders + store.setSearchResults canonical writer',
    weatherState: 'weather.ts owns; main.ts init once',
    activeClusterFilter: 'filter store normalizes; cluster-filter-controller toggles (complementary)',
    semanticDiveMode: 'compass-controller entry (true) + url-state returnToOverview reset (false)',
    focusedNode: 'thread-settler owns; url-state/main boot-reset',
    hoverHighlightIndex: 'canvas-hover owns; cursor.ts mirror',
    autoRotateSuspended: 'camera-controls-restore owns; camera store mirrors',
    focusCameraAssistActive: 'camera-controls-core owns; demo-choreography toggles',
    canvasThreadInspectionClearTimer: 'thread-inspector-state owns; renderer clears',
    _semanticDiveTransitionDeadline: 'compass-controller arms; parity-context reads (single writer arms)',
}

// Fields with 3+ writers = CONTRACT VIOLATION (sprawl). Currently known:
// currentView (nav funnel x3 + MapView direct), focusCameraOffset (focus +
// controls-core), autoRotate (restore + focus-pocket), focusedNode (settler +
// url/main), trailDepth (settler + compass + nav funnel), points (data-store +
// main) is 2, weatherState 2. The 3+ set is the "needs refactor" backlog.
const KNOWN_3PLUS_SPRAWL: Record<string, string> = {
    currentView: 'nav funnel x3 + MapView direct-write — MapView should route through the funnel',
    autoRotate: 'camera-controls-restore owns + focus-pocket direct-writes appState (should use camera store)',
    trailDepth: 'thread-settler + compass-controller direct + nav funnel — sprawl',
    focusCameraOffset: 'focus.ts + camera-controls-core — should share the camera store',
    focusedNode: 'thread-settler owns + url-state/main reset — settle on ONE owner module',
}

function walk(dir: string): string[] {
    const out: string[] = []
    for (const entry of readdirSync(dir)) {
        const p = join(dir, entry)
        if (statSync(p).isDirectory()) {
            if (entry !== 'node_modules' && entry !== 'dist') out.push(...walk(p))
        } else if (/\.(ts|svelte|js|mjs)$/.test(entry)) {
            out.push(p)
        }
    }
    return out
}

describe('single-writer state contract', () => {
    let writers: Map<string, Set<string>>

    beforeAll(() => {
        writers = new Map()
        const writeRe = /appState\.([A-Za-z_$][\w$]*)\s*=(?!=)/g
        for (const file of walk(SRC)) {
            const rel = relative(ROOT, file).replace(/\\/g, '/')
            const src = readFileSync(file, 'utf8')
            writeRe.lastIndex = 0
            let m
            while ((m = writeRe.exec(src)) !== null) {
                // Skip matches inside comments: `//` line comments, `/*` or
                // ` * ` block-comment lines (e.g. doc text "appState.X = Y").
                const lineStart = src.lastIndexOf('\n', m.index) + 1
                const beforeOnLine = src.slice(lineStart, m.index)
                const line = src.slice(lineStart, src.indexOf('\n', m.index) >= 0 ? src.indexOf('\n', m.index) : undefined)
                if (
                    beforeOnLine.includes('//') ||
                    line.trimStart().startsWith('*') ||
                    line.trimStart().startsWith('/*')
                ) continue
                const field = m[1]
                if (!writers.has(field)) writers.set(field, new Set())
                writers.get(field)!.add(rel)
            }
        }
    })

    it('no appState field is written from 4+ files (unchecked sprawl)', () => {
        const bad = [...writers.entries()]
            .filter(([, files]) => files.size >= 4)
            .map(([f, files]) => `${f} (${files.size}: ${[...files].join(', ')})`)
        expect(bad, `fields with 4+ writers:\n${bad.join('\n')}`).toEqual([])
    })

    it('3+ writer fields are only the known sprawl backlog (documented, not silent)', () => {
        const threePlus = [...writers.entries()]
            .filter(([, files]) => files.size >= 3)
            .map(([f]) => f)
            .sort()
        const known = Object.keys(KNOWN_3PLUS_SPRAWL).sort()
        expect(threePlus).toEqual(known)
    })

    it('2-writer fields are only the documented-intentional set', () => {
        const twoWriters = [...writers.entries()]
            .filter(([, files]) => files.size === 2)
            .map(([f]) => f)
            .filter((f) => !ALLOWED_2_WRITERS[f])
            .sort()
        expect(twoWriters, `2-writer fields NOT in the allowlist:\n${twoWriters.join('\n')}`).toEqual([])
    })
})