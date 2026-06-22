import { describe, it, expect } from 'vitest'
import {
    parseFiniteNumber,
    easeInOutSine,
    easeInOutCubic,
    quadraticBezierComponent,
    easeOutBack,
    easeOutQuint,
    clampNumber
} from '../../src/lib/utils/math-easing'
import { Vec3, Color, Box3, clamp, lerp } from '../../src/lib/utils/math-vec3'

describe('math-easing', () => {
    it('parseFiniteNumber returns null for null/undefined/empty', () => {
        expect(parseFiniteNumber(null)).toBeNull()
        expect(parseFiniteNumber(undefined)).toBeNull()
        expect(parseFiniteNumber('')).toBeNull()
    })

    it('parseFiniteNumber returns number for valid inputs', () => {
        expect(parseFiniteNumber('42')).toBe(42)
        expect(parseFiniteNumber(3.14)).toBe(3.14)
        expect(parseFiniteNumber('0')).toBe(0)
    })

    it('parseFiniteNumber returns null for non-finite values', () => {
        expect(parseFiniteNumber('abc')).toBeNull()
        expect(parseFiniteNumber(NaN)).toBeNull()
        expect(parseFiniteNumber(Infinity)).toBeNull()
    })

    it('easeInOutSine returns 0 at t=0 and 1 at t=1', () => {
        expect(easeInOutSine(0)).toBeCloseTo(0, 5)
        expect(easeInOutSine(1)).toBeCloseTo(1, 5)
        expect(easeInOutSine(0.5)).toBeCloseTo(0.5, 1)
    })

    it('easeInOutCubic returns 0 at t=0 and 1 at t=1', () => {
        expect(easeInOutCubic(0)).toBe(0)
        expect(easeInOutCubic(1)).toBe(1)
    })

    it('easeOutBack returns 1 at t=1 and >1 during overshoot', () => {
        expect(easeOutBack(1)).toBe(1)
        expect(easeOutBack(0.8)).toBeGreaterThan(1)
    })

    it('easeOutQuint returns 0 at t=0 and 1 at t=1', () => {
        expect(easeOutQuint(0)).toBe(0)
        expect(easeOutQuint(1)).toBe(1)
    })

    it('quadraticBezierComponent computes quadraticBezier correctly', () => {
        expect(quadraticBezierComponent(0, 0.5, 1, 0)).toBe(0)
        expect(quadraticBezierComponent(0, 0.5, 1, 1)).toBe(1)
        expect(quadraticBezierComponent(0, 0.5, 1, 0.5)).toBe(0.5)
    })

    it('clampNumber constrains values', () => {
        expect(clampNumber(5, 0, 10)).toBe(5)
        expect(clampNumber(-1, 0, 10)).toBe(0)
        expect(clampNumber(15, 0, 10)).toBe(10)
    })
})

describe('math-vec3', () => {
    it('Vec3 constructor defaults to zero', () => {
        const v = new Vec3()
        expect(v.x).toBe(0)
        expect(v.y).toBe(0)
        expect(v.z).toBe(0)
    })

    it('Vec3 set updates components', () => {
        const v = new Vec3()
        v.set(1, 2, 3)
        expect(v.x).toBe(1)
        expect(v.y).toBe(2)
        expect(v.z).toBe(3)
    })

    it('Vec3 clone creates independent copy', () => {
        const v = new Vec3(1, 2, 3)
        const c = v.clone()
        expect(c.x).toBe(1)
        expect(c.y).toBe(2)
        expect(c.z).toBe(3)
        c.x = 10
        expect(v.x).toBe(1)
    })

    it('Vec3 length and normalization', () => {
        const v = new Vec3(3, 0, 0)
        expect(v.length()).toBe(3)
        v.normalize()
        expect(v.length()).toBeCloseTo(1, 5)
    })

    it('Vec3 crossVectors produces orthogonal result', () => {
        const v = new Vec3()
        v.crossVectors(new Vec3(1, 0, 0), new Vec3(0, 1, 0))
        expect(v.x).toBe(0)
        expect(v.y).toBe(0)
        expect(v.z).toBe(1)
    })

    it('Vec3 dot product_atomicute', () => {
        const a = new Vec3(1, 2, 3)
        const b = new Vec3(4, 5, 6)
        expect(a.dot(b)).toBe(32)
    })

    it('Vec3 distanceTo', () => {
        const a = new Vec3(1, 0, 0)
        const b = new Vec3(4, 0, 0)
        expect(a.distanceTo(b)).toBe(3)
    })

    it('Vec3 lerp interpolates correctly', () => {
        const a = new Vec3(0, 0, 0)
        a.lerp(new Vec3(10, 20, 30), 0.5)
        expect(a.x).toBe(5)
        expect(a.y).toBe(10)
        expect(a.z).toBe(15)
    })

    it('Vec3 lerpVectors produces midpoint', () => {
        const v = new Vec3()
        v.lerpVectors(new Vec3(0, 0, 0), new Vec3(10, 20, 30), 0.5)
        expect(v.x).toBe(5)
        expect(v.y).toBe(10)
        expect(v.z).toBe(15)
    })

    it('Color setRGB and clone', () => {
        const c = new Color()
        c.setRGB(0.1, 0.2, 0.3)
        const cloned = c.clone()
        expect(cloned.r).toBe(0.1)
        expect(cloned.g).toBe(0.2)
        expect(cloned.b).toBe(0.3)
    })

    it('Box3 computes bounds from points', () => {
        const box = new Box3()
        const points = [
            { x: -1, y: -2, z: -3 },
            { x: 4, y: 5, z: 6 }
        ]
        box.setFromPoints(points)
        expect(box.min.x).toBe(-1)
        expect(box.max.x).toBe(4)
    })

    it('Box3 getCenter and getSize', () => {
        const box = new Box3()
        box.setFromPoints([
            { x: 0, y: 0, z: 0 },
            { x: 10, y: 20, z: 30 }
        ])
        const center = new Vec3()
        box.getCenter(center)
        expect(center.x).toBe(5)
        expect(center.y).toBe(10)
        expect(center.z).toBe(15)

        const size = new Vec3()
        box.getSize(size)
        expect(size.x).toBe(10)
        expect(size.y).toBe(20)
        expect(size.z).toBe(30)
    })

    it('clamp constrains to range', () => {
        expect(clamp(5, 0, 10)).toBe(5)
        expect(clamp(-1, 0, 10)).toBe(0)
        expect(clamp(15, 0, 10)).toBe(10)
    })

    it('lerp interpolates scalar', () => {
        expect(lerp(0, 10, 0.5)).toBe(5)
        expect(lerp(0, 10, 0)).toBe(0)
        expect(lerp(0, 10, 1)).toBe(10)
    })
})
