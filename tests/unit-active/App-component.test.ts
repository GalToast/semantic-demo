/**
 * @vitest-environment node
 *
 * STRUCTURAL coverage for src/App.svelte — the 718-LOC composition root.
 *
 * This test does NOT render the Svelte component. It parses the source file
 * as text and locks in the document surface so that refactors which drop a
 * lazy import, orphan a parity key, or silently disconnect the scene-ready
 * wiring fail CI before they reach main.
 *
 * Categories:
 *   (A) Lazy component surface — every createLazyComponent import resolves
 *       to an existing src/components/*.svelte file.
 *   (B) $derived parity plumbing — every $derived(parityMap.|getBypassAttr()
 *       read references a documented key in parity-attrs.svelte.ts.
 *   (C) Scene-ready wiring — signalSceneReady / signalSceneError are called
 *       from the onSceneReady / onSceneError handlers (the bug fixed in
 *       commit 107935d2).
 *   (D) Composition root shape — the 9 key child components appear in the
 *       template.
 *   (E) No dead imports — every relative / @components / @lib import
 *       resolves to a real file on disk.
 *   (F) Svelte 5 rune count — at least 30 $derived / $effect / $state uses.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const REPO_ROOT = resolve(__dirname, '..', '..')
const SRC_DIR = resolve(REPO_ROOT, 'src')

const appSrc = readFileSync(resolve(SRC_DIR, 'App.svelte'), 'utf8')
const paritySrc = readFileSync(resolve(SRC_DIR, 'lib', 'orchestration', 'parity-attrs.svelte.ts'), 'utf8')
// After useParityAttrs extraction, parity attribute reads live in the
// composable, not in App.svelte. The drift guard now scans the composable
// source so a new parity attribute added to PARITY_ATTRIBUTES still has
// to be referenced (either in the composable or in another parity consumer).
const parityAttrsSrc = readFileSync(resolve(SRC_DIR, 'lib', 'ui', 'use-parity-attrs.svelte.ts'), 'utf8')

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Lines that match a regex, returned as { line, text } for diagnostics. */
function matchingLines(src: string, re: RegExp): string[] {
    return src
        .split('\n')
        .filter((l) => re.test(l))
        .map((l) => l.trim())
}

// ---------------------------------------------------------------------------
// (A) Lazy component surface
// ---------------------------------------------------------------------------

describe('App.svelte — lazy component surface', () => {
    it('every createLazyComponent import resolves to an existing src/components/*.svelte', () => {
        const lazyRe =
            /createLazyComponent\s*\(\s*\(\s*\)\s*=>\s*import\(\s*['"]@components\/([A-Za-z0-9_-]+)\.svelte['"]/g
        const names: string[] = []
        let m: RegExpExecArray | null
        while ((m = lazyRe.exec(appSrc)) !== null) {
            names.push(m[1])
        }
        // At least the documented lazy handles must exist (currently 6).
        expect(names.length).toBeGreaterThanOrEqual(6)

        const missing = names.filter((n) => {
            const p = resolve(SRC_DIR, 'components', `${n}.svelte`)
            return !existsSync(p)
        })
        expect(missing, `missing component files: ${missing.join(', ')}`).toEqual([])
    })

    it('declares exactly the expected lazy component handles (no silent additions/removals)', () => {
        const lazyRe =
            /createLazyComponent\s*\(\s*\(\s*\)\s*=>\s*import\(\s*['"]@components\/([A-Za-z0-9_-]+)\.svelte['"]/g
        const names = new Set<string>()
        let m: RegExpExecArray | null
        while ((m = lazyRe.exec(appSrc)) !== null) names.add(m[1])
        // W2-CSSBUD (2026-08-18): InfoPanel / JourneyChrome / FocusCard converted
        // to lazies for per-chunk CSS. Placeholder2D was tried but REVERTED to
        // static 2026-08-18 (cf15a68f): it is first-paint critical on the
        // placeholder2d renderKind; lazy gating broke W51/W54/W55 (0 H1).
        // Net count 9 lazy handles.
        expect(names.size).toBe(9)
    })
})

// ---------------------------------------------------------------------------
// (B) Parity plumbing// ---------------------------------------------------------------------------
// (B) Parity plumbing — guarded in the useParityAttrs composable
// ---------------------------------------------------------------------------
//
// After W48-T3 extraction, parityMap.X and getBypassAttr() reads moved out
// of App.svelte into src/lib/ui/use-parity-attrs.svelte.ts. The drift guard
// now scans the composable source: any new key added to PARITY_ATTRIBUTES
// or BypassAttrKey must be referenced somewhere in the composable (or the
// guard will fail). The composable's getter pattern means reads are
// unconditional (no $derived wrapper required).

describe('useParityAttrs — parity plumbing guard', () => {
    it('every parityMap.X read in the composable references a documented PARITY_ATTRIBUTES key', () => {
        // Extract documented keys from parity-attrs.svelte.ts
        const keyRe = /key:\s*'([a-zA-Z0-9]+)'/g
        const documentedKeys = new Set<string>()
        let km: RegExpExecArray | null
        while ((km = keyRe.exec(paritySrc)) !== null) documentedKeys.add(km[1])

        // Extract parityMap.* reads from the composable source
        const readRe = /parityMap\.([a-zA-Z0-9]+)/g
        const reads: string[] = []
        let rm: RegExpExecArray | null
        while ((rm = readRe.exec(parityAttrsSrc)) !== null) reads.push(rm[1])

        expect(reads.length).toBeGreaterThanOrEqual(1)

        const unknown = reads.filter((k) => !documentedKeys.has(k))
        expect(unknown, `parityMap keys not in PARITY_ATTRIBUTES: ${unknown.join(', ')}`).toEqual([])
    })

    it('every getBypassAttr("X") read in the composable references a documented BypassAttrKey', () => {
        // BypassAttrKey union from parity-attrs.svelte.ts
        const bypassTypeRe = /type BypassAttrKey\s*=\s*([^]+?)\n\}/
        const bm = bypassTypeRe.exec(paritySrc)
        expect(bm, 'could not locate BypassAttrKey type').not.toBeNull()
        const unionBody = bm![1]
        const bypassKeys = new Set([...unionBody.matchAll(/'([a-zA-Z0-9]+)'/g)].map((x) => x[1]))
        expect(bypassKeys.size).toBeGreaterThanOrEqual(4)

        const readRe = /getBypassAttr\(\s*'([a-zA-Z0-9]+)'\s*\)/g
        const reads: string[] = []
        let rm: RegExpExecArray | null
        while ((rm = readRe.exec(parityAttrsSrc)) !== null) reads.push(rm[1])

        expect(reads.length).toBeGreaterThanOrEqual(1)

        const unknown = reads.filter((k) => !bypassKeys.has(k))
        expect(unknown, `getBypassAttr keys not in BypassAttrKey: ${unknown.join(', ')}`).toEqual([])
    })

    it('App.svelte consumes the composable (no direct parityMap reads remain)', () => {
        // After extraction, App.svelte must not read parityMap directly.
        // All parity attribute access goes through `parity.X` from useParityAttrs.
        const directParityMapRe = /\bparityMap\./
        expect(
            directParityMapRe.test(appSrc),
            'App.svelte still references parityMap directly — should route via useParityAttrs()'
        ).toBe(false)

        const directBypassRe = /\bgetBypassAttr\(/
        expect(
            directBypassRe.test(appSrc),
            'App.svelte still references getBypassAttr directly — should route via useParityAttrs()'
        ).toBe(false)
    })
})

// ---------------------------------------------------------------------------
// (C) Scene-ready wiring
// ---------------------------------------------------------------------------

describe('App.svelte — scene-ready wiring', () => {
    it('imports signalSceneReady and signalSceneError from scene-ready.svelte', () => {
        expect(appSrc).toMatch(
            /import\s*\{\s*signalSceneReady\s*,\s*signalSceneError\s*\}\s*from\s*['"]@lib\/stores\/scene-ready\.svelte['"]/
        )
    })

    it('calls signalSceneReady() inside the onSceneReady handler', () => {
        // The onSceneReady handler is an inline arrow in the template:
        //   onSceneReady={() => { s3dSceneReady = true; signalSceneReady(); }}
        // Find the onSceneReady attribute and verify signalSceneReady is called
        // within the next few lines.
        const lines = appSrc.split('\n')
        let found = false
        for (let i = 0; i < lines.length; i++) {
            if (/onSceneReady=\{/.test(lines[i])) {
                // Scan this line + next 3 lines for the call
                const window = lines.slice(i, i + 4).join('\n')
                if (/signalSceneReady\s*\(\s*\)/.test(window)) {
                    found = true
                    break
                }
            }
        }
        expect(found, 'signalSceneReady() not called from onSceneReady handler').toBe(true)
    })

    it('calls signalSceneError() inside the onSceneError handler', () => {
        const lines = appSrc.split('\n')
        let found = false
        for (let i = 0; i < lines.length; i++) {
            if (/onSceneError=\{/.test(lines[i])) {
                const window = lines.slice(i, i + 4).join('\n')
                if (/signalSceneError\s*\(\s*\)/.test(window)) {
                    found = true
                    break
                }
            }
        }
        expect(found, 'signalSceneError() not called from onSceneError handler').toBe(true)
    })

    it('both onSceneReady and onSceneError handlers exist (Canvas is wired)', () => {
        const readyCount = (appSrc.match(/onSceneReady=/g) ?? []).length
        const errorCount = (appSrc.match(/onSceneError=/g) ?? []).length
        expect(readyCount).toBeGreaterThanOrEqual(1)
        expect(errorCount).toBeGreaterThanOrEqual(1)
    })
})

// ---------------------------------------------------------------------------
// (D) Composition root shape
// ---------------------------------------------------------------------------

describe('App.svelte — composition root shape', () => {
    const requiredChildren = [
        'AppBoot',
        'Placeholder2D', // static (first-paint critical; revert 2026-08-18 cf15a68f)
        'Canvas', // lazy
        'Header',
        'SemanticOverlay',
        'Legend',
        'InfoPanel', // lazy (CSS-budget chunking W2-CSSBUD)
        'CompassRail',
        'Controls',
        'LoadingOverlay',
        'Toast'
    ]

    // Components rendered via createLazyComponent + {@const Cmp = xLazy.current}
    // instead of a literal <x> tag in the template.
    // Placeholder2D reverted to static 2026-08-18 (cf15a68f) — first-paint critical.
    const lazyHandled = new Set(['Canvas', 'InfoPanel', 'JourneyChrome', 'FocusCard'])

    it.each(requiredChildren)('template contains <%s', (name) => {
        if (lazyHandled.has(name)) {
            // Lazy: verify the handle is declared and referenced via .current
            // (the render site uses {@const Cmp = <handle>.current}).
            const handleRe = new RegExp(`${name.charAt(0).toLowerCase() + name.slice(1)}Lazy\\s*=`)
            expect(appSrc).toMatch(handleRe)
            const useRe = new RegExp(`${name.charAt(0).toLowerCase() + name.slice(1)}Lazy\\.current`)
            expect(appSrc).toMatch(useRe)
        } else {
            // Direct component reference in template
            const re = new RegExp(`<${name}[\\s/>]`)
            expect(appSrc).toMatch(re)
        }
    })

    it('renders a <main> landmark wrapping the explorer', () => {
        expect(appSrc).toMatch(/<main\b/)
    })

    it('renders the #semantic-explorer root div', () => {
        expect(appSrc).toMatch(/id="semantic-explorer"/)
    })
})

// ---------------------------------------------------------------------------
// (E) No dead imports
// ---------------------------------------------------------------------------

describe('App.svelte — no dead imports', () => {
    it('every @components/X.svelte import resolves to a real file', () => {
        const importRe =
            /import\s+(?:type\s+)?(?:[A-Za-z0-9_{},\s]+from\s+)?['"]@components\/([A-Za-z0-9_-]+)\.svelte['"]/g
        const names: string[] = []
        let m: RegExpExecArray | null
        while ((m = importRe.exec(appSrc)) !== null) names.push(m[1])

        const missing = names.filter((n) => !existsSync(resolve(SRC_DIR, 'components', `${n}.svelte`)))
        expect(missing, `dead @components imports: ${missing.join(', ')}`).toEqual([])
    })

    it('every @lib/... import resolves to a real file', () => {
        const importRe = /from\s+['"]@lib\/([^'"]+)['"]/g
        const bad: string[] = []
        let m: RegExpExecArray | null
        while ((m = importRe.exec(appSrc)) !== null) {
            const spec = m[1]
            // Try with .ts, .svelte.ts, .svelte, and as directory/index.ts
            const base = resolve(SRC_DIR, 'lib', spec)
            const candidates = [
                base, // exact path (handles .svelte.ts imports with full extension)
                base + '.ts',
                base + '.svelte.ts',
                base + '.svelte',
                base + '.js',
                resolve(base, 'index.ts'),
                resolve(base, 'index.svelte.ts')
            ]
            if (!candidates.some((c) => existsSync(c))) {
                bad.push(spec)
            }
        }
        expect(bad, `dead @lib imports: ${bad.join(', ')}`).toEqual([])
    })

    it('every ./X.svelte relative import resolves to a real file', () => {
        const importRe = /from\s+['"]\.\/([A-Za-z0-9_-]+)\.svelte['"]/g
        const bad: string[] = []
        let m: RegExpExecArray | null
        while ((m = importRe.exec(appSrc)) !== null) {
            const name = m[1]
            if (!existsSync(resolve(SRC_DIR, `${name}.svelte`))) bad.push(name)
        }
        expect(bad, `dead relative imports: ${bad.join(', ')}`).toEqual([])
    })
})

// ---------------------------------------------------------------------------
// (F) Svelte 5 rune count
// ---------------------------------------------------------------------------

describe('App.svelte — Svelte 5 rune count', () => {
    it('uses at least 30 $derived / $effect / $state runes', () => {
        const derived = (appSrc.match(/\$derived/g) ?? []).length
        const effect = (appSrc.match(/\$effect/g) ?? []).length
        const state = (appSrc.match(/\$state/g) ?? []).length
        const total = derived + effect + state
        expect(total).toBeGreaterThanOrEqual(30)
    })

    it('uses at least 10 $derived runes (composition-root density)', () => {
        // After W48-T3 (useParityAttrs) + W48-T4 (useNavState), raw parity
        // and nav reads moved to composables. App.svelte keeps composition
        // predicates (mapModeActive, searchSurfaceActive, focusActive,
        // headerVisible, controlsVisible, infoPanelOpen) — still rich
        // reactive composition, just no longer leaking raw schema reads.
        const derived = (appSrc.match(/\$derived/g) ?? []).length
        expect(derived).toBeGreaterThanOrEqual(10)
    })
})
