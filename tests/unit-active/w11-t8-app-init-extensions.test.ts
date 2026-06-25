/**
 * @file w11-t8-app-init-extensions.test.ts
 *
 * Structural and contract tests for W11-T8 Wave 1:
 *   - Complete __APP_ACTIONS__ bridge registry (19+ methods)
 *   - WebGL context restore handler (setupWebglContextRestore)
 *
 * These tests verify the source structure — not runtime behavior — so they
 * can run without a real WebGL context or full engine init.
 *
 * Post-T3.2: the action bag now lives in window-test-bridge.ts (extracted
 * from app-init.ts). The tests below read both files and assert:
 *   - __APP_ACTIONS__ keys are in window-test-bridge.ts (canonical location)
 *   - app-init.ts calls installWindowTestBridge() (wiring)
 *   - WebGL restore handler and other app-init-specific concerns stay in app-init.ts
 */
import { describe, it, expect } from 'vitest'
// @ts-ignore
import { readFileSync } from 'node:fs'
// @ts-ignore
import { resolve } from 'node:path'

// ── Helpers ──────────────────────────────────────────────────────────────────

// @ts-ignore
const APP_INIT_PATH = resolve(import.meta.dirname, '../../src/lib/orchestration/app-init.ts')
// @ts-ignore
const TEST_BRIDGE_PATH = resolve(import.meta.dirname, '../../src/lib/orchestration/window-test-bridge.ts')

function readSource(path: string): string {
    return readFileSync(path, 'utf-8')
}

// Read both sources at module level so all describe blocks can access them
const src = readSource(APP_INIT_PATH)
const bridgeSrc = readSource(TEST_BRIDGE_PATH)

// ── Structural Tests ─────────────────────────────────────────────────────────

describe('W11-T8: __APP_ACTIONS__ completeness (in window-test-bridge.ts)', () => {
    // Original 9 actions (pre-W11-T8)
    const originalActions = [
        'switchView',
        'focusOnNode',
        'setTrailDepth',
        'setSemanticDiveMode',
        'refreshCompositionState',
        'resetExplorationFocus',
        'resetExperienceState',
        'clearSearch',
        'returnToOverview'
    ]

    // New 10 actions added in W11-T8 Wave 1
    const newActions = [
        'search',
        'setTrailFromSeed',
        'traverseNeighbor',
        'inspectThreadNeighbor',
        'pinThreadNeighbor',
        'unpinThreadInspection',
        'clearThreadInspection',
        'walkThreadNeighbor',
        'requestSemanticGuide',
        'showSemanticThreadsDetail'
    ]

    it('has all 9 original __APP_ACTIONS__ methods', () => {
        for (const action of originalActions) {
            // Match both object-literal and property-assignment forms in bridgeSrc
            expect(bridgeSrc).toMatch(new RegExp(`\\b${action}\\b\\s*[:=]`))
        }
    })

    it('has all 10 new __APP_ACTIONS__ methods added in W11-T8', () => {
        for (const action of newActions) {
            // In the object-literal form: `actionName: (args) => ...`
            expect(bridgeSrc).toMatch(new RegExp(`\\b${action}\\s*:`))
        }
    })

    it('has 19+ total action keys', () => {
        // Count keys in the actions object literal (buildActionsBag function).
        // Use a permissive regex that matches keys regardless of brace indent.
        const actionsBlock = bridgeSrc.match(/buildActionsBag[\s\S]*?\n    return actions/)
        const actionsKeys = actionsBlock
            ? [...actionsBlock[0].matchAll(/^\s{8}(\w+)\s*:/gm)]
            : []
        expect(actionsKeys.length).toBeGreaterThanOrEqual(19)
    })

    it('app-init.ts wires the bridge via installWindowTestBridge()', () => {
        // The actual action bag lives in window-test-bridge.ts; app-init.ts
        // only needs to install it. Verify the wiring is in place.
        expect(src).toContain('installWindowTestBridge')
    })
})

describe('W11-T8: app-init.ts WebGL context restore handler', () => {
    it('has a setupWebglContextRestore function', () => {
        expect(src).toContain('function setupWebglContextRestore')
    })

    it('subscribes to webglcontextlost event', () => {
        expect(src).toContain("addEventListener('webglcontextlost'")
    })

    it('subscribes to webglcontextrestored event', () => {
        expect(src).toContain("addEventListener('webglcontextrestored'")
    })

    it('returns a cleanup function that removes both listeners', () => {
        expect(src).toContain("removeEventListener('webglcontextlost'")
        expect(src).toContain("removeEventListener('webglcontextrestored'")
    })

    it('calls setupWebglContextRestore() from appInit()', () => {
        expect(src).toContain('setupWebglContextRestore()')
    })

    it('wires cleanup into the returned cleanup function', () => {
        expect(src).toContain('_unsubWebglRestore?.()')
    })
})

describe('W11-T8: app-init.ts imports the new canonical modules', () => {
    // Post-T3.2: the action-handler imports moved to window-test-bridge.ts.
    // app-init.ts still imports the orchestration primitives it needs directly.
    // Tests below split: action-handler imports → bridgeSrc, orchestration → src.

    it('imports installWindowTestBridge from window-test-bridge', () => {
        expect(src).toMatch(/import.*\binstallWindowTestBridge\b.*from.*window-test-bridge/)
    })

    it('imports initAdapters from adapters', () => {
        expect(src).toMatch(/import.*\binitAdapters\b.*from.*adapters/)
    })

    it('imports buildAdapterDeps from adapter-deps', () => {
        expect(src).toMatch(/import.*\bbuildAdapterDeps\b.*from.*adapter-deps/)
    })
})

describe('W11-T8: window-test-bridge.ts imports the canonical modules', () => {
    it('imports search from state', () => {
        expect(bridgeSrc).toMatch(/import.*\bsearch\b.*from.*search\/state/)
    })

    it('imports setTrailFromSeed from neighborhood', () => {
        expect(bridgeSrc).toMatch(/import.*\bsetTrailFromSeed\b.*from.*neighborhood/)
    })

    it('imports traverseNeighbor and walkThreadNeighbor from journey/thread-settler', () => {
        expect(bridgeSrc).toMatch(/import.*\btraverseNeighbor\b.*from.*journey\/thread-settler/)
        expect(bridgeSrc).toMatch(/import.*\bwalkThreadNeighbor\b.*from.*journey\/thread-settler/)
    })

    it('imports thread inspector methods from journey/thread-inspector', () => {
        // Imports are multiline: 'import {\n    inspectThreadNeighbor,\n    ...'
        // Use [\s\S]* to span newlines.
        expect(bridgeSrc).toMatch(/import\s*\{[\s\S]*\binspectThreadNeighbor\b[\s\S]*from\s+['"]@?lib\/journey\/thread-inspector/)
        expect(bridgeSrc).toMatch(/import\s*\{[\s\S]*\bpinThreadNeighbor\b[\s\S]*from\s+['"]@?lib\/journey\/thread-inspector/)
    })

    it('imports requestSemanticGuide from journey/semantic-guide', () => {
        expect(bridgeSrc).toMatch(/import.*\brequestSemanticGuide\b.*from.*journey\/semantic-guide/)
    })

    it('imports showSemanticThreadsDetail from journey/connection-analysis', () => {
        expect(bridgeSrc).toMatch(/import.*\bshowSemanticThreadsDetail\b.*from.*journey\/connection-analysis/)
    })
})

describe('W11-T8: Legacy parity — all legacy actions present in Svelte bridge', () => {
    // The legacy kernel published 9 actions on window.__APP_ACTIONS__.
    // The Svelte bridge must publish the same 9 to keep contract tests passing.
    const legacyActions = [
        'switchView',
        'focusOnNode',
        'setTrailDepth',
        'setSemanticDiveMode',
        'refreshCompositionState',
        'resetExplorationFocus',
        'resetExperienceState',
        'clearSearch',
        'returnToOverview'
    ]

    it('every legacy action key is present in Svelte window-test-bridge.ts', () => {
        for (const action of legacyActions) {
            expect(bridgeSrc).toContain(action)
        }
    })
})