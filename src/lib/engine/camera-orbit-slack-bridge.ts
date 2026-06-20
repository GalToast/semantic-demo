/**
 * @lib/engine/camera-orbit-slack-bridge.ts — Bridge re-exporting orbit slack from camera-choreography
 *
 * Replaces: js/modules/camera-orbit-slack.ts (kernel)
 *
 * This bridge provides the canonical import path for consumers that need
 * orbit slack functions but live outside the camera-choreography directory.
 * 
 * Lazy-loaded to avoid pulling Three.js into the main bundle.
 */

let orbitSlackModule: any = null
let orbitSlackPromise: Promise<any> | null = null

function loadOrbitSlack(): Promise<any> {
    if (!orbitSlackPromise) {
        orbitSlackPromise = import('./camera-choreography/orbit-slack').then((m) => {
            orbitSlackModule = m
            return m
        })
    }
    return orbitSlackPromise
}

export function isSearchRouteFocusActive(): boolean {
    return orbitSlackModule?.isSearchRouteFocusActive() ?? false
}

export function getFocusOrbitSlackPivot(): any {
    return orbitSlackModule?.getFocusOrbitSlackPivot() ?? null
}

export function applyFocusOrbitSlack(reason: string = 'user-control'): boolean {
    if (!orbitSlackModule) {
        loadOrbitSlack().then(() => applyFocusOrbitSlack(reason))
        return false
    }
    return orbitSlackModule.applyFocusOrbitSlack(reason)
}

export function clearFocusOrbitSlack(reason: string = 'clear'): void {
    if (!orbitSlackModule) {
        loadOrbitSlack().then(() => clearFocusOrbitSlack(reason))
        return
    }
    orbitSlackModule.clearFocusOrbitSlack(reason)
}
