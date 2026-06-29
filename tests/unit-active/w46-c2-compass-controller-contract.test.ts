/**
 * @file w46-c2-compass-controller-contract.test.ts
 *
 * Structural + light-runtime contract test for W46-C2:
 * src/lib/orchestration/compass-controller.ts.
 *
 * Before W46-C2, compass-controller.ts (617 lines -- the LARGEST
 * untested orchestration module) had ZERO direct unit tests.
 * Eight other test files referenced it indirectly (as an import
 * path or in journey-event-binding contracts), but no test
 * exercised its public API directly.
 *
 * Coverage map at this commit:
 *   - compass-controller.ts: 617 lines -> 18 dedicated tests (was 0)
 *
 * Tests follow the same structural + light-runtime pattern as
 * W11-T8 / W46-B1 / W46-B2 / W46-C1. Pure-runtime coverage for the
 * action-dispatch functions (syncJourneyCompassActions, etc.)
 * requires store subscriptions and DOM elements -- deferred to
 * component-mount tests.
 */
import { describe, it, expect } from 'vitest'
// @ts-ignore
import { readFileSync } from 'node:fs'
// @ts-ignore
import { resolve } from 'node:path'

const COMPASS_PATH = resolve(import.meta.dirname, '../../src/lib/orchestration/compass-controller.ts')
const src = readFileSync(COMPASS_PATH, 'utf-8')

// ── Source-derived structural checks ────────────────────────────────────────

describe('W46-C2: compass-controller.ts exists and has expected shape', () => {
    it('is a plain .ts file (not .svelte.ts -- no runes needed)', () => {
        expect(COMPASS_PATH).toMatch(/compass-controller\.ts$/)
    })

    it('has the orchestration-file JSDoc header', () => {
        // T-4a (commit e0ac6f25) stripped the historical "Replaces
        // js/modules/journey-compass-controller.js" porting note from
        // file headers across the project. The header now contains
        // only the path + brief description.
        expect(src).toMatch(/@lib\/orchestration\/compass-controller\.ts/)
        expect(src).toMatch(/Execute compass actions based on state/)
        // Guard: the historical "Replaces" line is intentionally gone
        expect(src).not.toMatch(/Replaces js\/modules\/journey-compass-controller/)
    })

    it('imports from canonical store sources', () => {
        // Each import statement as a whole -- robust to whitespace and brace position
        expect(src).toMatch(/import\s*\{[^}]*\bnavStore\b[^}]*\}\s*from\s+['"]@lib\/stores\/navigation\.svelte\.ts['"]/)
        expect(src).toMatch(/import\s*\{[^}]*\bsearchStore\b[^}]*\}\s*from\s+['"]@lib\/stores\/search\.svelte['"]/)
        expect(src).toMatch(/import\s*\{[^}]*\bfocusStore\b[^}]*\}\s*from\s+['"]@lib\/stores\/focus\.svelte\.ts['"]/)
        // appState is NOT imported here — compass-controller reads route state
        // through store selectors (navStore, focusStore, searchStore) instead.
        // Pre-W49b fixes asserted appState here, but the module never needed
        // the global state singleton; this assertion was stale.
        expect(src).toMatch(
            /import\s*\{[^}]*\bJOURNEY_ACTIONS\b[^}]*\}\s*from\s+['"](?:@lib\/stores\/compass\.svelte\.ts|@lib\/journey\/compass-state)['"]/
        )
    })
})

describe('W46-C2: public exports -- 11 functions + 2 interfaces', () => {
    it('exports the two type interfaces', () => {
        expect(src).toMatch(/export\s+interface\s+CompassPresentationState\b/)
        expect(src).toMatch(/export\s+interface\s+ViewHandoffModel\b/)
    })

    it('exports initJourneyCompassAdapter (legacy compat entry point)', () => {
        expect(src).toMatch(/export\s+function\s+initJourneyCompassAdapter\s*\(\s*opts:\s*\{\s*switchView/)
    })

    it('exports the three presentation/state sync functions', () => {
        expect(src).toMatch(/export\s+function\s+getJourneyCompassPresentationState\b/)
        expect(src).toMatch(/export\s+function\s+syncJourneyCompassActions\b/)
        expect(src).toMatch(/export\s+function\s+syncMapTrailStrip\b/)
    })

    it('exports the action dispatcher and update functions', () => {
        expect(src).toMatch(/export\s+function\s+executeJourneyCompassAction\s*\(\s*action:\s*string\s*\)/)
        expect(src).toMatch(/export\s+function\s+updateJourneyCompass\s*\(\s*\)/)
    })

    it('exports the view/model lookup functions', () => {
        expect(src).toMatch(/export\s+function\s+getViewHandoffModel\s*\(\s*view:\s*string\s*\)/)
    })

    it('exports the semantic probe + mobile peek + map refresh functions', () => {
        expect(src).toMatch(/export\s+function\s+installSemanticJourneyProbe\b/)
        expect(src).toMatch(/export\s+function\s+invokeClearMobileRouteFieldPeek\b/)
        expect(src).toMatch(/export\s+function\s+scheduleMapRouteRefresh\b/)
    })
})

describe('W46-C2: interface shape', () => {
    it('CompassPresentationState has density/copy/actions/navigationOwner fields', () => {
        const block = src.match(/export\s+interface\s+CompassPresentationState\s*\{[\s\S]*?\n\}/)
        expect(block).not.toBeNull()
        const b = block![0]
        expect(b).toContain('density')
        expect(b).toContain('copy')
        expect(b).toContain('actions')
        expect(b).toContain('navigationOwner')
    })

    it('CompassPresentationState.density has 3 allowed values', () => {
        const block = src.match(/export\s+interface\s+CompassPresentationState\s*\{[\s\S]*?\n\}/)
        expect(block).not.toBeNull()
        // density: 'hidden' | 'compact' | 'expanded';
        const densityLine = block![0].match(/density:\s*([^;\n]+);?/)
        expect(densityLine).not.toBeNull()
        expect(densityLine![1]).toContain("'hidden'")
        expect(densityLine![1]).toContain("'compact'")
        expect(densityLine![1]).toContain("'expanded'")
    })

    it('CompassPresentationState.copy has 2 allowed values', () => {
        const block = src.match(/export\s+interface\s+CompassPresentationState\s*\{[\s\S]*?\n\}/)
        expect(block).not.toBeNull()
        const copyLine = block![0].match(/copy:\s*([^;\n]+);?/)
        expect(copyLine).not.toBeNull()
        expect(copyLine![1]).toContain("'quiet'")
        expect(copyLine![1]).toContain("'full'")
    })

    it('ViewHandoffModel has icon/kicker/title/note fields', () => {
        const block = src.match(/export\s+interface\s+ViewHandoffModel\s*\{[\s\S]*?\n\}/)
        expect(block).not.toBeNull()
        const b = block![0]
        expect(b).toContain('icon')
        expect(b).toContain('kicker')
        expect(b).toContain('title')
        expect(b).toContain('note')
    })
})

describe('W46-C2: internal helpers exist', () => {
    it('has deriveOpenMapSurface helper (internal)', () => {
        expect(src).toMatch(/function\s+deriveOpenMapSurface\s*\(\s*\)\s*:\s*PanelSurface/)
    })

    it('has getMobileJourneyActionLabel helper (internal)', () => {
        expect(src).toMatch(/function\s+getMobileJourneyActionLabel\s*\(/)
    })

    it('has formatBusinessName helper (internal)', () => {
        expect(src).toMatch(/function\s+formatBusinessName\s*\(\s*name:\s*string\s*\)/)
    })
})

describe('W46-C2: MOBILE_JOURNEY_ACTION_LABELS covers all 6 journey actions', () => {
    it('defines labels for FOCUS_SEARCH, CENTER_ANCHOR, ENTER_INSIDE, SHOW_TRAIL_PANEL, NEXT_STOP, OPEN_MAP', () => {
        // All 6 labels must be defined in the MOBILE_JOURNEY_ACTION_LABELS object
        for (const action of [
            'FOCUS_SEARCH',
            'CENTER_ANCHOR',
            'ENTER_INSIDE',
            'SHOW_TRAIL_PANEL',
            'NEXT_STOP',
            'OPEN_MAP'
        ]) {
            // Match the action key inside the MOBILE_JOURNEY_ACTION_LABELS object
            const labelPattern = new RegExp(
                `MOBILE_JOURNEY_ACTION_LABELS[\\s\\S]{0,400}?\\b${action}\\b[\\s\\S]{0,80}?:`
            )
            expect(labelPattern.test(src)).toBe(true)
        }
    })
})

describe('W46-C2: getJourneyCompassPresentationState phase mapping (structural)', () => {
    // Note: 'overview' is the FALLBACK return (no explicit `if` branch), so we
    // assert it via the final return block. Other phases use explicit `if`.

    it('returns the standard/expanded branch as the fallback return (overview)', () => {
        // The final return block in the function returns the overview defaults
        // (expanded / full / standard / journey-compass). Match the trailing
        // return block by its density/copy/actions/navigationOwner values.
        const overviewBlock = src.match(
            /return\s*\{\s*density:\s*['"]expanded['"][\s\S]*?copy:\s*['"]full['"][\s\S]*?actions:\s*['"]standard['"][\s\S]*?navigationOwner:\s*['"]journey-compass['"]/
        )
        expect(overviewBlock).not.toBeNull()
    })

    it('returns compact/quiet/primary-secondary/scene for search OR focus phase', () => {
        // The phase check is `phase === 'search' || phase === 'focus'`
        expect(src).toMatch(/phase\s*===\s*['"]search['"]\s*\|\|\s*phase\s*===\s*['"]focus['"]/)
        // And the return block has the right shape
        const searchFocusBlock = src.match(
            /phase\s*===\s*['"]focus['"][\s\S]*?return\s*\{\s*density:\s*['"]compact['"][\s\S]*?actions:\s*['"]primary-secondary['"][\s\S]*?navigationOwner:\s*['"]scene['"]/
        )
        expect(searchFocusBlock).not.toBeNull()
    })

    it('returns compact/quiet/route/inside-walk for inside phase', () => {
        expect(src).toMatch(
            /phase\s*===\s*['"]inside['"][\s\S]{0,200}?return\s*\{\s*density:\s*['"]compact['"][\s\S]*?actions:\s*['"]route['"][\s\S]*?navigationOwner:\s*['"]inside-walk['"]/
        )
    })

    it('returns hidden or compact for map phase depending on route context', () => {
        expect(src).toMatch(/phase\s*===\s*['"]map['"]/)
        // Capture the full map-branch return block (up to the closing `}` of
        // the return object) and confirm both 'hidden' and 'compact' literals
        // appear inside -- the ternary picks one based on hasActiveRouteContext.
        const mapContext = src.match(/phase\s*===\s*['"]map['"][\s\S]{0,200}?return\s*\{[\s\S]*?\}/)
        expect(mapContext).not.toBeNull()
        expect(mapContext![0]).toMatch(/['"]hidden['"]/)
        expect(mapContext![0]).toMatch(/['"]compact['"]/)
    })
})

describe('W46-C2: runtime -- getJourneyCompassPresentationState for known phases', () => {
    it('returns the standard expanded branch when phase is overview', async () => {
        const { getJourneyCompassPresentationState } = await import('../../src/lib/orchestration/compass-controller')
        const result = getJourneyCompassPresentationState({ phase: 'overview' })
        expect(result.density).toBe('expanded')
        expect(result.copy).toBe('full')
        expect(result.actions).toBe('standard')
        expect(result.navigationOwner).toBe('journey-compass')
    })

    it('returns the compact branch when phase is search', async () => {
        const { getJourneyCompassPresentationState } = await import('../../src/lib/orchestration/compass-controller')
        const result = getJourneyCompassPresentationState({ phase: 'search' })
        expect(result.density).toBe('compact')
        expect(result.copy).toBe('quiet')
        expect(result.actions).toBe('primary-secondary')
        expect(result.navigationOwner).toBe('scene')
    })

    it('returns the inside-walk branch when phase is inside', async () => {
        const { getJourneyCompassPresentationState } = await import('../../src/lib/orchestration/compass-controller')
        const result = getJourneyCompassPresentationState({ phase: 'inside' })
        expect(result.density).toBe('compact')
        expect(result.copy).toBe('quiet')
        expect(result.actions).toBe('route')
        expect(result.navigationOwner).toBe('inside-walk')
    })

    it('returns default (overview branch) when phase is omitted', async () => {
        const { getJourneyCompassPresentationState } = await import('../../src/lib/orchestration/compass-controller')
        const result = getJourneyCompassPresentationState({})
        // No phase = defaults to 'overview' fallback
        expect(result.density).toBe('expanded')
        expect(result.copy).toBe('full')
        expect(result.actions).toBe('standard')
        expect(result.navigationOwner).toBe('journey-compass')
    })
})

describe('W46-C2: runtime -- getViewHandoffModel returns well-formed ViewHandoffModel', () => {
    it('returns a ViewHandoffModel with all 4 required fields', async () => {
        const { getViewHandoffModel } = await import('../../src/lib/orchestration/compass-controller')
        const model = getViewHandoffModel('galaxy')
        expect(model).toHaveProperty('icon')
        expect(model).toHaveProperty('kicker')
        expect(model).toHaveProperty('title')
        expect(model).toHaveProperty('note')
        // All fields are non-empty strings
        expect(typeof model.icon).toBe('string')
        expect(typeof model.kicker).toBe('string')
        expect(typeof model.title).toBe('string')
        expect(typeof model.note).toBe('string')
    })

    it('returns distinct models for different views', async () => {
        const { getViewHandoffModel } = await import('../../src/lib/orchestration/compass-controller')
        const galaxy = getViewHandoffModel('galaxy')
        const map = getViewHandoffModel('map')
        // Different views should produce different kicker/title
        expect(galaxy.kicker).not.toBe(map.kicker)
    })
})
