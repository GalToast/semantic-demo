// contracts-registry.test.ts — pins every contract artifact against the manifest.
// Mirror of the url-split protocol registry: a contract that appears on disk
// but not in contracts.manifest.json (or vice versa) fails the suite, so the
// "who gates which contract" question never silently drifts again.
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join, resolve, basename } from 'node:path'
import { test, expect } from 'vitest'

const REPO_ROOT = resolve(__dirname, '..', '..')
const MANIFEST_PATH = join(REPO_ROOT, 'tests', 'contracts.manifest.json')
const TESTS_DIR = join(REPO_ROOT, 'tests')

let manifestEntries: string[] = []
try {
    const raw = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'))
    const groups = raw.groups ?? {}
    manifestEntries = Object.values(groups).flatMap((g) =>
        ((g as { contracts?: unknown[] } | undefined)?.contracts ?? []).map(String)
    )
} catch {
    // left empty; tests will surface the unreadable manifest
}

// Helper/utility modules that are NOT contract entries (mirrors
// run-all-contracts.js discoverUnlistedContracts exclusions).
const NON_CONTRACT_HELPERS = new Set(['source-path.mjs'])
const onDisk = readdirSync(TESTS_DIR)
    .filter((f) => /\.(mjs|spec\.(js|mjs)|contract\.mjs)$/.test(f))
    .filter((f) => !NON_CONTRACT_HELPERS.has(f))
    .map((f) => f)

function manifestHas(name: string): boolean {
    return manifestEntries.some((e) => e === name || e.includes(name))
}

test('every contract-ish file on disk is registered in the manifest', () => {
    const missing = onDisk.filter(
        (f) =>
            !manifestEntries.some((e) => {
                if (e === f) return true
                const base = basename(e)
                return base === f || e.endsWith('/' + f)
            })
    )
    expect(missing, `unregistered contract file(s): ${missing.join(', ')}`).toEqual([])
})

test('every manifest entry resolves to a file on disk', () => {
    // Entries are tests/-relative bare filenames (see readdirSync(TESTS_DIR)
    // in the on-disk scan). Resolve against TESTS_DIR first, with a REPO_ROOT
    // fallback for any future root-prefixed entries — so a lone extra entry
    // can't silently fail both.
    const resolveEntry = (e: string) => {
        if (e.startsWith('tests/') || e.startsWith('src/') || e.includes('/')) {
            const rootPath = join(REPO_ROOT, e)
            if (existsSync(rootPath)) return rootPath
            return join(TESTS_DIR, basename(e))
        }
        const testsPath = join(TESTS_DIR, e)
        return existsSync(testsPath) ? testsPath : join(REPO_ROOT, e)
    }
    const missing = manifestEntries.filter((e) => !existsSync(resolveEntry(e)))
    expect(missing, `manifest entries missing on disk: ${missing.join(', ')}`).toEqual([])
})

test('manifest parses to a list (readability gate)', () => {
    expect(manifestEntries.length).toBeGreaterThan(0)
    expect(Array.isArray(manifestEntries)).toBe(true)
})
