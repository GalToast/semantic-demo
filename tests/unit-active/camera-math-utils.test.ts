// @ts-ignore
import { describe, it, expect } from 'vitest'
import { Vector3 } from 'three'
import { computeTravelVectorHeading, computeOrbitBiasHeading, computeCameraArcControlPoints } from '../../src/lib/utils/camera-math-utils'

describe('camera-math-utils', () => {
    describe('computeTravelVectorHeading', () => {
        it('handles undefined travelVector safely (H1 regression)', () => {
            const focusTarget = new Vector3(0, 0, 0)
            const currentHeading = new Vector3(0, 0, 1)
            const transitionStyle = 'walk'
            const framing = {} // No travelVector
            
            // Should not throw - this is the H1 bug fix
            const result = computeTravelVectorHeading(focusTarget, currentHeading, transitionStyle, framing)
            
            expect(result).toBeDefined()
            expect(result.focusTarget).toBeInstanceOf(Vector3)
            expect(result.heading).toBeInstanceOf(Vector3)
            // With no travelVector, should return original values
            expect(result.focusTarget.equals(focusTarget)).toBe(true)
            expect(result.heading.equals(currentHeading)).toBe(true)
        })

        it('applies travelVector correctly when defined', () => {
            const focusTarget = new Vector3(0, 0, 0)
            const currentHeading = new Vector3(0, 0, 1)
            const transitionStyle = 'walk'
            const travelVector = new Vector3(1, 0, 0)
            const framing = { travelVector }
            
            const result = computeTravelVectorHeading(focusTarget, currentHeading, transitionStyle, framing)
            
            expect(result).toBeDefined()
            expect(result.focusTarget).toBeInstanceOf(Vector3)
            expect(result.heading).toBeInstanceOf(Vector3)
            // Should have modified values due to travelVector
            expect(result.focusTarget.equals(focusTarget)).toBe(false)
        })

        it('handles different transition styles', () => {
            const focusTarget = new Vector3(0, 0, 0)
            const currentHeading = new Vector3(0, 0, 1)
            const travelVector = new Vector3(1, 0, 0)
            const framing = { travelVector }
            
            const styles = ['walk', 'dive', 'dive-walk']
            for (const style of styles) {
                const result = computeTravelVectorHeading(focusTarget, currentHeading, style, framing)
                expect(result).toBeDefined()
                expect(result.focusTarget).toBeInstanceOf(Vector3)
                expect(result.heading).toBeInstanceOf(Vector3)
            }
        })

        it('handles zero-length travelVector', () => {
            const focusTarget = new Vector3(0, 0, 0)
            const currentHeading = new Vector3(0, 0, 1)
            const transitionStyle = 'walk'
            const travelVector = new Vector3(0, 0, 0) // Zero vector
            const framing = { travelVector }
            
            const result = computeTravelVectorHeading(focusTarget, currentHeading, transitionStyle, framing)
            
            // Should return original values when travelVector has zero length
            expect(result.focusTarget.equals(focusTarget)).toBe(true)
            expect(result.heading.equals(currentHeading)).toBe(true)
        })
    })

    describe('computeOrbitBiasHeading', () => {
        it('computes orbit bias for different pocket profiles', () => {
            const currentHeading = new Vector3(0, 0, 1)
            const transitionStyle = 'walk'
            
            const profiles = [
                { key: 'roomy' },
                { key: 'compact' },
                { key: 'condensed' },
                { key: 'default' }
            ]
            
            for (const profile of profiles) {
                const result = computeOrbitBiasHeading(currentHeading, transitionStyle, profile)
                expect(result).toBeDefined()
                expect(result.heading).toBeInstanceOf(Vector3)
                // stageRightVector may be null for some configurations
                if (result.stageRightVector) {
                    expect(result.stageRightVector).toBeInstanceOf(Vector3)
                }
            }
        })
    })

    describe('computeCameraArcControlPoints', () => {
        it('computes control points for camera arc', () => {
            const startPos = new Vector3(0, 0, 10)
            const startTarget = new Vector3(0, 0, 0)
            const desiredCamPos = new Vector3(5, 5, 10)
            const focusTarget = new Vector3(2, 2, 0)
            const currentHeading = new Vector3(0, 0, -1)
            const distance = 10
            const transitionStyle = 'search'
            const personality = { cameraArc: 'wide' }
            const pocketProfile = { key: 'roomy' }
            const stageRightVector = new Vector3(1, 0, 0)
            
            const result = computeCameraArcControlPoints(
                startPos, startTarget, desiredCamPos, focusTarget, currentHeading,
                distance, transitionStyle, personality, pocketProfile, stageRightVector
            )
            
            expect(result).toBeDefined()
            expect(result.cameraControlPoint).toBeInstanceOf(Vector3)
            expect(result.targetControlPoint).toBeInstanceOf(Vector3)
        })
    })
})