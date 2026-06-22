<!--
  @components/Placeholder2D.svelte — W45-A: Mobile 2D Placeholder

  Static SVG preview of the semantic mycelium for mobile cold loads.
  Replaces the WebGL canvas on narrow viewports so the 587 KB three.js
  chunk stays off the cold-load critical path. The LCP element is the
  static SVG, which paints fast.

  Visual contract:
    - Full-viewport (covers the WebGL canvas area)
    - Reuses existing color tokens (--color-primary, --color-primary-alt,
      --color-accent, --color-text-strong)
    - Conveys "8,406 businesses, 4 clusters" with cluster-shape silhouettes
    - "Enter 3D scene" CTA, large tap target (≥ 44×44 px)
    - prefers-reduced-motion: static, no parallax or pulse
    - SVG raw weight target ≤ 12 KB

  On tap, the CTA fires engineReady.signalReady(), which triggers the
  existing Canvas mount + three.js lazy load flow.
-->
<script lang="ts">
  import { engineReady } from '@lib/stores/engine-ready.svelte'

  const enter3d = (e: Event): void => {
    e.preventDefault()
    engineReady.signalReady()
  }

  const reduced =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
</script>

<main
  class="placeholder-2d"
  aria-label="Semantic explorer preview"
  data-testid="placeholder-2d"
>
  <svg
    class="placeholder-svg"
    viewBox="0 0 375 812"
    preserveAspectRatio="xMidYMid slice"
    aria-hidden="true"
    xmlns="http://www.w3.org/2000/svg"
  >
    <!-- Background gradient -->
    <defs>
      <radialGradient id="bg-grad" cx="50%" cy="40%" r="70%">
        <stop offset="0%" stop-color="rgba(78,205,196,0.14)" />
        <stop offset="60%" stop-color="rgba(7,16,24,0.95)" />
        <stop offset="100%" stop-color="rgba(0,0,0,0.98)" />
      </radialGradient>

      <!-- Cluster blob shape (reused via <use>) -->
      <path
        id="cluster-blob"
        d="M50,0 C75,-5 95,15 100,40 C105,70 85,95 55,100 C25,105 -5,85 0,55 C-5,25 20,-5 50,0Z"
      />

      <!-- Soft glow filter -->
      <filter id="soft-glow" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="4" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>

    <!-- Full-viewport background -->
    <rect width="375" height="812" fill="url(#bg-grad)" />

    <!-- Four cluster silhouettes arranged in a soft diamond -->
    <g transform="translate(187, 320)" filter="url(#soft-glow)">
      <!-- Cluster 1: teal (General Business) -->
      <use href="#cluster-blob" x="-60" y="-50" fill="#4ecdc4" opacity="0.22" transform="scale(1.2) rotate(12)" />
      <!-- Cluster 2: coral (Professional Services) -->
      <use href="#cluster-blob" x="35" y="-55" fill="#ff6b6b" opacity="0.18" transform="scale(1.05) rotate(-8)" />
      <!-- Cluster 3: amber (Food & Hospitality) -->
      <use href="#cluster-blob" x="-45" y="45" fill="#ffd93d" opacity="0.16" transform="scale(0.95) rotate(20)" />
      <!-- Cluster 4: green (Construction & Trades) -->
      <use href="#cluster-blob" x="50" y="40" fill="#6bcb77" opacity="0.20" transform="scale(1.1) rotate(-15)" />
    </g>

    <!-- Fine spore dots -->
    <g fill="#ffffff" opacity="0.06">
      {#each Array.from({ length: 60 }) as _, i}
        {@const x = 30 + (i * 173) % 315}
        {@const y = 120 + (i * 307) % 500}
        {@const r = 0.5 + (i % 3) * 0.4}
        <circle {x} {y} {r} />
      {/each}
    </g>

    <!-- Thread lines between clusters (subtle) -->
    <g stroke="#4ecdc4" stroke-width="0.5" opacity="0.08" fill="none">
      <path d="M127,270 Q187,240 247,265" />
      <path d="M142,370 Q187,400 232,365" />
      <path d="M127,270 Q100,320 142,370" />
      <path d="M247,265 Q275,320 232,365" />
    </g>
  </svg>

  <!-- Text overlay (HTML for accessibility + tap target) -->
  <div class="placeholder-overlay">
    <h1 class="placeholder-title">Semantic Explorer</h1>
    <p class="placeholder-subtitle">Montgomery County Business Mycelium</p>
    <p class="placeholder-count">8,406 businesses · 4 clusters</p>

    <button
      class="placeholder-cta"
      type="button"
      onclick={enter3d}
      data-testid="placeholder-cta"
      aria-label="Enter 3D scene"
    >
      <span class="cta-icon" aria-hidden="true">◆</span>
      Enter 3D Scene
    </button>

    {#if !reduced}
      <p class="placeholder-hint">Tap to explore the full 3D network</p>
    {/if}
  </div>
</main>

<style>
  .placeholder-2d {
    position: fixed;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: var(--z-canvas, 0);
    overflow: hidden;
  }

  .placeholder-svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    display: block;
  }

  .placeholder-overlay {
    position: relative;
    z-index: 1;
    text-align: center;
    padding: 2rem;
    max-width: 32rem;
    color: rgba(231, 240, 240, 0.92);
    font-family: system-ui, -apple-system, sans-serif;
    pointer-events: none; /* let clicks pass through to the CTA only */
  }

  .placeholder-title {
    font-size: 2rem;
    font-weight: 200;
    letter-spacing: 0.08em;
    margin: 0 0 0.5rem;
    text-transform: uppercase;
    color: rgba(255, 255, 255, 0.98);
  }

  .placeholder-subtitle {
    font-size: 0.95rem;
    opacity: 0.72;
    margin: 0 0 0.25rem;
    line-height: 1.5;
  }

  .placeholder-count {
    font-size: 0.85rem;
    opacity: 0.55;
    margin: 0 0 2rem;
    letter-spacing: 0.04em;
  }

  .placeholder-cta {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    background: rgba(78, 205, 196, 0.18);
    border: 1px solid rgba(78, 205, 196, 0.6);
    color: inherit;
    font-size: 1rem;
    padding: 0.75rem 2rem;
    border-radius: 4px;
    cursor: pointer;
    letter-spacing: 0.08em;
    transition: background 160ms ease;
    min-height: 44px;
    min-width: 44px;
    pointer-events: auto;
  }

  .placeholder-cta:hover,
  .placeholder-cta:focus-visible {
    background: rgba(78, 205, 196, 0.32);
    outline: 2px solid rgba(78, 205, 196, 0.8);
    outline-offset: 2px;
  }

  .cta-icon {
    font-size: 0.75em;
    opacity: 0.8;
  }

  .placeholder-hint {
    font-size: 0.8rem;
    opacity: 0.45;
    margin: 1rem 0 0;
  }

  @media (prefers-reduced-motion: reduce) {
    .placeholder-cta {
      transition: none;
    }
  }
</style>
