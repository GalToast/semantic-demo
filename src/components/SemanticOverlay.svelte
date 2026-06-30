<!--
  @components/SemanticOverlay.svelte — Manifold + lens overlay

  Ported from:
 - (semantic overlay rendering)
 - (manifold, lens uniforms)

  Renders the semantic manifold and lens overlays that show relationship
  density and semantic proximity. Delegates WebGL operations to the engine
  bridge — this component only manages the UI chrome and visibility state.
-->
<script lang="ts">
  import { hasFocus, focusedIndex, currentSurface } from '@lib/stores/navigation.svelte.ts';
  import { threadInspectorActive } from '@lib/stores/focus.svelte.ts';
  import { viewport } from '@lib/stores/viewport.svelte.ts';

  interface Props {
    /** Whether the overlay chrome is visible */
    visible?: boolean;
  }

  let { visible = false }: Props = $props();

  let isFocused = $derived(hasFocus());
  let surface = $derived(currentSurface());
  let threadActive = $derived(threadInspectorActive());
  let currentIdx = $derived(focusedIndex());

  /** The overlay is active when in focus/inside mode or thread-inspect surface */
  let overlayActive = $derived(
    visible && (isFocused || surface === 'inside' || surface === 'thread-inspect' || threadActive)
  );

  /** Overlay mode determines which visual to show */
  let overlayMode = $derived.by((): 'manifold' | 'lens' | 'thread' | null => {
    if (threadActive) return 'thread';
    if (surface === 'inside') return 'lens';
    if (isFocused) return 'manifold';
    return null;
  });
</script>

{#if overlayActive}
  <div
    class="semantic-overlay"
    id="semantic-overlay"
    aria-label="Semantic overlay"
    role="presentation"
  >
    <!-- Overlay indicator badge -->
    <div class="overlay-badge" class:thread={overlayMode === 'thread'} title={overlayMode === 'thread' ? 'A path of connected businesses following the strongest signal chain.' : overlayMode === 'lens' ? 'Deep exploration lens focused on a single neighborhood.' : 'Semantic proximity is highlighted across the scene.'}>
      {#if overlayMode === 'manifold'}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <circle cx="12" cy="12" r="10"/>
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
          <path d="M2 12h20"/>
        </svg>
        <span class="badge-label">Manifold</span>
      {:else if overlayMode === 'lens'}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <circle cx="11" cy="11" r="8"/>
          <path d="m21 21-4.35-4.35"/>
        </svg>
        <span class="badge-label">Lens</span>
      {:else if overlayMode === 'thread'}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>
        </svg>
        <span class="badge-label">Thread</span>
      {/if}
    </div>

    <!-- Node indicator -->
    {#if currentIdx != null}
      <div class="overlay-node-indicator">
        <span class="node-idx">#{currentIdx}</span>
      </div>
    {/if}

    {#if !$viewport.isCompact}
      <div class="overlay-hint">
        {#if overlayMode === 'manifold'}
          Semantic proximity active
        {:else if overlayMode === 'lens'}
          Deep exploration lens
        {:else if overlayMode === 'thread'}
          Thread connections visible
        {/if}
      </div>
    {/if}
  </div>
{/if}

<style>
  .semantic-overlay {
    position: absolute;
    top: 4rem;
    left: 50%;
    transform: translateX(-50%);
    z-index: var(--z-overlays, 30);
    display: flex;
    align-items: center;
    gap: 0.5rem;
    pointer-events: none;
  }

  .overlay-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.2rem 0.5rem;
    background: rgba(7, 16, 24, 0.8);
    backdrop-filter: blur(8px);
    border: 1px solid rgba(78, 205, 196, 0.2);
    border-radius: 0.3rem;
    color: var(--color-primary-alt);
    font-size: 0.6rem;
    font-family: 'Nunito Sans', sans-serif;
    font-weight: 600;
    animation: overlay-in 0.3s ease-out;
  }
  .overlay-badge.thread {
    border-color: rgba(255, 107, 107, 0.25);
    color: var(--status-danger);
  }

  @media (prefers-reduced-motion: reduce) {
    .overlay-badge {
      animation: none;
    }
  }

  @keyframes overlay-in {
    from { opacity: 0; transform: translateY(-4px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .badge-label {
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .overlay-node-indicator {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.55rem;
    color: rgba(176, 208, 208, 0.4); /* a11y-ok: caption-text — mono node indicator */
  }

  .overlay-hint {
    font-size: 0.55rem;
    color: rgba(176, 208, 208, 0.35); /* a11y-ok: caption-text — italic overlay hint */
    font-style: italic;
  }
</style>
