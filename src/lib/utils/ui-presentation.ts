/**
 * @lib/utils/ui-presentation.ts — Presentation logic, environment checks,
 * and scene display profiles
 *
 * Port of
 */

import { FOCUS_PANEL_MODE, getFocusPanelMode } from './focus-panel-mode'

export const DEFAULT_DOCUMENT_TITLE = 'Montgomery County Semantic Explorer | Case Study'

export type GraphPresentationState = 'overview' | 'search' | 'focus' | 'trail' | 'field-node' | 'inside'

export interface GraphPresentationProfile {
    coreOpacity: number
    wispyOpacity: number
    bridgeOpacity: number
    hoverOverlayOpacity: number
    searchDimFactor: number
    searchContextFactor: number
    searchBoostBase: number
    searchBoostRange: number
    searchAnchorBoostBase: number
    searchAnchorBoostRange: number
    searchBeadFloor: number
    traversalCoreFloor: number
    traversalCoreLift: number
    traversalWispyFloor: number
    traversalWispyLift: number
    traversalBridgeFloor: number
    traversalBridgeLift: number
    focusSemanticOpacity: number
    pointOpacityScale: number
    pointSizeScale: number
}

export const CLUSTER_NAMES: readonly string[] = [
    'General Business',
    'Professional Services',
    'Food & Hospitality',
    'Construction & Trades',
    'Retail & Shops',
    'Beauty & Wellness',
    'Real Estate & Property',
    'Industrial & Logistics',
    'Agriculture & Ranching',
    'Automotive',
    'Healthcare & Medical',
    'Therapy & Counseling',
    'Education & Childcare',
    'Churches',
    'Faith Ministries',
    'Community Nonprofits',
    'Foundations',
    'Arts & Culture',
    'Economic Development',
    'Public Agencies',
    'Enterprise Brands'
] as const

export function updateDocumentMeta(title?: string, description?: string): void {
    if (typeof document === 'undefined') return
    if (title) document.title = title
    if (description) {
        const metaDesc = document.querySelector('meta[name="description"]')
        if (metaDesc) metaDesc.setAttribute('content', description)
        const ogDesc = document.querySelector('meta[property="og:description"]')
        if (ogDesc) ogDesc.setAttribute('content', description)
    }
}

export function describeCluster(cluster: number | null | undefined): string {
    if (cluster === null || cluster === undefined || !Number.isFinite(cluster)) return 'Other'
    return CLUSTER_NAMES[cluster] || 'Other'
}

export function isCompactFocusStageViewport(): boolean {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
    return window.matchMedia('(max-width: 768px)').matches
}

export function isCompactMapViewport(): boolean {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
    return window.matchMedia('(max-width: 768px)').matches
}

export function isCompactSearchViewport(): boolean {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
    return window.matchMedia('(max-width: 768px)').matches
}

export function detectStaticDevPHP(text: unknown): boolean {
    if (typeof text !== 'string') return false
    const trimmed = text.trim()
    return trimmed.startsWith('<?php') || (trimmed.includes('<?php') && trimmed.indexOf('<?php') < 100)
}

export function allowsStaticDevFallback(): boolean {
    if (typeof window === 'undefined' || !window.location) return false
    const host = window.location.hostname
    if (host !== 'localhost' && host !== '127.0.0.1' && host !== '::1' && host !== '0.0.0.0') return false
    const params = new URLSearchParams(window.location.search || '')
    return params.get('staticDev') !== '0'
}

export function shouldLogStaticDevFallback(): boolean {
    if (typeof window === 'undefined' || !window.location) return false
    const params = new URLSearchParams(window.location.search || '')
    return params.get('staticDevWarnings') === '1' || params.get('debugStaticDev') === '1'
}

export function getThreadPulseOpacity(
    baseOpacity: number,
    pulse: number,
    requestedAmplitude: number,
    revealProgress: number = 1
): number {
    const safeBase = Math.max(0, Number.isFinite(baseOpacity) ? baseOpacity : 0)
    const safeReveal = Math.max(0, Number.isFinite(revealProgress) ? revealProgress : 1)
    const amplitude = Math.min(
        Math.max(0, Number.isFinite(requestedAmplitude) ? requestedAmplitude : 0),
        Math.max(0.0006, safeBase * 0.42)
    )
    return Math.max(0, safeBase + pulse * amplitude) * safeReveal
}

export function getFieldStepSyncLift(): number {
    return 0
}

export function getGraphPresentationState(
    focusedNode: number | null,
    semanticDiveMode: boolean,
    mode: string,
    searchGlowActive: boolean
): GraphPresentationState {
    if (focusedNode !== null) {
        if (semanticDiveMode) return 'inside'
        if (getFocusPanelMode() === FOCUS_PANEL_MODE.FIELD_NODE) return 'field-node'
        return mode === 'trail' ? 'trail' : 'focus'
    }
    if (searchGlowActive) return 'search'
    return 'overview'
}

export function getGraphPresentationProfile(
    zoomBlend: number,
    state: GraphPresentationState,
    compactViewport: boolean
): GraphPresentationProfile {
    const zoomReveal = 1 - zoomBlend
    const profiles: Record<GraphPresentationState, GraphPresentationProfile> = {
        overview: {
            coreOpacity: 0.078 + zoomReveal * 0.086,
            wispyOpacity: 0.008 + zoomReveal * 0.03,
            bridgeOpacity: 0.006 + zoomReveal * 0.018,
            hoverOverlayOpacity: 0.24 + zoomReveal * 0.08,
            searchDimFactor: 0.14 + zoomReveal * 0.03,
            searchContextFactor: 0.44 + zoomReveal * 0.12,
            searchBoostBase: 0.52 + zoomReveal * 0.14,
            searchBoostRange: 0.62 + zoomReveal * 0.18,
            searchAnchorBoostBase: 0.92 + zoomReveal * 0.16,
            searchAnchorBoostRange: 0.92 + zoomReveal * 0.18,
            searchBeadFloor: 0.045,
            traversalCoreFloor: 0.02 + zoomReveal * 0.012,
            traversalCoreLift: 0.014 + zoomReveal * 0.008,
            traversalWispyFloor: 0.0032 + zoomReveal * 0.0018,
            traversalWispyLift: 0.0018 + zoomReveal * 0.0014,
            traversalBridgeFloor: 0.0014 + zoomReveal * 0.0008,
            traversalBridgeLift: 0.0009 + zoomReveal * 0.0006,
            focusSemanticOpacity: 0.94 + zoomReveal * 0.04,
            pointOpacityScale: 1,
            pointSizeScale: 1
        },
        search: {
            coreOpacity: 0.034 + zoomReveal * 0.042,
            wispyOpacity: 0.0028 + zoomReveal * 0.011,
            bridgeOpacity: 0.0022 + zoomReveal * 0.008,
            hoverOverlayOpacity: 0.42 + zoomReveal * 0.14,
            searchDimFactor: 0.42 + zoomReveal * 0.04,
            searchContextFactor: 0.6 + zoomReveal * 0.14,
            searchBoostBase: 0.44 + zoomReveal * 0.16,
            searchBoostRange: 0.5 + zoomReveal * 0.2,
            searchAnchorBoostBase: 0.84 + zoomReveal * 0.18,
            searchAnchorBoostRange: 0.86 + zoomReveal * 0.22,
            searchBeadFloor: 0.038,
            traversalCoreFloor: 0.016 + zoomReveal * 0.01,
            traversalCoreLift: 0.01 + zoomReveal * 0.008,
            traversalWispyFloor: 0.0024 + zoomReveal * 0.0016,
            traversalWispyLift: 0.0014 + zoomReveal * 0.0012,
            traversalBridgeFloor: 0.0011 + zoomReveal * 0.0007,
            traversalBridgeLift: 0.0007 + zoomReveal * 0.0005,
            focusSemanticOpacity: 0.9 + zoomReveal * 0.05,
            pointOpacityScale: compactViewport ? 0.68 : 0.82,
            pointSizeScale: compactViewport ? 0.82 : 0.92
        },
        focus: {
            coreOpacity: 0.026 + zoomReveal * 0.016,
            wispyOpacity: 0.0022 + zoomReveal * 0.0042,
            bridgeOpacity: 0.0011 + zoomReveal * 0.002,
            hoverOverlayOpacity: 0.42 + zoomReveal * 0.12,
            searchDimFactor: 0.3,
            searchContextFactor: 0.66,
            searchBoostBase: 0.58,
            searchBoostRange: 0.72,
            searchAnchorBoostBase: 1.04,
            searchAnchorBoostRange: 1.18,
            searchBeadFloor: 0.026,
            traversalCoreFloor: 0.018 + zoomReveal * 0.008,
            traversalCoreLift: 0.012 + zoomReveal * 0.007,
            traversalWispyFloor: 0.0024 + zoomReveal * 0.0012,
            traversalWispyLift: 0.0014 + zoomReveal * 0.001,
            traversalBridgeFloor: 0.0011 + zoomReveal * 0.0005,
            traversalBridgeLift: 0.0007 + zoomReveal * 0.0004,
            focusSemanticOpacity: 0.52 + zoomReveal * 0.06,
            pointOpacityScale: compactViewport ? 0.42 : 0.6,
            pointSizeScale: compactViewport ? 0.92 : 0.98
        },
        inside: {
            coreOpacity: 0.008 + zoomReveal * 0.006,
            wispyOpacity: 0.0008 + zoomReveal * 0.0014,
            bridgeOpacity: 0.0007 + zoomReveal * 0.001,
            hoverOverlayOpacity: 0.42,
            searchDimFactor: 0.2,
            searchContextFactor: 0.5,
            searchBoostBase: 0.5,
            searchBoostRange: 0.6,
            searchAnchorBoostBase: 1,
            searchAnchorBoostRange: 1,
            searchBeadFloor: 0.018,
            traversalCoreFloor: 0.01,
            traversalCoreLift: 0.005,
            traversalWispyFloor: 0.001,
            traversalWispyLift: 0.001,
            traversalBridgeFloor: 0.0005,
            traversalBridgeLift: 0.0005,
            focusSemanticOpacity: 0.28,
            pointOpacityScale: compactViewport ? 0.2 : 0.34,
            pointSizeScale: compactViewport ? 0.9 : 0.95
        },
        trail: {
            coreOpacity: 0.026 + zoomReveal * 0.016,
            wispyOpacity: 0.0022 + zoomReveal * 0.0042,
            bridgeOpacity: 0.0011 + zoomReveal * 0.002,
            hoverOverlayOpacity: 0.42 + zoomReveal * 0.12,
            searchDimFactor: 0.3,
            searchContextFactor: 0.66,
            searchBoostBase: 0.58,
            searchBoostRange: 0.72,
            searchAnchorBoostBase: 1.04,
            searchAnchorBoostRange: 1.18,
            searchBeadFloor: 0.026,
            traversalCoreFloor: 0.018 + zoomReveal * 0.008,
            traversalCoreLift: 0.012 + zoomReveal * 0.007,
            traversalWispyFloor: 0.0024 + zoomReveal * 0.0012,
            traversalWispyLift: 0.0014 + zoomReveal * 0.001,
            traversalBridgeFloor: 0.0011 + zoomReveal * 0.0005,
            traversalBridgeLift: 0.0007 + zoomReveal * 0.0004,
            focusSemanticOpacity: 0.52 + zoomReveal * 0.06,
            pointOpacityScale: compactViewport ? 0.42 : 0.6,
            pointSizeScale: compactViewport ? 0.92 : 0.98
        },
        'field-node': {
            coreOpacity: 0.026 + zoomReveal * 0.016,
            wispyOpacity: 0.0022 + zoomReveal * 0.0042,
            bridgeOpacity: 0.0011 + zoomReveal * 0.002,
            hoverOverlayOpacity: 0.42 + zoomReveal * 0.12,
            searchDimFactor: 0.3,
            searchContextFactor: 0.66,
            searchBoostBase: 0.58,
            searchBoostRange: 0.72,
            searchAnchorBoostBase: 1.04,
            searchAnchorBoostRange: 1.18,
            searchBeadFloor: 0.026,
            traversalCoreFloor: 0.018 + zoomReveal * 0.008,
            traversalCoreLift: 0.012 + zoomReveal * 0.007,
            traversalWispyFloor: 0.0024 + zoomReveal * 0.0012,
            traversalWispyLift: 0.0014 + zoomReveal * 0.001,
            traversalBridgeFloor: 0.0011 + zoomReveal * 0.0005,
            traversalBridgeLift: 0.0007 + zoomReveal * 0.0004,
            focusSemanticOpacity: 0.52 + zoomReveal * 0.06,
            pointOpacityScale: compactViewport ? 0.42 : 0.6,
            pointSizeScale: compactViewport ? 0.92 : 0.98
        }
    }

    return profiles[state] || profiles.overview
}
