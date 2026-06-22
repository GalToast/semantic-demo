/**
 * three-engine API contract test
 * Ensures the public surface of three-engine.ts remains stable during refactor.
 */
import { describe, it, expect } from 'vitest'
import * as threeEngine from '../../src/lib/engine/three-engine'

describe('three-engine.ts public API contract', () => {
    const expectedFunctions = [
        'initThreeJS',
        'deinit',
        'animate',
        'onWindowResize',
        'cancelAnimate',
        'getSceneRenderableDiagnostics',
        'updateCameraViewportOffset',
        'updateMyceliumThreads',
        'applyMapFlatteningLayout',
        'triggerSearchHeroMoment',
        'triggerCorridorNodeGlow',
        'updateCorridorNodeGlow',
        'triggerSearchCorridorAnimation',
        'updateSearchCorridorAnimation',
        'disposeSearchCorridorAnimation',
        'updateInteractionVisuals',
        'disposeInteractionVisuals',
        'initSemanticLens',
        'initSemanticManifold',
        'shouldRenderThreads',
        'shouldRenderBridgeThreads',
        'createPoints',
        'createMycelium'
    ]

    expectedFunctions.forEach((name) => {
        it(`exports ${name} as a function`, () => {
            expect(typeof threeEngine[name as keyof typeof threeEngine]).toBe('function')
        })
    })

    it('exports SCENE_ATMOSPHERE as an object', () => {
        expect(typeof threeEngine.SCENE_ATMOSPHERE).toBe('object')
    })

    it('exports MYCELIUM_FIELD_SCALE as an object', () => {
        expect(typeof threeEngine.MYCELIUM_FIELD_SCALE).toBe('object')
    })

    // MYCELIUM_FIELD_SCALE verification using explicit key
    it('exports MYCELIUM_FIELD_SCALE with expected shape', () => {
        const scale = threeEngine.MYCELIUM_FIELD_SCALE as any
        expect(typeof scale).toBe('object')
        expect(typeof scale.x).toBe('number')
        expect(typeof scale.y).toBe('number')
        expect(typeof scale.z).toBe('number')
    })
})
