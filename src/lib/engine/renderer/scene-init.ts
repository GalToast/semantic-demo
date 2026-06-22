/**
 * @lib/engine/renderer/scene-init.ts
 * Pure Three.js scene graph construction — no state mutations, no side effects.
 *
 * Extracted from three-engine.ts during the W46-P2 decomposition.
 * All state wiring and event handling stays in three-engine.ts.
 */

import {
    Scene,
    PerspectiveCamera,
    WebGLRenderer,
    FogExp2,
    ACESFilmicToneMapping,
    SRGBColorSpace,
    HemisphereLight,
    DirectionalLight,
    SphereGeometry,
    MeshBasicMaterial,
    Mesh,
    BackSide,
    AdditiveBlending
} from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { CONFIG } from '@lib/engine/config'
import { SCENE_ATMOSPHERE } from '@lib/engine/node-manager'
import { detectWebGLSupport, type WebGLSupportDetail } from './webgl-fallback'

export interface SceneSetup {
    scene: Scene
    camera: PerspectiveCamera
    renderer: WebGLRenderer
    controls: OrbitControls
    hemiLight: HemisphereLight
    dirLight: DirectionalLight
    glowSphere: Mesh
    refSphere: Mesh
    support: WebGLSupportDetail
}

export type SceneSetupResult = { success: true; setup: SceneSetup } | { success: false; reason: string }

/**
 * Build a complete Three.js scene graph for the semantic explorer.
 * Returns the scene objects on success, or a failure reason on error.
 * Does NOT touch any application state — the caller must wire everything.
 */
export async function buildThreeScene(
    container: HTMLElement,
    width: number,
    height: number
): Promise<SceneSetupResult> {
    const support = detectWebGLSupport()
    if (!support.supported) {
        return { success: false, reason: support.reason }
    }

    // ── Scene ───────────────────────────────────────────────────────────────
    const scene = new Scene()
    scene.fog = new FogExp2(
        (SCENE_ATMOSPHERE as any).fogColor ?? 0x0d2024,
        (SCENE_ATMOSPHERE as any).fogDensity ?? 0.62
    )

    // ── Camera ──────────────────────────────────────────────────────────────
    const camera = new PerspectiveCamera(60, width / height, 0.1, 1000)
    camera.position.set(2.05, 1.55, 2.75)
    camera.lookAt(0, 0, 0)

    // ── Renderer ────────────────────────────────────────────────────────────
    let renderer: WebGLRenderer
    try {
        renderer = new WebGLRenderer({
            antialias: true,
            alpha: true,
            preserveDrawingBuffer: false,
            powerPreference: 'high-performance'
        })
    } catch (error) {
        return {
            success: false,
            reason: (error as Error)?.message || 'renderer-create-failed'
        }
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(width, height)
    renderer.setClearColor((SCENE_ATMOSPHERE as any).fogColor ?? 0x0d2024, (SCENE_ATMOSPHERE as any).clearAlpha ?? 0.96)
    renderer.toneMapping = ACESFilmicToneMapping
    renderer.toneMappingExposure = (SCENE_ATMOSPHERE as any).toneExposure ?? 1.0
    renderer.outputColorSpace = SRGBColorSpace

    // Remove any orphaned canvas elements from previous inits
    container.querySelectorAll('canvas').forEach((c) => {
        if (c !== renderer.domElement) c.remove()
    })
    renderer.domElement.setAttribute(
        'aria-label',
        'Semantic business visualization of Montgomery County businesses. Use arrow keys to navigate.'
    )
    renderer.domElement.setAttribute('tabindex', '0')
    renderer.domElement.setAttribute('role', 'application')
    container.appendChild(renderer.domElement)

    // ── Controls ────────────────────────────────────────────────────────────
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.05
    controls.rotateSpeed = 0.5
    controls.zoomSpeed = 0.8
    controls.minDistance = CONFIG.ORBIT_MIN_DISTANCE_DEFAULT
    controls.maxDistance = CONFIG.ORBIT_MAX_DISTANCE_DEFAULT
    controls.enablePan = true
    controls.panSpeed = CONFIG.ORBIT_PAN_SPEED_DEFAULT

    // ── Lights ──────────────────────────────────────────────────────────────
    const hemiLight = new HemisphereLight(0xe8f4ff, 0x080820, 0)
    hemiLight.position.set(0, 20, 0)
    scene.add(hemiLight)

    const dirLight = new DirectionalLight(0xffffff, 0)
    dirLight.position.set(5, 5, 5)
    scene.add(dirLight)

    // ── Atmosphere Spheres ────────────────────────────────────────────────
    const glowGeo = new SphereGeometry(3.15, 32, 16)
    const glowMat = new MeshBasicMaterial({
        color: 0x0d2024,
        transparent: true,
        opacity: 0.026,
        side: BackSide
    })
    const glowSphere = new Mesh(glowGeo, glowMat)
    glowSphere.scale.set(1.16, 0.9, 1.34)
    glowSphere.name = 'semantic-depth-atmosphere'
    scene.add(glowSphere)

    const refGeo = new SphereGeometry(2.35, 48, 24)
    const refMat = new MeshBasicMaterial({
        color: 0x4ecdc4,
        wireframe: true,
        transparent: true,
        opacity: 0.0045,
        depthWrite: false,
        blending: AdditiveBlending
    })
    const refSphere = new Mesh(refGeo, refMat)
    refSphere.scale.set(1.12, 0.86, 1.28)
    refSphere.name = 'county-depth-reference'
    scene.add(refSphere)

    return {
        success: true,
        setup: {
            scene,
            camera,
            renderer,
            controls,
            hemiLight,
            dirLight,
            glowSphere,
            refSphere,
            support
        }
    }
}
