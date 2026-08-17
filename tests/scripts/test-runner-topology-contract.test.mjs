/**
 * @vitest-environment node
 *
 * Test-runner topology contract — guards three invariants about how the
 * standalone search Escape→cancel journey and the contract runner share the
 * Playwright server.
 *
 * These checks are static (source inspection) so they run in milliseconds and
 * never start a server or a browser.
 *
 * Invariants:
 *   1. The standalone search Escape journey uses the canonical Playwright
 *      server default (8796, matching playwright.config.js webServer) while
 *      preserving the TEST_BASE_URL override.
 *   2. The contract runner forces Playwright `workers=1` when it owns the
 *      single-threaded test server (no external TEST_BASE_URL supplied).
 *   3. The search journey fails fast (throws) when its required test store
 *      global is absent, instead of silently skipping setup.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const PROJECT_ROOT = resolve('.')
const SPEC = resolve(PROJECT_ROOT, 'tests', 'search-input-escape-cancel-journey.spec.js')
const RUNNER = resolve(PROJECT_ROOT, 'tests', 'run-all-contracts.js')
const CONFIG = resolve(PROJECT_ROOT, 'playwright.config.js')

const SPEC_SRC = readFileSync(SPEC, 'utf-8')
const RUNNER_SRC = readFileSync(RUNNER, 'utf-8')
const CONFIG_SRC = readFileSync(CONFIG, 'utf-8')

describe('search Escape journey — canonical Playwright port', () => {
    it('uses 8796 as the default base URL', () => {
        expect(SPEC_SRC).toMatch(/process\.env\.TEST_BASE_URL\s*\|\|\s*'http:\/\/127\.0\.0\.1:8796'/)
    })

    it('preserves the TEST_BASE_URL override', () => {
        // The override must be the first operand of the || default fallback.
        expect(SPEC_SRC).toMatch(/const BASE_URL = \(process\.env\.TEST_BASE_URL\s*\|\|/)
    })

    it('matches the playwright.config.js webServer default (8796)', () => {
        // The canonical server default must be consistent across the two files.
        expect(CONFIG_SRC).toMatch(/TEST_BASE_URL\s*\|\|\s*'http:\/\/127\.0\.0\.1:8796'/)
        expect(CONFIG_SRC).toMatch(/port:\s*8796/)
    })
})

describe('contract runner — single worker when owning the server', () => {
    it('defines playwrightWorkerFlags that forces --workers=1 only when not given an external URL', () => {
        expect(RUNNER_SRC).toMatch(
            /function playwrightWorkerFlags\(\)\s*{\s*return process\.env\.TEST_BASE_URL\s*\?\s*\[\]\s*:\s*\['--workers=1'\]/
        )
    })

    it('threads the worker flag into the per-file Playwright exec args', () => {
        // runContract branch must spread playwrightWorkerFlags() into the
        // `playwright test tests/<file>` argument list.
        expect(RUNNER_SRC).toMatch(
            /\[PLAYWRIGHT_CLI, 'test', `tests\/\$\{filename\}`, \.\.\.PLAYWRIGHT_FLAGS, \.\.\.playwrightWorkerFlags\(\)\]/
        )
    })

    it('threads the worker flag into the batched Playwright exec args', () => {
        // runBatchContract branch must also spread playwrightWorkerFlags().
        expect(RUNNER_SRC).toMatch(
            /\[PLAYWRIGHT_CLI, 'test', \.\.\.files\.map\(\(f\) => `tests\/\$\{f\}`\), \.\.\.PLAYWRIGHT_FLAGS, \.\.\.playwrightWorkerFlags\(\)\]/
        )
    })
})

describe('search Escape journey — fail fast on missing store global', () => {
    it('throws when window.__searchStore__ is absent', () => {
        expect(SPEC_SRC).toMatch(/const store = [\s\S]*?window\)\.__searchStore__/)
        expect(SPEC_SRC).toMatch(/if \(!store\)\s*{\s*throw new Error\(/)
    })

    it('does NOT silently skip setup when the global is absent', () => {
        // The previous silent fallback `if (store) { store.set(...) }` must be gone.
        const silentFallback = SPEC_SRC.match(/if \(store\)\s*{\s*store\.set\(/g)
        expect(silentFallback).toBeNull()
    })
})
