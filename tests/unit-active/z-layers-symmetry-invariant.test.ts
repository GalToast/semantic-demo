/**
 * Z_LAYERS ↔ z-layers.css symmetry invariant (L4-H1 regression guard).
 *
 * `src/lib/z-index.ts` `Z_LAYERS` and `src/lib/css/z-layers.css` `:root` custom
 * properties must mirror each other (every TS key ↔ a `--z-<kebab>` var, and vice
 * versa), so the TS constant stays the single source of truth for every z-index
 * value in the app. The lone exception is `--z-max`, the ceiling sentinel (not a
 * layer). Drift in either direction fails loudly here so a future CSS-only layer is
 * not silently omitted from TS (and vice versa).
 */
import { describe, it, expect } from 'vitest'
// @ts-ignore -- tests/ is excluded from the workspace tsconfig; node built-ins resolve at vitest runtime.
import { readFileSync } from 'node:fs'
// @ts-ignore -- tests/ is excluded from the workspace tsconfig.
import { resolve, dirname } from 'node:path'
// @ts-ignore -- tests/ is excluded from the workspace tsconfig.
import { fileURLToPath } from 'node:url'
// @ts-ignore -- tests/ is excluded from the workspace tsconfig; @lib alias resolves via vitest config.
import { Z_LAYERS } from '@lib/z-index'

const here = dirname(fileURLToPath(import.meta.url))
const css = readFileSync(resolve(here, '../../src/lib/css/z-layers.css'), 'utf8')

/** Map a Z_LAYERS camelCase key to its CSS custom-property name (z-<kebab>). */
function camelToZVar(key: string): string {
    return (
        'z-' +
        key
            .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
            .replace(/([a-zA-Z])(\d)/g, '$1-$2')
            .toLowerCase()
    )
}

/** Map a CSS `z-<kebab>` var name back to the expected Z_LAYERS camelCase key. */
function zVarToCamel(zVar: string): string {
    return zVar
        .slice(2)
        .split('-')
        .map((part, i) => (i === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1)))
        .join('')
}

/** Extract `--z-<kebab>` custom property names declared in z-layers.css. */
function extractCssZVars(source: string): Set<string> {
    const vars = new Set<string>()
    const re = /--z-([a-z0-9][a-z0-9-]*)\s*:/g
    let m: RegExpExecArray | null
    while ((m = re.exec(source)) !== null) vars.add('z-' + m[1])
    return vars
}

const cssVars = extractCssZVars(css)
const tsKeys = Object.keys(Z_LAYERS)

describe('Z_LAYERS ↔ z-layers.css symmetry invariant (L4-H1)', () => {
    it('every Z_LAYERS key has a matching --z-<kebab> var in z-layers.css', () => {
        const missing = tsKeys.filter((k) => !cssVars.has(camelToZVar(k)))
        expect(missing, 'TS keys with no matching CSS var').toEqual([])
    })

    it('every z-layers.css --z-* var (except the --z-max ceiling sentinel) maps to a Z_LAYERS key', () => {
        const tsKeySet = new Set(tsKeys)
        const missing: string[] = []
        for (const zVar of cssVars) {
            if (zVar === 'z-max') continue // ceiling sentinel, intentionally not a layer
            const expectedKey = zVarToCamel(zVar)
            if (!tsKeySet.has(expectedKey)) {
                missing.push(`--${zVar} (expected Z_LAYERS key "${expectedKey}")`)
            }
        }
        expect(missing, 'CSS vars with no matching Z_LAYERS key').toEqual([])
    })

    it('Z_LAYERS covers the L4-H1 backfill (>= 45 layers: 22 original + 23 backfilled)', () => {
        expect(tsKeys.length).toBeGreaterThanOrEqual(45)
    })
})
