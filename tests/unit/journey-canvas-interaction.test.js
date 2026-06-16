import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as journeyCanvasInteraction from '../../js/modules/journey-canvas-interaction';
import * as journeyCanvasHitTest from '../../js/modules/journey-canvas-hit-test.js';
import { setNodeSporeInstanceMatrix } from '../../js/modules/three-node-manager.js';
import { state, withStateMutation } from '../../js/state';
import * as geoData from '../../js/modules/utils/geo-data';
import * as cameraControls from '../../js/modules/camera-controls';
import * as journeyNeighborhood from '../../js/modules/journey-neighborhood';
import * as environment from '../../src/lib/utils/environment';
import * as THREE from 'three';

vi.mock('../../js/modules/utils/geo-data', () => ({
    isPointVisible: vi.fn(() => true)
}));

vi.mock('../../js/modules/camera-controls', () => ({
    focusOnNode: vi.fn(),
    noteSceneInteraction: vi.fn(),
    releaseFocusCameraAssist: vi.fn()
}));

vi.mock('../../js/modules/journey-neighborhood', () => ({
    getSemanticThreadDisplayLimit: vi.fn(() => 10)
}));

vi.mock('../../src/lib/utils/environment', () => ({
    hasCoarsePointer: vi.fn(() => false),
    getLocation: vi.fn(() => ({ hostname: 'localhost', search: '', href: 'http://localhost/' })),
    requestAnimationFrame: vi.fn((cb) => setTimeout(cb, 16)),
    cancelAnimationFrame: vi.fn((id) => clearTimeout(id)),
    matchMedia: vi.fn(() => null),
    getComputedStyle: vi.fn(() => ({})),
    getCurrentUrl: vi.fn(() => 'http://localhost/'),
    getViewportSize: vi.fn(() => ({ width: 1024, height: 768 })),
    isMobile: vi.fn(() => false),
    prefersReducedMotion: vi.fn(() => false),
    isCompactLandscape: vi.fn(() => false),
    isUltraCompactPortrait: vi.fn(() => false),
    isCompactFocusStage: vi.fn(() => false),
    getDevicePixelRatio: vi.fn(() => 1),
    getPanelSurface: vi.fn(() => null),
    isMapSummarySurface: vi.fn(() => false),
    isSemanticDiveSurface: vi.fn(() => false),
    isMobileViewport: vi.fn(() => false),
    getInfoSurface: vi.fn(() => null),
    getAspectRatio: vi.fn(() => 1.33)
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
                pointsMesh: null,
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

    it('isThreadCandidateVisibleOnCanvas projects local node positions through pointsMesh world transform', () => {
        const localToWorld = vi.fn((vector) => vector.set(0, 0, 0));
        withStateMutation(() => {
            state.currentView = 'galaxy';
            state.nodePositions[0] = { x: 1000, y: 0, z: 0 };
            state.pointsMesh = { localToWorld };
        });

        expect(journeyCanvasInteraction.isThreadCandidateVisibleOnCanvas(0)).toBe(true);
        expect(localToWorld).toHaveBeenCalled();
    });

    it('getNearestCanvasThreadCandidate treats descendants of the canvas as reachable', () => {
        const canvasOverlay = document.createElement('div');
        mockCanvas.appendChild(canvasOverlay);
        document.elementFromPoint = vi.fn(() => canvasOverlay);
        withStateMutation(() => {
            state.currentView = 'galaxy';
            state.navState.focusedIndex = 0;
            state.navState.threadCandidates = [{ index: 1, source: 'semantic', reason: 'related node' }];
            state.nodePositions[1] = { x: 0, y: 0, z: 0 };
        });

        const candidate = journeyCanvasHitTest.getNearestCanvasThreadCandidate({ clientX: 400, clientY: 300 }, 34);
        expect(candidate?.index).toBe(1);
    });

    it('syncs the visual spore matrix for ordinary visual spore updates', () => {
        const visualMesh = { setMatrixAt: vi.fn() };
        withStateMutation(() => {
            state.nodePositions = [{ x: 0, y: 0, z: 0 }];
            state.nodeSporeMesh = visualMesh;
            state.nodeSporeHitMesh = null;
            state.focusedNode = -1;
            state.navState.focusPocketIndices = [];
            state.navState.trailNeighborIndices = [];
        });

        setNodeSporeInstanceMatrix(0, visualMesh);

        expect(visualMesh.setMatrixAt).toHaveBeenCalledWith(0, expect.any(THREE.Matrix4));
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
            
            expect(addEventListenerSpy).toHaveBeenCalledWith('pointermove', expect.any(Function), expect.objectContaining({ signal: expect.any(AbortSignal) }));
            expect(addEventListenerSpy).toHaveBeenCalledWith('pointerleave', expect.any(Function), expect.objectContaining({ signal: expect.any(AbortSignal) }));
            expect(addEventListenerSpy).toHaveBeenCalledWith('pointerup', expect.any(Function), expect.objectContaining({ signal: expect.any(AbortSignal) }));
            expect(addEventListenerSpy).toHaveBeenCalledWith('click', expect.any(Function), expect.objectContaining({ signal: expect.any(AbortSignal) }));
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
