import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

/**
 * @vitest-environment node
 *
 * Invariant: every @lib/engine/*-bridge import in src/ must resolve to a real file.
 * Prevents broken-tree commits where code references non-existent bridge files.
 */

const SRC_DIR = path.resolve(process.cwd(), 'src')
const BRIDGE_IMPORT_RE = /@lib\/engine\/([^'"\s.]+)/g

function findTsFiles(dir: string): string[] {
    const results: string[] = []
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) {
            results.push(...findTsFiles(full))
        } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.svelte.ts')) {
            results.push(full)
        }
    }
    return results
}

describe('bridge-import-graph invariant', () => {
    it('every @lib/engine/* import resolves to an existing file', () => {
        const dangling: string[] = []

        for (const file of findTsFiles(SRC_DIR)) {
            const content = fs.readFileSync(file, 'utf8')
            let match: RegExpExecArray | null
            while ((match = BRIDGE_IMPORT_RE.exec(content)) !== null) {
                const importPath = match[1]
                const resolved = path.join(SRC_DIR, 'lib', 'engine', importPath)
                const exists =
                    fs.existsSync(resolved) ||
                    fs.existsSync(resolved + '.ts') ||
                    fs.existsSync(resolved + '.svelte.ts') ||
                    fs.existsSync(resolved + '.js') ||
                    fs.existsSync(resolved + '.mjs')

                if (!exists) {
                    dangling.push(`${path.relative(process.cwd(), file)}: @lib/engine/${importPath}`)
                }
            }
        }

        expect(dangling).toEqual([])
    })
})
