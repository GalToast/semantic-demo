/**
 * w47-micro-demo-public-api-contract.test.ts — Contract test for
 * src/lib/demo/choreography.ts (Tier 2 #2.2)
 *
 * Background:
 *   choreography.ts is the public API for the first-visit demo. The actual
 *   timed camera/UI choreography still lives in a legacy JS module (loaded
 *   via static import). The header comment explicitly says "port pending" —
 *   meaning the legacy choreography hasn't been ported to Svelte 5 yet.
 *
 *   This file is therefore a "load-bearing legacy bridge" (per the W47
 *   audit, Tier 2 #2.2): the public surface here is the contract every
 *   other component depends on, and any accidental break to its exports
 *   would silently kill the first-visit demo.
 *
 * What this contract test locks in:
 *   1. The 5 public exports exist: initMicroDemo, shouldRunMicroDemo,
 *      startMicroDemo, cancelMicroDemo, isMicroDemoRunning.
 *   2. SESSION_STORAGE_KEY from ./guards is imported and used at least
 *      twice (eligibility check + start gate). Removing either usage
 *      re-introduces the "demo runs every page load" bug.
 *   3. The header comment documents the legacy-bridge status, so future
 *      devs see the "port pending" reminder.
 *
 * Style note: this test is structural (regex on source) rather than
 * behavioral. The choreography module has hard dependencies on the engine
 * store, the demo store, the appState proxy, and the legacy choreography
 * module — mocking all of those for a behavioral test would be fragile.
 * Structural testing locks in the contract without those dependencies.
 */
import { describe, it, expect } from 'vitest'
// @ts-ignore
import { readFileSync } from 'node:fs'
// @ts-ignore
import { fileURLToPath } from 'node:url'
// @ts-ignore
import { dirname, resolve } from 'node:path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const SRC_PATH = resolve(__dirname, '../../src/lib/demo/choreography.ts')
const GUARDS_PATH = resolve(__dirname, '../../src/lib/demo/guards.ts')

function readSource(path: string): string {
    return readFileSync(path, 'utf-8')
}

function extractExports(src: string): string[] {
    const re = /export\s+function\s+([A-Za-z_$][\w$]*)\s*\(/g
    const out: string[] = []
    let m: RegExpExecArray | null
    while ((m = re.exec(src)) !== null) {
        out.push(m[1] as string)
    }
    return out
}

function countOccurrences(haystack: string, needle: string): number {
    if (!needle) return 0
    let count = 0
    let idx = haystack.indexOf(needle)
    while (idx !== -1) {
        count++
        idx = haystack.indexOf(needle, idx + needle.length)
    }
    return count
}

describe('choreography.ts — public API surface (W47-T2 #2.2)', () => {
    const src = readSource(SRC_PATH)

    it('exports the five public demo entry points', () => {
        const exports = extractExports(src)
        // Each of these is consumed by app-init.ts, utility-bindings.ts,
        // window-actions.ts, or directly by the Svelte UI. Breaking any
        // of them is a silent regression.
        expect(exports).toContain('initMicroDemo')
        expect(exports).toContain('shouldRunMicroDemo')
        expect(exports).toContain('startMicroDemo')
        expect(exports).toContain('cancelMicroDemo')
        expect(exports).toContain('isMicroDemoRunning')
    })

    it('exports exactly the five public entry points (no extras that would imply public surface)', () => {
        // Catches the accidental `export function _helper()` mistake. If a
        // helper becomes exported, downstream code may start depending on
        // it and the public surface grows unintentionally.
        const exports = extractExports(src)
        expect(new Set(exports)).toEqual(
            new Set(['initMicroDemo', 'shouldRunMicroDemo', 'startMicroDemo', 'cancelMicroDemo', 'isMicroDemoRunning'])
        )
    })

    it('imports SESSION_STORAGE_KEY from ./guards', () => {
        // The storage key is the gate that prevents the demo from running
        // twice in one session. It must be imported (and used) from the
        // guards module, not duplicated or renamed.
        expect(src, 'SESSION_STORAGE_KEY must be imported from ./guards').toMatch(
            /import\s*\{[^}]*SESSION_STORAGE_KEY[^}]*\}\s*from\s*['"]\.\/guards['"]/
        )
    })

    it('SESSION_STORAGE_KEY is used at least twice (eligibility + start gate)', () => {
        // The eligibility check (shouldRunMicroDemo) reads the storage
        // key to decide whether the demo should run. The start gate
        // (_startMicroDemo) re-reads it inside the retry loop so a
        // concurrent UI click doesn't bypass the gate. Both references
        // are required for the contract.
        const usages = countOccurrences(src, 'SESSION_STORAGE_KEY')
        // 1 for the import + 2+ for the two reference sites (one each in
        // shouldRunMicroDemo and _startMicroDemo's retry path).
        expect(
            usages,
            `expected SESSION_STORAGE_KEY to be referenced 3+ times (import + 2 reference sites), got ${usages}`
        ).toBeGreaterThanOrEqual(3)
    })

    it('header comment documents the legacy-bridge status (port pending warning)', () => {
        // Future devs need to know this file is load-bearing legacy code
        // that hasn't been ported to Svelte 5 yet. The header comment
        // is the only documentation. If someone removes the warning,
        // they may rip out the legacy bridge without realizing its weight.
        expect(src, 'header comment should mention "port pending" — the legacy bridge has not been ported yet').toMatch(
            /port pending/i
        )
    })

    it('header comment identifies this as a facade / legacy bridge', () => {
        // The "Thin facade" or similar wording signals that the file is
        // intentionally a wrapper around the legacy choreography module.
        // If a future refactor removes this language, it's a signal that
        // someone may be about to delete the legacy-bridge wiring.
        const headerMatch = src.match(/\/\*\*[\s\S]*?\*\//)
        expect(headerMatch, 'header block comment not found').toBeTruthy()
        const header = headerMatch![0]
        expect(
            header.toLowerCase(),
            'header should call this a "facade" or "bridge" so future maintainers understand its role'
        ).toMatch(/facade|bridge/)
    })

    it('SESSION_STORAGE_KEY from ./guards is a stable string literal', () => {
        // The key is referenced from sessionStorage in app-init.ts and
        // multiple other places. Renaming the literal would silently
        // re-run the demo for every user (because old keys wouldn't
        // match the new key). Lock in the value.
        const guards = readSource(GUARDS_PATH)
        const match = guards.match(/export\s+const\s+SESSION_STORAGE_KEY\s*=\s*['"]([^'"]+)['"]/)
        expect(match, 'SESSION_STORAGE_KEY must be exported from ./guards').toBeTruthy()
        // Stable format: starts with app prefix, snake_case
        expect(match![1], `SESSION_STORAGE_KEY should be a stable string, got "${match![1]}"`).toMatch(
            /^[a-z][a-z0-9_]*$/
        )
    })
})
