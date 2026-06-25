// cluster-ui-accent.ts
// TypeScript shadow of cluster-ui-accent.js
// Applies cluster-based CSS custom properties to DOM elements.

import { appState as state } from '@lib/state/app.svelte'
import type { BusinessRecord } from '@lib/types/business'

const DEFAULT_CLUSTER_RGB = '78 205 196'

interface RgbColor {
    r: number
    g: number
    b: number
}

function parseHexColor(hexColor: string | null | undefined): RgbColor | null {
    const normalized = String(hexColor || '')
        .trim()
        .replace(/^#/, '')
    if (!/^[0-9a-f]{6}$/i.test(normalized)) return null
    return {
        r: parseInt(normalized.slice(0, 2), 16),
        g: parseInt(normalized.slice(2, 4), 16),
        b: parseInt(normalized.slice(4, 6), 16)
    }
}

function getPointClusterIndex(point: BusinessRecord): number | null {
    const cluster = Number(point?.cluster)
    return Number.isFinite(cluster) ? Math.abs(Math.trunc(cluster)) : null
}

/**
 * Apply cluster-based accent color to a DOM element via CSS custom properties.
 * Returns the RGB value string used, or null if no color was applied.
 */
export function applyClusterUiAccent(element: HTMLElement | null, point: BusinessRecord = null): string | null {
    if (!element) return null

    const clusterIndex = getPointClusterIndex(point)
    const colors = Array.isArray(state.COLORS) ? state.COLORS : []
    const hexColor = clusterIndex !== null && colors.length ? colors[clusterIndex % colors.length] : null
    const rgb = parseHexColor(hexColor)
    const rgbValue = rgb ? `${rgb.r} ${rgb.g} ${rgb.b}` : DEFAULT_CLUSTER_RGB

    element.style.setProperty('--cluster-rgb', rgbValue)
    if (clusterIndex === null) {
        delete element.dataset.clusterAccent
        delete element.dataset.clusterColor
    } else {
        element.dataset.clusterAccent = String(clusterIndex)
        element.dataset.clusterColor = String(hexColor || '')
    }

    return rgbValue
}
