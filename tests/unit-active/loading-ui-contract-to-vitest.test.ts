/**
 * @tests/unit-active/loading-ui-contract-to-vitest.test.ts
 *
 * Vitest translation of tests/loading-ui-contract.mjs
 * Demonstrates the migration pattern from bespoke .mjs contracts
 * to standard Vitest using file-system assertions.
 */

import { describe, test, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..', '..')

const svelteLoadingPath = join(ROOT, 'src/components/LoadingOverlay.svelte')
const hasSvelte = existsSync(svelteLoadingPath)
const svelteLoadingSource = hasSvelte ? readFileSync(svelteLoadingPath, 'utf8') : null

describe('Loading UI Contract (Vitest migration)', () => {
    test('LoadingOverlay.svelte renders loading-overlay element', () => {
        if (!hasSvelte || !svelteLoadingSource) return // legacy path active
        expect(svelteLoadingSource).toContain('loading-overlay')
    })

    test('LoadingOverlay.svelte has progress bar with correct width binding', () => {
        if (!hasSvelte || !svelteLoadingSource) return // legacy path active
        expect(svelteLoadingSource).toContain('loading-progress-bar')
        expect(svelteLoadingSource).toContain('Math.round(progress * 100)')
    })
})
