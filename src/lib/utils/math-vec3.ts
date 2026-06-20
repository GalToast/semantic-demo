/**
 * @lib/utils/math-vec3.ts — Minimal Vec3, Color, Box3 and math helpers.
 *
 * Replaces Three.js imports for modules that must not pull the `three`
 * chunk into the main bundle. Covers the subset of the THREE.Vector3 /
 * THREE.Color / THREE.Box3 API actually used by the application.
 */

export interface Vec3Like {
    x: number
    y: number
    z: number
}

export class Vec3 implements Vec3Like {
    x: number
    y: number
    z: number
    constructor(x = 0, y = 0, z = 0) {
        this.x = x
        this.y = y
        this.z = z
    }
    clone() {
        return new Vec3(this.x, this.y, this.z)
    }
    copy(v: Vec3Like) {
        this.x = v.x
        this.y = v.y
        this.z = v.z
        return this
    }
    lengthSq() {
        return this.x * this.x + this.y * this.y + this.z * this.z
    }
    length() {
        return Math.sqrt(this.lengthSq())
    }
    normalize() {
        const len = this.length()
        if (len > 0) {
            this.x /= len
            this.y /= len
            this.z /= len
        }
        return this
    }
    crossVectors(a: Vec3Like, b: Vec3Like) {
        this.x = a.y * b.z - a.z * b.y
        this.y = a.z * b.x - a.x * b.z
        this.z = a.x * b.y - a.y * b.x
        return this
    }
    multiplyScalar(s: number) {
        this.x *= s
        this.y *= s
        this.z *= s
        return this
    }
    add(v: Vec3Like) {
        this.x += v.x
        this.y += v.y
        this.z += v.z
        return this
    }
    sub(v: Vec3Like) {
        this.x -= v.x
        this.y -= v.y
        this.z -= v.z
        return this
    }
    subVectors(a: Vec3Like, b: Vec3Like) {
        this.x = a.x - b.x
        this.y = a.y - b.y
        this.z = a.z - b.z
        return this
    }
    dot(v: Vec3Like) {
        return this.x * v.x + this.y * v.y + this.z * v.z
    }
    distanceTo(v: Vec3Like) {
        const dx = this.x - v.x,
            dy = this.y - v.y,
            dz = this.z - v.z
        return Math.sqrt(dx * dx + dy * dy + dz * dz)
    }
    setLength(len: number) {
        const current = this.length()
        if (current > 0) this.multiplyScalar(len / current)
        return this
    }
    lerp(v: Vec3Like, t: number) {
        this.x += (v.x - this.x) * t
        this.y += (v.y - this.y) * t
        this.z += (v.z - this.z) * t
        return this
    }
    lerpVectors(a: Vec3Like, b: Vec3Like, t: number) {
        this.x = a.x + (b.x - a.x) * t
        this.y = a.y + (b.y - a.y) * t
        this.z = a.z + (b.z - a.z) * t
        return this
    }
}

export class Color {
    r: number
    g: number
    b: number
    constructor(r = 0, g = 0, b = 0) {
        this.r = r
        this.g = g
        this.b = b
    }
    setRGB(r: number, g: number, b: number) {
        this.r = r
        this.g = g
        this.b = b
        return this
    }
    clone() {
        return new Color(this.r, this.g, this.b)
    }
}

export class Box3 {
    min: Vec3Like
    max: Vec3Like
    constructor() {
        this.min = { x: Infinity, y: Infinity, z: Infinity }
        this.max = { x: -Infinity, y: -Infinity, z: -Infinity }
    }
    setFromPoints(points: Vec3Like[]) {
        for (const p of points) {
            this.min.x = Math.min(this.min.x, p.x)
            this.min.y = Math.min(this.min.y, p.y)
            this.min.z = Math.min(this.min.z, p.z)
            this.max.x = Math.max(this.max.x, p.x)
            this.max.y = Math.max(this.max.y, p.y)
            this.max.z = Math.max(this.max.z, p.z)
        }
        return this
    }
    getCenter(target: Vec3) {
        target.x = (this.min.x + this.max.x) / 2
        target.y = (this.min.y + this.max.y) / 2
        target.z = (this.min.z + this.max.z) / 2
        return target
    }
    getSize(target: Vec3) {
        target.x = this.max.x - this.min.x
        target.y = this.max.y - this.min.y
        target.z = this.max.z - this.min.z
        return target
    }
}

export function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value))
}

export function lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t
}
