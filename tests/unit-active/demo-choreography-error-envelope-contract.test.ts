/**
 * demo-choreography-error-envelope-contract.test.ts
 *
 * Structural + behavioral lock-in for the W47 error-envelope pass on
 * src/lib/engine/demo-choreography.ts.
 *
 * What this guards:
 *   1. Every async exported/internal function in the file has a try/catch
 *      envelope (so a thrown error doesn't bubble as an unhandled rejection).
 *   2. Every fire-and-forget setTimeout callback in runDemo is wrapped in
 *      try/catch (so a phase-timer throw doesn't corrupt demo state).
 *   3. The _demoNodeIndex "as number" silent null→0 coercion bug is gone.
 *   4. debugWarn is imported from @lib/utils/diagnostic-adapter.
 *
 * What this does NOT guard:
 *   - The caller's (choreography.ts) retry-loop race — owned by a
 *     separate migration wave per the file's own JSDoc.
 *   - Runtime correctness of the choreography phases — covered by
 *     demo-phase-timing.test.ts and component-DemoChoreography.test.ts.
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
const SRC_PATH = resolve(__dirname, '../../src/lib/engine/demo-choreography.ts')

function readSource(): string {
    return readFileSync(SRC_PATH, 'utf-8')
}

// Extract the body of a function declaration: from `async function NAME`
// up to its matching closing brace at column 0.
function extractFunctionBody(src: string, name: string): string {
    const re = new RegExp(`(async\\s+function\\s+${name}\\b[^{]*\\{)`, 'm')
    const m = re.exec(src)
    if (!m) throw new Error(`Could not find function ${name} in source`)
    const start = m.index + m[0].length
    let depth = 1
    let i = start
    while (i < src.length && depth > 0) {
        const c = src[i]
        if (c === '{') depth++
        else if (c === '}') depth--
        i++
    }
    return src.slice(start, i - 1)
}

describe('demo-choreography — error-envelope contract (W47)', () => {
    const src = readSource()

    it('imports debugWarn from @lib/utils/diagnostic-adapter', () => {
        expect(src).toMatch(/import\s*\{[^}]*\bdebugWarn\b[^}]*\}\s*from\s*['"]@lib\/utils\/diagnostic-adapter['"]/)
    })

    it('has zero unchecked "as number" casts coercing _demoNodeIndex to number', () => {
        // The bug: `const demoNode = _demoNodeIndex as number` silently
        // converted null to 0. A future regression that re-adds the cast
        // (without the explicit null-guard) would fail this test.
        const coercionPattern = /_demoNodeIndex\s+as\s+number(?!.*null)/
        const badCoercions = src.match(coercionPattern)
        expect(badCoercions).toBeNull()
    })

    it('runDemo guards against null _demoNodeIndex (no silent null→0)', () => {
        const body = extractFunctionBody(src, 'runDemo')
        expect(body).toMatch(/_demoNodeIndex/)
        // Explicit null/finiteness check must precede any use of demoNode
        expect(body).toMatch(/demoNode\s*===\s*null|!Number\.isFinite/)
    })

    it('runDemo body is wrapped in try/catch', () => {
        const body = extractFunctionBody(src, 'runDemo')
        // First non-whitespace statements should be the try block
        const stripped = body.replace(/^\s+/, '')
        expect(stripped.startsWith('try {')).toBe(true)
        expect(body).toMatch(/}\s*catch\s*\(/)
    })

    it('demoReset body is wrapped in try/catch', () => {
        const body = extractFunctionBody(src, 'demoReset')
        expect(body.trimStart().startsWith('try {')).toBe(true)
    })

    it('demoFocusSetup body is wrapped in try/catch', () => {
        const body = extractFunctionBody(src, 'demoFocusSetup')
        expect(body.trimStart().startsWith('try {')).toBe(true)
    })

    it('cleanup body is wrapped in try/catch', () => {
        const body = extractFunctionBody(src, 'cleanup')
        expect(body.trimStart().startsWith('try {')).toBe(true)
    })

    it('endDemo body is wrapped in try/catch', () => {
        const body = extractFunctionBody(src, 'endDemo')
        expect(body.trimStart().startsWith('try {')).toBe(true)
    })

    it('cancelChoreography body is wrapped in try/catch (terminal-state check is outside)', () => {
        // The function has an early-return for terminal states, then
        // a try block for the cancel work.
        const body = extractFunctionBody(src, 'cancelChoreography')
        expect(body).toMatch(/try\s*\{/)
        expect(body).toMatch(/catch\s*\(/)
    })

    it('all 9 phase-timer setTimeout callbacks in runDemo are wrapped in try/catch', () => {
        // Count setTimeout callbacks inside runDemo. Each callback arrow
        // should contain a `try {` block.
        const body = extractFunctionBody(src, 'runDemo')

        // Match all setTimeout(() => { ... }, N) blocks. We need a balanced-
        // brace slice per callback; the helper below extracts each one.
        const callbacks: string[] = []
        const re = /window\.setTimeout\(\s*\(\)\s*=>\s*\{/g
        let m: RegExpExecArray | null
        while ((m = re.exec(body)) !== null) {
            const start = m.index + m[0].length
            let depth = 1
            let i = start
            while (i < body.length && depth > 0) {
                const c = body[i]
                if (c === '{') depth++
                else if (c === '}') depth--
                i++
            }
            callbacks.push(body.slice(start, i - 1))
        }

        expect(callbacks).toHaveLength(9)
        for (let i = 0; i < callbacks.length; i++) {
            const cb = callbacks[i]
            expect(cb, `setTimeout callback #${i + 1} (one of 9 phase timers) is not wrapped in try/catch`).toMatch(
                /try\s*\{/
            )
            expect(cb, `setTimeout callback #${i + 1} (one of 9 phase timers) has try but no catch`).toMatch(
                /catch\s*\(/
            )
        }
    })

    it('runDemo catch block resets scratch state and tears down DOM', () => {
        const body = extractFunctionBody(src, 'runDemo')
        // The outer catch is the LAST one in runDemo (inner setTimeout
        // catches come first; the function-level catch is at the end).
        const allCatches = [...body.matchAll(/}\s*catch\s*\([^)]*\)\s*\{([\s\S]*?)\n\s*\}/g)]
        expect(allCatches.length, 'runDemo should have multiple catches').toBeGreaterThan(0)
        const outerCatch = allCatches[allCatches.length - 1][1]
        expect(outerCatch).toMatch(/_demoPhase\s*=\s*PHASE\.CANCELLED/)
        expect(outerCatch).toMatch(/_demoCancelled\s*=\s*true/)
        expect(outerCatch).toMatch(/clearDemoTimers\(\)/)
        expect(outerCatch).toMatch(/data-demo-active/)
    })

    it('all error-envelopes use debugWarn (not console.warn) for consistency with debug-probe gating', () => {
        // Find every catch ( ... ) block and verify it contains debugWarn,
        // not a raw console.warn/error that would leak in production.
        const catchBodyMatches = src.matchAll(/\}\s*catch\s*\([^)]*\)\s*\{([\s\S]*?)\n\s*\}/g)
        let total = 0
        for (const m of catchBodyMatches) {
            total++
            const block = m[1]
            expect(block, `catch block #${total} does not call debugWarn — raw console would leak in prod`).toMatch(
                /debugWarn/
            )
        }
        expect(total).toBeGreaterThanOrEqual(9) // 6 functions + runDemo's outer
    })
})
