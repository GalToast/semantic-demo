<script lang="ts">
    import { onMount } from 'svelte';
    import { compositionStore } from '../stores.js';
    import InfoPanelChrome from './InfoPanelChrome.svelte';
    import LegendPanelChrome from './LegendPanelChrome.svelte';
    import SemanticGuideOverlay from './SemanticGuideOverlay.svelte';

    interface CompositionState {
        activeView: string;
        trailState: string;
        trailDepth: string;
        graphContext: string;
        mapContext: string;
        semanticDive: string;
        panelSurface: string;
        panelSurfaceDetail: string;
        searchGlow: string;
        isActive: boolean;
        [key: string]: string | boolean | undefined;
    }

    const activeView = $derived<string>($compositionStore.activeView);
    const isMap = $derived(activeView === 'map');

    onMount((): (() => void) => {
        const observer = new MutationObserver((mutations: MutationRecord[]) => {
            mutations.forEach((m: MutationRecord) => {
                if (m.type === 'attributes' && m.attributeName?.startsWith('data-')) {
                    const key = m.attributeName.slice(5).replace(/-([a-z])/g, (_g: string, p1: string) => p1.toUpperCase());
                    const value = document.body.dataset[key];
                    if ($compositionStore[key] !== value) {
                        compositionStore.update((s: CompositionState) => ({ ...s, [key]: value }));
                    }
                }
                if (m.type === 'attributes' && m.attributeName === 'class') {
                    const active = document.body.classList.contains('is-active');
                    if ($compositionStore.isActive !== active) {
                        compositionStore.update((s: CompositionState) => ({ ...s, isActive: active }));
                    }
                }
            });
        });

        observer.observe(document.body, { attributes: true });
        
        const currentData: Record<string, string | undefined> = { ...document.body.dataset };
        compositionStore.update((s: CompositionState) => {
            const next = { ...s };
            Object.entries(currentData).forEach(([k, v]) => {
                (next as Record<string, unknown>)[k] = v;
            });
            next.isActive = document.body.classList.contains('is-active');
            return next;
        });

        return () => observer.disconnect();
    });
</script>

<!-- Loading Overlay -->
<div class="loading-overlay" id="loading-overlay" role="status" aria-live="polite" aria-label="Application loading status">
    <div class="loading-shell">
        <div class="loading-spores" aria-hidden="true">
            <svg class="loading-thread" viewBox="0 0 118 72" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M20 44C33 29 44 24 58 24C74 24 84 33 98 42" stroke="rgba(255,255,255,0.16)" stroke-width="1.2" stroke-linecap="round"/>
                <path d="M20 44C40 48 58 50 98 42" stroke="rgba(78,205,196,0.16)" stroke-width="1" stroke-linecap="round"/>
            </svg>
            <span class="loading-spore spore-a"></span>
            <span class="loading-spore spore-b"></span>
            <span class="loading-spore spore-c"></span>
        </div>
        <div class="loading-kicker">Montgomery County</div>
        <div class="loading-title">Growing the mycelium</div>
        <div class="loading-note" id="loading-note">8,406 Montgomery County business records woven into a living semantic field. An exploratory portrait — not an official directory.</div>
        <div class="loading-progress" aria-hidden="true">
            <div class="loading-progress-bar" id="loading-progress-bar"></div>
        </div>
        <div class="loading-phase-row" id="loading-phase-row">
            <span class="loading-phase-chip is-active" data-loading-phase="records">Records</span>
            <span class="loading-phase-chip" data-loading-phase="scene">Scene</span>
            <span class="loading-phase-chip" data-loading-phase="restore">Restore</span>
            <span class="loading-phase-chip" data-loading-phase="launch">Launch</span>
        </div>
        <div class="loading-foot" id="loading-foot">County records are arriving first.</div>
    </div>
</div>

<main id="app-shell" class:is-map={isMap}>
    <InfoPanelChrome />
    
    <div id="main-content">
        <!-- 3D Canvas Container -->
        <div id="canvas-container" aria-label="3D mycelium visualization" class:hidden={isMap}></div>

        <LegendPanelChrome />
    </div>
</main>

<!-- Map Container -->
<div id="map-container" class:active={isMap}>
    <div id="map-trail-strip" class="map-trail-strip" role="region" aria-label="Connection path" hidden>
        <div class="map-strip-title">Connection Path</div>
    </div>
</div>

<!-- Common UI Overlays -->
<div class="toast-container" id="toast-container"></div>
<div class="experience-reset-toast" id="experience-reset-toast" role="status" aria-live="polite" aria-atomic="true" aria-hidden="true" aria-label="Experience reset notification">
    <strong id="experience-toast-title"></strong>
    <span id="experience-toast-copy"></span>
</div>

<div id="micro-demo-veil" class="micro-demo-veil" aria-hidden="true"></div>
<nav class="view-toggle glass-medium" aria-label="Visualization mode"></nav>
<div class="controls controls-rail" aria-label="Canvas controls"></div>
<div class="hover-tooltip glass-medium" id="hover-tooltip" aria-hidden="true"></div>
<SemanticGuideOverlay />
<div class="trail-review-overlay" id="trail-review-overlay" role="dialog" aria-modal="false" aria-hidden="true" hidden></div>
