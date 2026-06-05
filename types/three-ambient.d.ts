/**
 * Minimal ambient module declaration for `three`.
 *
 * Three.js v0.184 does not ship its own TypeScript declarations and
 * @types/three is not yet a project dependency.  This stub satisfies
 * the TS compiler so that migration modules can be checked incrementally.
 *
 * When @types/three is installed, delete this file and let the real
 * types take over.
 */
declare module 'three' {
    // ── Core constants ────────────────────────────────────────────────────
    export const ACESFilmicToneMapping: number;
    export const SRGBColorSpace: string;
    export const DynamicDrawUsage: number;
    export const NormalBlending: number;
    export const AdditiveBlending: number;
    export const BackSide: number;
    export const DoubleSide: number;

    // ── Math utilities ────────────────────────────────────────────────────
    export class MathUtils {
        static clamp(value: number, min: number, max: number): number;
    }

    // ── Event system ─────────────────────────────────────────────────────
    export class EventDispatcher {
        addEventListener(type: string, listener: (...args: any[]) => void): void;
        removeEventListener(type: string, listener: (...args: any[]) => void): void;
        hasEventListener(type: string, listener: (...args: any[]) => void): boolean;
        dispatchEvent(event: Record<string, any>): void;
    }

    // ── Core objects ──────────────────────────────────────────────────────
    export class Vector2 {
        constructor(x?: number, y?: number);
        x: number;
        y: number;
        set(x: number, y: number): this;
    }

    export class Vector3 {
        constructor(x?: number, y?: number, z?: number);
        x: number;
        y: number;
        z: number;
        set(x: number, y: number, z: number): this;
        copy(v: Vector3): this;
        clone(): Vector3;
        add(v: Vector3): this;
        addScaledVector(v: Vector3, s: number): this;
        sub(v: Vector3): this;
        subVectors(a: Vector3, b: Vector3): this;
        multiplyScalar(s: number): this;
        lerp(target: Vector3, alpha: number): this;
        lerpVectors(a: Vector3, b: Vector3, alpha: number): this;
        normalize(): this;
        length(): number;
        lengthSq(): number;
        crossVectors(a: Vector3, b: Vector3): this;
        setFromMatrixPosition(m: Matrix4): this;
        applyMatrix4(m: Matrix4): this;
    }

    export class Color {
        constructor(color?: number | string);
        r: number;
        g: number;
        b: number;
        set(hex: number | string): this;
        setHex(hex: number): this;
        setRGB(r: number, g: number, b: number): this;
        lerp(color: Color, alpha: number): this;
        multiplyScalar(s: number): this;
        clone(): Color;
        offsetHSL(h: number, s: number, l: number): this;
    }

    export class Matrix4 {
        elements: number[];
        copy(m: Matrix4): this;
    }

    export class Euler {
        x: number;
        y: number;
        z: number;
        set(x: number, y: number, z: number): this;
    }

    // ── Buffers & Attributes ──────────────────────────────────────────────
    export class BufferAttribute {
        constructor(array: Float32Array | number[], itemSize: number);
        array: Float32Array | number[];
        needsUpdate: boolean;
    }

    export class Float32BufferAttribute extends BufferAttribute {
        constructor(array: number[] | Float32Array, itemSize: number);
    }

    export class InstancedBufferAttribute extends BufferAttribute {
        constructor(array: ArrayLike<number>, itemSize: number, meshPerAttribute?: number);
    }

    export class BufferGeometry {
        setAttribute(name: string, attribute: BufferAttribute): this;
        setFromPoints(points: Vector3[]): this;
        dispose(): void;
        attributes: Record<string, BufferAttribute>;
    }

    // ── Materials ─────────────────────────────────────────────────────────
    export interface MaterialParameters {
        transparent?: boolean;
        opacity?: number;
        depthWrite?: boolean;
        blending?: number;
        side?: number;
        color?: number;
        vertexColors?: boolean;
        size?: number;
        sizeAttenuation?: boolean;
    }

    export class Material {
        transparent: boolean;
        opacity: number;
        needsUpdate: boolean;
        userData: Record<string, any>;
        dispose(): void;
        clone(): this;
        color: Color;
        uniforms?: Record<string, { value: any }>;
    }

    export class PointsMaterial extends Material {
        constructor(parameters?: MaterialParameters & { size?: number; sizeAttenuation?: boolean });
        size: number;
    }

    export class LineBasicMaterial extends Material {
        constructor(parameters?: MaterialParameters & { linewidth?: number; vertexColors?: boolean });
        linewidth: number;
        color: Color;
    }

    export class MeshBasicMaterial extends Material {
        constructor(parameters?: MaterialParameters & { wireframe?: boolean; color?: number });
        wireframe: boolean;
        color: Color;
        map: Texture | null;
    }

    export class MeshPhongMaterial extends Material {
        constructor(parameters?: MaterialParameters & {
            color?: number;
            emissive?: number;
            emissiveIntensity?: number;
            shininess?: number;
            vertexColors?: boolean;
        });
        color: Color;
    }

    export interface ShaderMaterialParameters {
        uniforms?: Record<string, { value: any }>;
        vertexShader?: string;
        fragmentShader?: string;
        transparent?: boolean;
        side?: number;
        depthWrite?: boolean;
        blending?: number;
        vertexColors?: boolean;
    }

    export class ShaderMaterial extends Material {
        constructor(parameters?: ShaderMaterialParameters);
        uniforms: Record<string, { value: any }>;
        vertexShader: string;
        fragmentShader: string;
    }

    // ── Geometries ────────────────────────────────────────────────────────
    export class SphereGeometry extends BufferGeometry {
        constructor(radius?: number, widthSegments?: number, heightSegments?: number);
    }

    export class CircleGeometry extends BufferGeometry {
        constructor(radius?: number, segments?: number);
    }

    export class IcosahedronGeometry extends BufferGeometry {
        constructor(radius?: number, detail?: number);
    }

    // ── Line objects ──────────────────────────────────────────────────────
    export class LineSegments extends Object3D {
        constructor(geometry?: BufferGeometry, material?: Material);
        geometry: BufferGeometry;
        material: Material;
        visible: boolean;
        renderOrder: number;
    }

    export class LineLoop extends Object3D {
        constructor(geometry?: BufferGeometry, material?: Material);
        geometry: BufferGeometry;
        material: Material;
    }

    // ── Object3D ──────────────────────────────────────────────────────────
    export class Object3D {
        position: Vector3;
        rotation: Euler;
        scale: Vector3;
        matrix: Matrix4;
        matrixWorld: Matrix4;
        visible: boolean;
        name: string;
        children: Object3D[];
        userData: Record<string, any>;
        renderOrder: number;
        frustumCulled: boolean;
        add(object: Object3D): this;
        remove(object: Object3D): this;
        getObjectByName(name: string): Object3D | undefined;
        updateMatrix(): void;
        localToWorld(vector: Vector3): Vector3;
        applyMatrix4(matrix: Matrix4): this;
        dispose(): void;
    }

    // ── Instanced Mesh ────────────────────────────────────────────────────
    export class InstancedMesh extends Object3D {
        constructor(geometry: BufferGeometry, material: Material, count: number);
        count: number;
        frustumCulled: boolean;
        instanceMatrix: BufferAttribute & { setUsage(usage: number): void; needsUpdate: boolean };
        instanceColor: (BufferAttribute & { needsUpdate: boolean }) | null;
        setColorAt(index: number, color: Color): void;
        setMatrixAt(index: number, matrix: Matrix4): void;
    }

    // ── Points ────────────────────────────────────────────────────────────
    export class Points extends Object3D {
        constructor(geometry?: BufferGeometry, material?: Material);
        geometry: BufferGeometry;
        material: PointsMaterial;
        frustumCulled: boolean;
    }

    // ── Mesh ──────────────────────────────────────────────────────────────
    export class Mesh extends Object3D {
        constructor(geometry?: BufferGeometry, material?: Material);
        geometry: BufferGeometry;
        material: ShaderMaterial | Material;
        localToWorld(vector: Vector3): Vector3;
    }

    // ── Sprite ────────────────────────────────────────────────────────────
    export class Sprite extends Object3D {
        material: Material;
    }

    // ── Groups & Scene ────────────────────────────────────────────────────
    export class Group extends Object3D {}

    export class Scene extends Group {
        fog: FogExp2 | null;
    }

    // ── Fog ───────────────────────────────────────────────────────────────
    export class FogExp2 {
        constructor(color?: number, density?: number);
        color: Color;
        density: number;
    }

    // ── Lights ────────────────────────────────────────────────────────────
    export class HemisphereLight extends Object3D {
        constructor(skyColor?: number, groundColor?: number, intensity?: number);
        intensity: number;
    }

    export class DirectionalLight extends Object3D {
        constructor(color?: number, intensity?: number);
        intensity: number;
    }

    export class PointLight extends Object3D {
        constructor(color?: number, intensity?: number, distance?: number);
        intensity: number;
    }

    // ── Camera ────────────────────────────────────────────────────────────
    export class PerspectiveCamera extends Object3D {
        constructor(fov?: number, aspect?: number, near?: number, far?: number);
        aspect: number;
        lookAt(vector: Vector3): void;
        lookAt(x: number, y: number, z: number): void;
        setViewOffset(fullWidth: number, fullHeight: number, offsetX: number, offsetY: number, width: number, height: number): void;
        clearViewOffset(): void;
        updateProjectionMatrix(): void;
    }

    // ── Renderer ──────────────────────────────────────────────────────────
    export interface RendererInfo {
        memory: { geometries: number; textures: number };
        programs: any[] | null;
        render: { calls: number; triangles: number };
    }

    export class WebGLRenderer {
        constructor(parameters?: Record<string, any>);
        domElement: HTMLCanvasElement;
        info: RendererInfo;
        setPixelRatio(ratio: number): void;
        setSize(width: number, height: number): void;
        setClearColor(color: number, alpha?: number): void;
        toneMapping: number;
        toneMappingExposure: number;
        outputColorSpace: string;
        compile(scene: Scene, camera: Camera): void;
        render(scene: Scene, camera: Camera): void;
        dispose(): void;
    }

    export type Camera = PerspectiveCamera;

    // ── Three namespace (for `import * as THREE`) ─────────────────────────
    // The `* as THREE` import re-exports everything above.  TypeScript
    // handles this automatically when the module declaration covers all
    // the named exports.
}

// ── Three.js sub-module ambient declarations ──────────────────────────────

declare module 'three/examples/jsm/lines/LineGeometry.js' {
    import { BufferGeometry } from 'three';
    export class LineGeometry extends BufferGeometry {
        setPositions(positions: number[] | Float32Array): this;
        setColors(colors: number[] | Float32Array): this;
    }
}

declare module 'three/examples/jsm/controls/OrbitControls.js' {
    import { Object3D, EventDispatcher } from 'three';
    export class OrbitControls extends EventDispatcher {
        constructor(object: Object3D, domElement?: HTMLElement);
        enabled: boolean;
        target: { set(x: number, y: number, z: number): void };
        enableDamping: boolean;
        dampingFactor: number;
        rotateSpeed: number;
        zoomSpeed: number;
        panSpeed: number;
        minDistance: number;
        maxDistance: number;
        enablePan: boolean;
        autoRotate: boolean;
        autoRotateSpeed: number;
        update(): void;
        dispose(): void;
        addEventListener(type: string, listener: (...args: any[]) => void): void;
        removeEventListener(type: string, listener: (...args: any[]) => void): void;
    }
}
