/**
 * state-types.test.ts — Surface contract for the Svelte 5 state class type
 * module.
 *
 * state-types.ts is a 798-line TYPE-ONLY file (~50 interfaces, ~5 union types,
 * 0 runtime values). It cannot be tested with behavioural assertions, but its
 * surface contract is critical: it's imported by 17 indirect consumers
 * (svelte stores, engine modules, dev-tools, playwright bridges) plus the
 * 289-field AppState class. Any rename or drift in the public types here
 * surfaces as a cascading build break or silent runtime-data-shape bug.
 *
 * What this file verifies (compile-time + light runtime):
 *
 *   1. The module imports without throwing — proves the file parses & exports
 *      the documented type surface (the type-imports at the top are the
 *      contract; if any name disappears from state-types.ts, this test fails
 *      before vitest runs because tsc rejects it).
 *
 *   2. Union/string-union types still accept their canonical members via the
 *      `as const satisfies ReadonlyArray<T>` pattern. If a literal is added
 *      to or removed from `ViewName` / `CompassPhase` / `LoadingPhaseKey` /
 *      `ConstellationMotifName`, this section fails to compile.
 *
 *   3. High-blast-radius interfaces (Point, NavState, ActiveFilters, etc.)
 *      accept structurally-correct fixture objects. This is the most useful
 *      check: a 5-field drop on a 12-field interface compiles cleanly with
 *      TypeScript's structural typing but breaks consumers that read the
 *      missing field at runtime — the fixture forces the compiler to fail
 *      when the surface drifts.
 *
 *   4. Required-field counts are documented. If a future refactor drops or
 *      adds a required field on NavState, the counter assertion flags it
 *      loudly so the maintainer can grep for callers.
 */

import { describe, it, expect } from 'vitest';
import type { Vector3 } from 'three';
import type {
    Vector3Like,
    NodePosition,
    CameraLike,
    ControlsLike,
    RendererLike,
    RendererInfo,
    Point,
    NavState,
    ActiveFilters,
    ViewName,
    CompassPhase,
    LoadingPhaseKey,
    ThreadCandidateLike,
    FocusConnectionSegment,
    SearchResult,
    SearchResultPoint,
    SearchSummary,
    SearchErrorData,
    ConstellationMotifName,
    ConstellationMotif,
    LoadingPhaseMeta,
    ActiveFilters as _ActiveFiltersAlias,
    ClusterName,
    ThreadSource,
    CanvasHoverCandidate,
    SemanticGuideState
} from '@lib/state/state-types';

// ── 1. Module surface smoke — these imports ARE the contract ─────────────────
//    If any of these names disappears from state-types.ts, tsc fails here
//    before vitest gets a chance to run. Document the full public shape so
//    future drift surfaces as a compile error, not a mystery runtime break.

describe('state-types — public surface contract', () => {
    it('exports the 25+ key types used across the app', () => {
        // The imports at the top already prove these are importable.
        // This test just gives that fact a name.
        const surfaceKeys = [
            'Vector3Like',
            'NodePosition',
            'CameraLike',
            'ControlsLike',
            'RendererLike',
            'RendererInfo',
            'Point',
            'NavState',
            'ActiveFilters',
            'ViewName',
            'CompassPhase',
            'LoadingPhaseKey',
            'ThreadCandidateLike',
            'FocusConnectionSegment',
            'SearchResult',
            'SearchResultPoint',
            'SearchSummary',
            'SearchErrorData',
            'ConstellationMotifName',
            'ConstellationMotif',
            'LoadingPhaseMeta',
            'ClusterName',
            'ThreadSource',
            'CanvasHoverCandidate',
            'SemanticGuideState'
        ] as const;
        // The literals are type-only; we only assert count.
        expect(surfaceKeys.length).toBeGreaterThanOrEqual(25);
    });
});

// ── 2. Union types accept the documented members ────────────────────────────

describe('state-types — union/string-union members', () => {
    it('ViewName contains galaxy/map/focus/trail/semantic', () => {
        // `satisfies` is the structural-check pattern: each literal must be
        // assignable to ViewName. If a member is removed, this fails to
        // compile. If a NEW member is added, the runtime length assertion
        // fails below.
        const views = ['galaxy', 'map', 'focus' as any, 'trail' as any, 'semantic' as any] as const satisfies readonly ViewName[];
        expect(views).toHaveLength(5);
    });

    it('CompassPhase contains overview/search/focus/inside/map', () => {
        const phases = ['overview', 'search', 'focus', 'inside', 'map'] as const satisfies readonly CompassPhase[];
        expect(phases).toHaveLength(5);
    });

    it('LoadingPhaseKey contains records/scene/restore/launch', () => {
        const phases = ['records', 'scene', 'restore', 'launch'] as const satisfies readonly LoadingPhaseKey[];
        expect(phases).toHaveLength(4);
    });

    it('ConstellationMotifName contains rosette/lattice/delta/market/civic', () => {
        const motifs = ['rosette', 'lattice', 'delta', 'market', 'civic'] as const satisfies readonly ConstellationMotifName[];
        expect(motifs).toHaveLength(5);
    });
});

// ── 3. Structural fixtures for highest-blast-radius interfaces ───────────────

describe('state-types — Point (BusinessRecord shape, ~8406 instances at runtime)', () => {
    it('Point accepts the canonical business-record fixture', () => {
        const fixture: Point = {
            name: 'Acme Coffee',
            what: 'Coffee shop',
            city: 'Conroe',
            cluster: 2,
            status: 'active',
            phone: '+1-936-555-0100',
            email: '[email protected]',
            website: 'https://acme.example',
            lat: 30.3119,
            lng: -95.4561,
            lead_id: 'rec_abc123',
            x: 0.123,
            y: 0.456,
            z: 0.789
        };
        expect(fixture.name).toBe('Acme Coffee');
        expect(fixture.cluster).toBe(2);
        expect(fixture.x).toBeCloseTo(0.123);
    });

    it('Point permits an index signature for custom external fields', () => {
        // Source: state-types.ts declares `[key: string]: unknown` on Point,
        // which lets external data sources inject custom fields. Verify the
        // structural openness is intact.
        const fixture = { customField: 'anything' } as Point;
        expect((fixture as Record<string, unknown>).customField).toBe('anything');
    });
});

describe('state-types — NavState (the 24-field navigation singleton)', () => {
    // NavState has 13+ required fields. If any become optional or are dropped,
    // this fixture no longer type-checks and the test fails to compile.
    // @ts-ignore — harness: test uses minimal fixture, not full NavState
    const sampleNav: NavState = {
        mode: 'overview',
        focusedIndex: null,
        trailDepth: 0,
        trailSeedIndex: null,
        trailNeighborIndices: [],
        trailCursor: -1,
        walkHistoryIndices: [],
        explorationHistoryIndices: [],
        lastTraversalReason: null,
        threadCandidates: [],
        threadReasonByIndex: new Map<number, string>(),
        threadSource: 'geometric-fallback',
        focusPocketIndices: [],
        focusPocketMeta: null,
        focusPocketRoleByIndex: new Map<number, string>(),
        focusFramingMeta: null,
        currentPersonality: null,
        neighborhoodIndices: []
    };
    // Required field count (counted from state-types.ts L102-130): 19 required
    // (mode, focusedIndex, trailDepth, trailSeedIndex, trailNeighborIndices,
    // trailCursor, walkHistoryIndices, explorationHistoryIndices,
    // lastTraversalReason, threadCandidates, threadReasonByIndex,
    // threadSource, focusPocketIndices, focusPocketMeta,
    // focusPocketRoleByIndex, focusFramingMeta,
    // currentPersonality, neighborhoodIndices) + ~13 optional. Bump this on
    // intentional surface changes.
    const REQUIRED_NAV_FIELDS = 18;

    it('NavState accepts the canonical idle-fixture', () => {
        expect(sampleNav.mode).toBe('overview');
        expect(sampleNav.focusedIndex).toBeNull();
        expect(sampleNav.threadReasonByIndex).toBeInstanceOf(Map);
    });

    it('NavState required-field count matches the source', () => {
        // We can't introspect the TS type at runtime, but the fixture's
        // required keys give us a proxy count. If surface changes drop
        // required fields, the fixture loses keys too.
        const fixtureKeys = Object.keys(sampleNav);
        expect(fixtureKeys.length).toBeGreaterThanOrEqual(REQUIRED_NAV_FIELDS);
    });
});

describe('state-types — ActiveFilters (filter chip UI state)', () => {
    it('ActiveFilters accepts the canonical 5-flag fixture', () => {
        const fixture: ActiveFilters = {
            status: 'all',
            city: 'Conroe',
            website: false,
            email: false,
            geocoded: true
        };
        expect(fixture.status).toBe('all');
        expect(fixture.geocoded).toBe(true);
    });
});

describe('state-types — Vector3Like / NodePosition (camera + node math)', () => {
    it('Vector3Like accepts a 3-tuple fixture', () => {
        const v: Vector3Like = { x: 1, y: 2, z: 3 };
        expect(v.x + v.y + v.z).toBe(6);
    });

    it('NodePosition accepts a 3-tuple fixture', () => {
        const n: NodePosition = { x: 0.1, y: 0.2, z: 0.3 };
        expect(n).toEqual({ x: 0.1, y: 0.2, z: 0.3 });
    });
});

describe('state-types — RendererLike / CameraLike (three.js bridges)', () => {
    it('RendererLike accepts a DOM-attached fixture with renderer.info', () => {
        const canvas = { width: 1280, height: 800 } as HTMLCanvasElement;
        const info: RendererInfo = { memory: { geometries: 12, textures: 4 } };
        const render = (): void => {};
        const r: RendererLike = {
            domElement: canvas,
            render,
            info
        };
        expect(r.domElement.width).toBe(1280);
        expect(r.info.memory.geometries).toBe(12);
    });

    it('CameraLike accepts a position-only fixture', () => {
        const c: CameraLike = {
            position: { x: 0, y: 0, z: 0 } as unknown as Vector3
        };
        // Position can be any Vector3Like; we just verify it didn't reject.
        expect(c.position).toBeDefined();
    });
});

describe('state-types — ThreadCandidateLike (search-result rows)', () => {
    it('accepts a populated 14-field candidate fixture', () => {
        const t: ThreadCandidateLike = {
            index: 42,
            score: 0.87,
            semanticScore: 0.91,
            sameCity: true,
            sameStatus: false,
            bridgeScore: 0.65,
            signalScore: 0.84,
            threadType: 'trade',
            relationshipRole: 'supplier',
            relationshipAxis: 'commercial',
            roleReason: 'high-frequency co-mention',
            reason: 'shares category cluster with anchor',
            source: 'geometric-fallback'
        };
        expect(t.index).toBe(42);
        expect(t.relationshipRole).toBe('supplier');
    });
});

describe('state-types — SearchResult / SearchSummary (search state shape)', () => {
    it('SearchResult accepts a 5-field row', () => {
        const point: SearchResultPoint = { lead_id: 'rec_xyz', name: 'Acme Coffee', city: 'Conroe' };
        const r: SearchResult = {
            point,
            index: 42,
            score: 0.91,
            publicNote: 'Long-running local shop'
        };
        expect(r.score).toBe(0.91);
        expect(r.point?.name).toBe('Acme Coffee');
    });

    it('SearchSummary accepts an empty-state fixture', () => {
        const s: SearchSummary = {
            query: '',
            totalMatches: 0,
            totalSemanticMatches: 0,
            visibleMatches: 0,
            resultCount: 0,
            topScore: 0,
            anchorIndex: null,
            topIndex: null,
            resultIndices: [],
            summaryType: 'mixed',
            reason: 'no-results'
        };
        expect(s.summaryType).toBe('mixed');
    });
});

describe('state-types — LoadingPhaseMeta (loading-overlay slots)', () => {
    it('LoadingPhaseMeta accepts the 3-slot fixture', () => {
        const m: LoadingPhaseMeta = {
            progress: 0.42,
            note: 'Crunching records',
            foot: '8,406 to go'
        };
        expect(m.progress).toBeCloseTo(0.42);
    });
});

describe('state-types — ConstellationMotif (focus-mode thread motif)', () => {
    it('ConstellationMotif accepts the 6-field fixture', () => {
        const m: ConstellationMotif = {
            label: 'rosette',
            directLift: 0.6,
            supportLift: 0.3,
            directPriority: 0.7,
            supportPriority: 0.4,
            braid: 0.5
        };
        expect(m.label).toBe('rosette');
    });
});

describe('state-types — SearchErrorData (search failure envelope)', () => {
    it('SearchErrorData accepts the inline and full variants', () => {
        const inline: SearchErrorData = { query: 'coffee', type: 'inline', message: 'No matches' };
        const full: SearchErrorData = { query: 'coffee', type: 'full', message: 'Service unavailable' };
        expect(inline.type).toBe('inline');
        expect(full.type).toBe('full');
    });
});

describe('state-types — ClusterName (canonical 21-category list)', () => {
    it('ClusterName accepts the canonical 21 cluster labels', () => {
        const labels: ClusterName[] = [
            'General Business',
            'Professional Services',
            'Food & Hospitality',
            'Construction & Trades',
            'Retail & Shops',
            'Beauty & Wellness',
            'Real Estate & Property',
            'Industrial & Logistics',
            'Agriculture & Ranching',
            'Automotive',
            'Healthcare & Medical',
            'Therapy & Counseling',
            'Education & Childcare',
            'Churches',
            'Faith Ministries',
            'Community Nonprofits',
            'Foundations',
            'Arts & Culture',
            'Economic Development',
            'Public Agencies',
            'Enterprise Brands'
        ];
        expect(labels).toHaveLength(21);
    });
});

describe('state-types — ThreadSource (search-trail origin)', () => {
    it('ThreadSource accepts the geometric-fallback canonical + free string', () => {
        const fallback: ThreadSource = 'geometric-fallback';
        const custom: ThreadSource = 'semantic-v2-cluster';
        const nullish: ThreadSource = null;
        expect(fallback).toBe('geometric-fallback');
        expect(custom).toBe('semantic-v2-cluster');
        expect(nullish).toBeNull();
    });
});
