import { appState } from '@lib/state/app.svelte.ts'

/**
 * Leaflet mutates the DOM container at runtime to attach _leaflet_id.
 * The HTMLElement type doesn't include this property; structural cast is required.
 */
export interface LeafletContainer extends HTMLElement {
    _leaflet_id?: number
}

/**
 * Leaflet's fitBounds signature isn't exposed in a way TS can infer from
 * the loose Record<string, unknown> type on appState.map. This interface
 * lets us call fitBounds without a complex conditional-parameter cast.
 */
export interface LeafletMapWithFitBounds {
    fitBounds(bounds: unknown, options?: Record<string, unknown>): void
}

export interface LeafletMarker {
    setStyle(style: Record<string, unknown>): void
    addTo(layer: unknown): LeafletMarker
    on(event: string, handler: () => void): void
    bindTooltip(name: string, options: Record<string, unknown>): LeafletMarker
    openTooltip(): void
    bringToFront?(): void
    bringToBack?(): void
}

/**
 * Typed accessor for the runtime Leaflet map instance.
 * `appState.map` is declared as the loose `LeafletLayer`
 * (`Record<string, unknown> | null`) because Leaflet is vendored locally and
 * not npm-imported, so its concrete type isn't available at compile time. At
 * runtime the value is a real Leaflet `L.Map` with `fitBounds`/`setView`.
 * This consolidates the single guarded cast here (mirroring the getMapState
 * pattern) so call sites stay clean of `as unknown as` casts.
 */
export function getLeafletMap(): LeafletMapWithFitBounds | null {
    return appState.map ? (appState.map as unknown as LeafletMapWithFitBounds) : null
}

let leafletAssetsPromise: Promise<unknown> | null = null

export async function loadLeafletAssets(): Promise<unknown> {
    // SSR/jsdom guard — window/document are browser-only; mirror the sibling
    // pattern (three-engine-restore.ts:96, three-engine-timers.ts:46). Loading
    // Leaflet outside a browser is a no-op reject-compatible signal, not a
    // DOM-creation attempt (leaflet script/css would never be reachable).
    if (typeof window === 'undefined' || typeof document === 'undefined') {
        return null
    }
    if (window.L) return window.L
    if (leafletAssetsPromise) return leafletAssetsPromise

    leafletAssetsPromise = new Promise((resolve, reject) => {
        const finish = (): void => {
            if (window.L) {
                resolve(window.L)
            } else {
                reject(new Error('Leaflet failed to initialize'))
            }
        }

        if (!document.getElementById('leaflet-runtime-css')) {
            const link = document.createElement('link')
            link.id = 'leaflet-runtime-css'
            link.rel = 'stylesheet'
            link.href = 'vendor/leaflet/leaflet.css'
            document.head.appendChild(link)
        }

        const existingScript = document.getElementById('leaflet-runtime-js')
        if (existingScript) {
            if (window.L) {
                resolve(window.L)
                return
            }
            existingScript.addEventListener('load', finish, { once: true })
            existingScript.addEventListener('error', () => reject(new Error('Leaflet script failed to load')), {
                once: true
            })
            return
        }

        const script = document.createElement('script')
        script.id = 'leaflet-runtime-js'
        script.src = 'vendor/leaflet/leaflet.js'
        script.async = true
        script.onload = finish
        script.onerror = () => reject(new Error('Leaflet script failed to load'))
        document.head.appendChild(script)
    })

    return leafletAssetsPromise.catch((e) => {
        leafletAssetsPromise = null
        throw e
    })
}
