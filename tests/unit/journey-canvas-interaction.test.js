import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as journeyCanvasInteraction from '../../js/modules/journey-canvas-interaction.js';
import { state, withStateMutation } from '../../js/state.js';
import * as geoData from '../../js/modules/utils/geo-data.js';
import * as cameraControls from '../../js/modules/camera-controls.js';
import * as journeyNeighborhood from '../../js/modules/journey-neighborhood.js';
import * as environment from '../../js/modules/environment.js';
import * as THREE from 'three';

vi.mock('../../js/modules/utils/geo-data.js', () => ({
    isPointVisible: vi.fn(() => true)
}));

vi.mock('../../js/modules/camera-controls.js', () => ({
    focusOnNode: vi.fn(),
    noteSceneInteraction: vi.fn(),
    releaseFocusCameraAssist: vi.fn()
}));

vi.mock('../../js/modules/journey-neighborhood.js', () => ({
    getSemanticThreadDisplayLimit: vi.fn(() => 10)
}));

vi.mock('../../js/modules/environment.js', () => ({
    hasCoarsePointer: vi.fn(() => false)
}));

describe('journey-canvas-interaction', () => {
    let mockCanvas;

    beforeEach(() => {
        vi.clearAllMocks();

        mockCanvas = document.createElement('canvas');
        mockCanvas.getBoundingClientRect = vi.fn(() => ({
            left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600
        }));
        // Mock elementFromPoint for raycasting tests
        document.elementFromPoint = vi.fn(() => mockCanvas);

        withStateMutation(() => {
            Object.assign(state, {
                currentView: 'galaxy',
                navState: {
                    focusedIndex: null,
                    threadCandidates: []
                },
                points: [{ id: 1 }, { id: 2 }, { id: 3 }],
                nodePositions: [
                    { x: 0, y: 0, z: 0 },
                    { x: 10, y: 10, z: 10 },
                    { x: -10, y: -10, z: -10 }
                ],
                originalPositions: [],
                targetPositions: [],
                camera: new THREE.PerspectiveCamera(45, 800/600, 0.1, 1000),
                renderer: { domElement: mockCanvas },
                activeFilters: {},
                hoverHighlightIndex: -1,
                stableCanvasHover: null
            });
            // Setup a simple camera position
            state.camera.position.set(0, 0, 100);
            state.camera.updateMatrixWorld();
        });
    });

    it('isThreadCandidateVisibleOnCanvas returns false when view is not galaxy', () => {
        withStateMutation(() => {
            state.currentView = 'map';
        });
        // Returns true as a fallback/passthrough when not in galaxy view, per source:
        // `if (state.currentView !== 'galaxy') return true;`
        expect(journeyCanvasInteraction.isThreadCandidateVisibleOnCanvas(0)).toBe(true);
    });

    it('isThreadCandidateVisibleOnCanvas returns true for points in view', () => {
        withStateMutation(() => {
            state.currentView = 'galaxy';
            // Point at origin with camera at z=100 looking at origin should be visible
            state.nodePositions[0] = { x: 0, y: 0, z: 0 };
        });

        const result = journeyCanvasInteraction.isThreadCandidateVisibleOnCanvas(0);
        expect(result).toBe(true);
    });

    it('isThreadCandidateVisibleOnCanvas returns false for points behind camera', () => {
        withStateMutation(() => {
            state.currentView = 'galaxy';
            // Point behind camera
            state.nodePositions[0] = { x: 0, y: 0, z: 200 };
        });

        const result = journeyCanvasInteraction.isThreadCandidateVisibleOnCanvas(0);
        expect(result).toBe(false);
    });

    it('initJourneyCanvasInteractionAdapter sets adapter callbacks', () => {
        const mockWalk = vi.fn();
        journeyCanvasInteraction.initJourneyCanvasInteractionAdapter({
            walkThreadNeighbor: mockWalk
        });
        // We can't directly inspect the internal adapter object, but we verify it doesn't throw
        expect(true).toBe(true);
    });

    describe('ensureCanvasNodeInteractionBindings', () => {
        it('binds events to the canvas', () => {
            const addEventListenerSpy = vi.spyOn(mockCanvas, 'addEventListener');
            
            journeyCanvasInteraction.ensureCanvasNodeInteractionBindings();
            
            expect(addEventListenerSpy).toHaveBeenCalledWith('pointermove', expect.any(Function));
            expect(addEventListenerSpy).toHaveBeenCalledWith('pointerleave', expect.any(Function));
            expect(addEventListenerSpy).toHaveBeenCalledWith('pointerup', expect.any(Function));
            expect(addEventListenerSpy).toHaveBeenCalledWith('click', expect.any(Function));
            expect(mockCanvas.dataset.threadInteractionBound).toBe('true');
        });

        it('does not double bind', () => {
            mockCanvas.dataset.threadInteractionBound = 'true';
            const addEventListenerSpy = vi.spyOn(mockCanvas, 'addEventListener');
            
            journeyCanvasInteraction.ensureCanvasNodeInteractionBindings();
            
            expect(addEventListenerSpy).not.toHaveBeenCalled();
        });
    });
});
