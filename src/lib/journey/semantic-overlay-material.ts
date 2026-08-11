/**
 * @lib/journey/semantic-overlay-material.ts — Focus-thread line material factory (B-1 extract).
 * BYTE-EXACT extract from semantic-overlay.ts (types 41-62, fn 148-244). Do not re-edit the
 * shader string literals — re-extract from the source if it changes.
 */

import { AdditiveBlending } from 'three'
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js'
import { prefersReducedMotion } from '@lib/utils/environment'
import { appState as state } from '@lib/state/app.svelte'

export interface SemanticLineMaterialUniforms {
    time: { value: number }
    semanticScore: { value: number }
    reducedMotion: { value: number }
    denseBundleMode: { value: number }
}
export type SemanticLineMaterial = LineMaterial & {
    uniforms: SemanticLineMaterialUniforms
    userData: {
        shader?: SemanticShaderLike
        denseBundleMode?: boolean
    }
}

/** Structural type for the GLSL shader object passed to onBeforeCompile.
 *  Three.js' type for this is `any` in @types/three; we use this shape
 *  throughout semantic-overlay.ts instead of `as unknown as`. */
export interface SemanticShaderLike {
    vertexShader: string
    fragmentShader: string
    uniforms: Record<string, { value: number }>
}

function buildFocusThreadLineMaterial(): LineMaterial {
    const baseOpacity = state.navState.focusPocketMeta?.active ? 0.82 : 0.88
    const lineMaterial = new LineMaterial({
        linewidth: 2.6,
        transparent: true,
        opacity: baseOpacity,
        vertexColors: true,
        depthWrite: false,
        depthTest: false,
        blending: AdditiveBlending
    })
    lineMaterial.uniforms.time = { value: performance.now() / 1000 }
    lineMaterial.uniforms.semanticScore = { value: 0.5 }
    lineMaterial.uniforms.reducedMotion = { value: prefersReducedMotion() ? 1 : 0 }
    lineMaterial.uniforms.denseBundleMode = { value: 0 }
    lineMaterial.userData.shader = { uniforms: lineMaterial.uniforms }

    lineMaterial.onBeforeCompile = (shader) => {
        shader.vertexShader = shader.vertexShader.replace(
            'void main() {',
            `attribute float progress;
            attribute float cue;
            attribute float priority;
            attribute float lane;
            void main() {`
        )
        shader.vertexShader = shader.vertexShader.replace(
            '#include <color_pars_vertex>',
            `#include <color_pars_vertex>
            varying float vProgress;
            varying float vCue;
            varying float vPriority;
            varying float vLane;`
        )
        shader.vertexShader = shader.vertexShader.replace(
            'gl_Position = clip;',
            `vProgress = progress;
            vCue = cue;
            vPriority = priority;
            vLane = lane;
            gl_Position = clip;`
        )
        shader.fragmentShader = shader.fragmentShader.replace(
            'uniform float opacity;',
            `uniform float opacity;
            uniform float time;
            uniform float semanticScore;
            uniform float reducedMotion;
            uniform float denseBundleMode;
            varying float vProgress;
            varying float vCue;
            varying float vPriority;
            varying float vLane;`
        )
        shader.fragmentShader = shader.fragmentShader.replace(
            'vec4 diffuseColor = vec4( diffuse, alpha );',
            `vec4 diffuseColor = vec4( diffuse, alpha );

            vec3 teal = vec3(0.43, 1.0, 0.91);
            vec3 gold = vec3(1.0, 0.85, 0.38);
            vec3 pearl = vec3(0.92, 1.0, 0.96);

            vec3 gradientColor = mix(teal, gold, smoothstep(0.18, 0.92, vProgress));
            vec3 baseColor = mix(diffuseColor.rgb, gradientColor, 0.58);

            float motionScale = 1.0 - step(0.5, reducedMotion);
            float denseScale = 1.0 - step(0.5, denseBundleMode) * 0.72;
            float flow = fract(vProgress - time * 0.82 * motionScale);
            float pulseFreq = 0.52 + (semanticScore * 1.6);
            float sporeFlow = fract(vProgress - time * pulseFreq * motionScale + abs(vLane) * 0.08);
            float sporeSize = 1.8 + (semanticScore * 3.2);
            float spore = pow(1.0 - abs(sporeFlow - 0.58) * 2.0, sporeSize) * motionScale * denseScale;
            float bead = pow(1.0 - abs(flow - 0.58) * 2.0, 3.0) * motionScale * denseScale;
            float breath = mix(1.0, 0.78 + sin(time * 2.4 + vLane * 2.2) * 0.16, motionScale * denseScale);

            vec3 finalColor = mix(baseColor, pearl, spore * 0.36);
            vec3 cueColor = vec3(1.0, 0.82, 0.34);
            finalColor = mix(finalColor, cueColor, vCue * (0.42 + bead * 0.1));
            float priorityFloor = mix(0.38, 0.92, smoothstep(0.18, 1.0, vPriority));
            alpha = diffuseColor.a * breath * priorityFloor
                + spore * 0.06
                + bead * 0.025
                + vCue * 0.055
                + semanticScore * 0.045;
            diffuseColor = vec4(finalColor, min(alpha, 0.82));`
        )

        shader.uniforms.time = lineMaterial.uniforms.time!
        shader.uniforms.semanticScore = lineMaterial.uniforms.semanticScore!
        shader.uniforms.reducedMotion = lineMaterial.uniforms.reducedMotion!
        shader.uniforms.denseBundleMode = lineMaterial.uniforms.denseBundleMode!

        lineMaterial.userData.shader = shader
    }

    return lineMaterial
}
