import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as focusPocket from '../../js/modules/focus-pocket.js';
import * as focusPocketGeometry from '../../js/modules/focus-pocket-geometry.js';
import { state, withStateMutation } from '../../js/state.js';
import * as threadInspector from '../../js/modules/thread-inspector.js';
import * as THREE from 'three';

vi.mock('../../js/modules/environment.js', () => ({
    getViewportSize: vi.fn(() => ({ width: 1024, height: 768 })),
    prefersReducedMotion: vi.fn(() => false),
    getLocation: vi.fn(() => ({ hostname: 'localhost', search: '', href: 'http://localhost/' })),
    requestAnimationFrame: vi.fn((cb) => setTimeout(cb, 16)),
    cancelAnimationFrame: vi.fn((id) => clearTimeout(id)),
    matchMedia: vi.fn(() => null),
    getComputedStyle: vi.fn(() => ({})),
    getCurrentUrl: vi.fn(() => 'http://localhost/'),
    isMobile: vi.fn(() => false),
    hasCoarsePointer: vi.fn(() => false),
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

vi.mock('../../js/modules/thread-inspector.js', () => ({
    getSemanticThreadCandidates: vi.fn(() => [])
}));

describe('focus-pocket', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        withStateMutation(() => {
            Object.assign(state, {
                camera: { position: new THREE.Vector3(0, 0, 10) },
                points: [
                    { city: 'Test City 1', cluster: 1 },
                    { city: 'Test City 1', cluster: 1 },
                    { city: 'Test City 2', cluster: 2 }
                ],
                originalPositions: [
                    { x: 0, y: 0, z: 0 },
                    { x: 1, y: 1, z: 1 },
                    { x: 2, y: 2, z: 2 }
                ],
                FOCUS_CONSTELLATION_MOTIFS: {
                    market: { seed: 0 },
                    rosette: { seed: 1 },
                    lattice: { seed: 2 },
                    delta: { seed: 3 },
                    civic: { seed: 4 }
                },
                navState: {
                    currentPersonality: null,
                    focusPocketIndices: [],
                    focusPocketRoleByIndex: new Map(),
                    focusPocketMeta: null
                },
                focusPocketMotionByIndex: new Map(),
                recentArrangements: []
            });
        });
    });

    it('buildFocusedSemanticPocket returns null when there are no candidates', () => {
        threadInspector.getSemanticThreadCandidates.mockReturnValue([]);
        const result = focusPocketGeometry.buildFocusedSemanticPocket(0);
        expect(result).toBeNull();
    });

    it('buildFocusedSemanticPocket returns pocket data when candidates exist', () => {
        threadInspector.getSemanticThreadCandidates.mockReturnValue([
            { index: 1, semanticScore: 0.9, relationshipRole: 'peer' },
            { index: 2, semanticScore: 0.8, relationshipRole: 'complement' }
        ]);

        const result = focusPocketGeometry.buildFocusedSemanticPocket(0);
        expect(result).not.toBeNull();
        expect(result.indices).toContain(0);
        expect(result.indices).toContain(1);
        expect(result.indices).toContain(2);
        expect(result.positions).toBeInstanceOf(Map);
        expect(result.motion).toBeInstanceOf(Map);
        expect(result.roles).toBeInstanceOf(Map);
        expect(result.meta).toBeDefined();
        expect(result.meta.active).toBe(true);
        expect(result.meta.nodeCount).toBe(3);
    });

    it('getFocusViewBasis calculates proper orthogonal basis', () => {
        const focusVector = new THREE.Vector3(0, 0, 0);
        const { viewVector, rightVector, upVector } = focusPocketGeometry.getFocusViewBasis(focusVector);
        
        expect(viewVector).toBeInstanceOf(THREE.Vector3);
        expect(rightVector).toBeInstanceOf(THREE.Vector3);
        expect(upVector).toBeInstanceOf(THREE.Vector3);
        
        // Vectors should be orthogonal (dot product ~ 0)
        expect(Math.abs(viewVector.dot(rightVector))).toBeLessThan(0.0001);
        expect(Math.abs(viewVector.dot(upVector))).toBeLessThan(0.0001);
        expect(Math.abs(rightVector.dot(upVector))).toBeLessThan(0.0001);
    });

    describe('API wrappers', () => {
        it('getFocusPocketIndices / setFocusPocketIndices work correctly', () => {
            expect(focusPocket.getFocusPocketIndices()).toEqual([]);
            withStateMutation(() => {
                focusPocket.setFocusPocketIndices([1, 2, 3]);
            });
            expect(focusPocket.getFocusPocketIndices()).toEqual([1, 2, 3]);
            withStateMutation(() => {
                focusPocket.clearFocusPocketIndices();
            });
            expect(focusPocket.getFocusPocketIndices()).toEqual([]);
        });

        it('getFocusPocketRoleByIndex / setFocusPocketRoleByIndex work correctly', () => {
            const initialRoleMap = focusPocket.getFocusPocketRoleByIndex();
            expect(initialRoleMap).toBeInstanceOf(Map);
            expect(initialRoleMap.size).toBe(0);

            withStateMutation(() => {
                focusPocket.setFocusPocketRoleForIndex(1, 'primary');
            });
            const updatedRoleMap = focusPocket.getFocusPocketRoleByIndex();
            expect(updatedRoleMap.get(1)).toBe('primary');

            withStateMutation(() => {
                focusPocket.clearFocusPocketRoleByIndex();
            });
            expect(focusPocket.getFocusPocketRoleByIndex().size).toBe(0);
        });

        it('getFocusPocketMotionByIndex / setFocusPocketMotionByIndex work correctly', () => {
            const initialMotionMap = focusPocket.getFocusPocketMotionByIndex();
            expect(initialMotionMap).toBeInstanceOf(Map);
            expect(initialMotionMap.size).toBe(0);

            withStateMutation(() => {
                focusPocket.setFocusPocketMotionForIndex(1, { role: 'primary' });
            });
            const updatedMotionMap = focusPocket.getFocusPocketMotionByIndex();
            expect(updatedMotionMap.get(1)).toEqual({ role: 'primary' });

            withStateMutation(() => {
                focusPocket.clearFocusPocketMotionByIndex();
            });
            expect(focusPocket.getFocusPocketMotionByIndex().size).toBe(0);
        });

        it('getFocusPocketMeta / setFocusPocketMeta work correctly', () => {
            expect(focusPocket.getFocusPocketMeta()).toBeNull();
            withStateMutation(() => {
                focusPocket.setFocusPocketMeta({ active: true });
            });
            expect(focusPocket.getFocusPocketMeta()).toEqual({ active: true });
        });
    });
});
