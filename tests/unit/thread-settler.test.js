import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as threadSettler from '../../js/modules/journey-thread-settler.js';
import { state, withStateMutation } from '../../js/state.js';

vi.mock('../../js/modules/utils/dom-formatters.js', () => ({
    formatBusinessName: vi.fn((v) => v || 'Unknown'),
    cleanOptionalValue: vi.fn((v) => v || ''),
    stripTerminalPunctuation: vi.fn((v) => (v || '').replace(/[.!?]+$/, ''))
}));

vi.mock('../../js/modules/utils/geo-data.js', () => ({
    normalizeCityForFilter: vi.fn((v) => (v || '').toLowerCase().trim()),
    isPointVisible: vi.fn(() => true)
}));

vi.mock('../../js/modules/camera-controls.js', () => ({
    focusOnNode: vi.fn()
}));

vi.mock('../../js/modules/lifecycle.js', () => ({
    dispatchNavTransition: vi.fn(),
    focusOnPoint: vi.fn(),
    updateJourneyCompass: vi.fn()
}));

vi.mock('../../js/modules/thread-inspector.js', () => ({
    syncInspectedStrandOverlay: vi.fn()
}));

vi.mock('../../js/modules/ui-feedback.js', () => ({
    showExperienceToast: vi.fn()
}));

vi.mock('../../js/modules/semantic-dive-ui.js', () => ({
    syncSemanticDiveUi: vi.fn()
}));

vi.mock('../../js/modules/journey-text-helpers.js', () => ({
    truncateMicrocopy: vi.fn((v) => v || ''),
    getSharedTrailTopicLabel: vi.fn(() => '')
}));

vi.mock('../../js/modules/strand-continuity.js', () => ({
    setStrandContinuityState: vi.fn(),
    clearStrandContinuityState: vi.fn()
}));

vi.mock('../../js/modules/relationship-roles.js', () => ({
    getRelationshipRoleLabel: vi.fn((role) => role || 'connection'),
    describeRelationshipRoleReason: vi.fn((role, reason) => reason || ''),
    normalizeRelationshipRole: vi.fn((v) => v || '')
}));

vi.mock('../../js/modules/journey-neighborhood.js', () => ({
    getCurrentTrailFocusIndex: vi.fn(() => 0),
    isBoundedNeighborhoodActive: vi.fn(() => false),
    primeBoundedSemanticNeighborhoodForTraversal: vi.fn(() => true),
    getBoundedNeighborhoodWalkCandidate: vi.fn(() => null),
    getNextWalkCandidateForIndex: vi.fn(() => null)
}));

vi.mock('../../js/modules/journey-selected-card.js', () => ({
    syncFocusStage: vi.fn()
}));

describe('journey-thread-settler', () => {
    beforeEach(() => {
        vi.clearAllMocks();

        // Set up DOM for thread inspector rendering
        document.body.innerHTML = `
            <div id="focus-thread-inspector">
                <div id="focus-thread-inspector-title"></div>
                <div id="focus-thread-inspector-copy"></div>
                <div id="focus-thread-inspector-meta"></div>
                <button id="btn-thread-pin"></button>
                <button id="btn-thread-follow"></button>
                <button id="btn-thread-clear"></button>
            </div>
        `;
        document.body.dataset.threadInspectSurface = 'idle';

        // Use fake timers so we can test delayed transitions
        threadSettler.initJourneyTimerAdapter({
            setTimer: vi.fn((fn, delay) => setTimeout(fn, delay)),
            clearTimer: vi.fn((id) => clearTimeout(id))
        });

        withStateMutation(() => {
            Object.assign(state, {
                currentView: 'galaxy',
                points: [
                    { name: 'Coffee Shop', city: 'Conroe', cluster: 1 },
                    { name: 'Bakery', city: 'The Woodlands', cluster: 2 },
                    { name: 'Auto Repair', city: 'Conroe', cluster: 3 }
                ],
                navState: {
                    focusedIndex: 0,
                    threadCandidates: [
                        { index: 1, reason: 'shared sector', source: 'semantic', relationshipRole: 'peer' },
                        { index: 2, reason: 'same city', source: 'semantic', sameCity: true }
                    ],
                    trailNeighborIndices: [1, 2],
                    walkHistoryIndices: [0],
                    threadSource: 'semantic',
                    mode: 'trail',
                    trailCursor: 0,
                    focusPocketRoleByIndex: new Map(),
                    lastTraversalReason: ''
                },
                strandContinuityState: { phase: 'idle' },
                inspectedThreadIndex: null,
                pinnedThreadIndex: null,
                inspectedStrandDiagnostics: {
                    active: false,
                    source: 'none',
                    segmentCount: 0,
                    braidCount: 0,
                    endpointCount: 0
                },
                threadInspectorPointerInside: false,
                canvasThreadInspectionClearTimer: null,
                semanticDiveMode: false
            });
        });
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });



    describe('summarizeNeighborReason', () => {
        it('returns cleaned reason when provided', () => {
            const candidate = { reason: 'shared sector', source: 'semantic' };
            const result = threadSettler.summarizeNeighborReason(candidate, state.points[1], state.points[0]);
            expect(result).toBeTruthy();
            expect(typeof result).toBe('string');
        });

        it('returns "Linked stop" when no reason and semantic source', () => {
            withStateMutation(() => {
                state.navState.threadSource = 'semantic';
            });
            const result = threadSettler.summarizeNeighborReason({}, null, null);
            expect(result).toBe('Linked stop');
        });

        it('returns "Nearby cloud stop" when no reason and non-semantic source', () => {
            withStateMutation(() => {
                state.navState.threadSource = 'cloud';
            });
            const result = threadSettler.summarizeNeighborReason({}, null, null);
            expect(result).toBe('Nearby cloud stop.');
        });
    });


    describe('getInsideRelationshipLabel', () => {
        it('returns role label when relationshipRole is set', () => {
            const result = threadSettler.getInsideRelationshipLabel(
                { relationshipRole: 'core_peer' },
                state.points[1],
                state.points[0]
            );
            expect(result).toBe('core_peer');
        });

        it('returns fallback when no role provided', () => {
            withStateMutation(() => {
                state.navState.threadSource = 'semantic';
            });
            const result = threadSettler.getInsideRelationshipLabel(
                { source: 'semantic' },
                state.points[1],
                state.points[0]
            );
            expect(result).toBe('related connection');
        });
    });
});
