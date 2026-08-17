/**
 * @vitest-environment node
 *
 * Guards the static test server's root URL contract. Playwright's default
 * baseURL is the server root, so `/` must resolve to the app entry point.
 */

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const SOURCE = readFileSync(resolve('scripts', 'test-server.mjs'), 'utf8')

describe('test-server root route', () => {
    it('maps the root URL to index.html before resolving the file', () => {
        expect(SOURCE).toMatch(/const relativePath = pathname === '\/' \? 'index\.html' : pathname\.replace/)
        expect(SOURCE).toContain('resolve(ROOT, relativePath)')
    })
})
