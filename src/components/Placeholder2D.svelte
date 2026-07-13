<!--
  @components/Placeholder2D.svelte — W45-A + W47-C: Mobile 2D Placeholder

  Static SVG preview of the semantic mycelium for mobile cold loads.
  Replaces the WebGL canvas on narrow viewports so the 587 KB three.js
  chunk stays off the cold-load critical path. The LCP element is the
  static SVG, which paints fast.

  W47-C: copy was previously aspirational ("8,406 businesses · 4 clusters"
  implied the user was looking at the real product) when actually this is
  a static fallback. Now the title and subtitle explicitly label this as a
  "Preview" and invite the user to open on desktop for the full 3D
  experience. The CTA stays the same ("Enter 3D Scene") because it's already
  honest about what tapping it does.

  Visual contract:
    - Full-viewport (covers the WebGL canvas area)
    - Reuses existing color tokens (--color-primary, --color-primary-alt,
      --color-accent, --color-text-strong)
    - "Preview" label in the title (W47-C) so the user knows this is the
      fallback, not the real product
   - "Click or tap to load the full scene, or open on desktop for the full 3D
     experience" subtitle (W47-C) gives the user a clear alternative path
    - "Enter 3D Scene" CTA, large tap target (≥ 44×44 px), with subtle
      drop shadow + cyan glow that wins the eye-test against the blurred
      orb cluster behind it
    - CSS-only scrim behind the title block ensures contrast regardless
      of where the orbs land
    - Subtle motion: slow drift on each orb (asynchronous, organic) and
      a soft expanding pulse on the CTA — both gated by
      prefers-reduced-motion: reduce via @media query
    - SVG raw weight target ≤ 12 KB — orb geometry is a single unit
      <circle id="orb"> reused via <use>, sphere shading is a single
      radialGradient, scrim is CSS (no extra SVG defs)

  On tap, the CTA fires engineReady.signalReady(), which triggers the
  existing Canvas mount + three.js lazy load flow.
-->
<script lang="ts">
  import { onMount } from 'svelte'
  import { engineReady } from '@lib/stores/engine-ready.svelte'
  import { viewport } from '@lib/stores/viewport.svelte'
  import { setLegendOpen } from '@lib/stores/legend.svelte'
  import { getBypassAttr } from '@lib/orchestration/parity-attrs.svelte'
  import { CONFIG } from '@lib/engine/config'
  import { CLUSTER_COLORS } from '@lib/utils/design-tokens'

  // W50-UX-2: Auto-open the category legend on mobile splash so users
  // discover the category labels. The full Legend.svelte panel is
  // normally hidden via CSS when renderKind is 'placeholder2d', but
  // opening it here makes the categories discoverable without
  // requiring the user to find the small header toggle.
  onMount(() => {
    const renderKind = getBypassAttr('renderKind')
    if (renderKind === 'placeholder2d' && $viewport.isCompact) {
      setLegendOpen(true)
    }
    // Return cleanup: reset legend to closed when the component unmounts
    // (user clicks Explore → renderKind flips to 'webgl'). This ensures
    // the legend returns to its closed-by-default behavior in the
    // 3D scene.
    return () => {
      setLegendOpen(false)
    }
  })

  const enter3d = (e: Event): void => {
    e.preventDefault()
    engineReady.signalReady()
  }

  // W47-C2 (Tier 2 #2.4): compact inline legend so mobile users see what
  // categories they're looking at. The full Legend.svelte panel is hidden
  // on the placeholder via CSS (body[data-render-kind='placeholder2d'])
  // because it would otherwise overlap the CTA — so users have NO
  // terminology access at all on mobile. Showing the first 5 cluster
  // names with their canonical dot colors closes that gap without
  // disrupting the CTA layout. Categories are pulled from CONFIG so
  // the labels stay in sync with the rest of the app.
  const previewCategories = CONFIG.CLUSTER_NAMES.slice(0, 5).map((name, i) => ({
    name,
    color: CLUSTER_COLORS[i] ?? '#888'
  }))
</script>

<!--
  W49-G: this used to be a <main> element, but App.svelte already declares
  one <main id="main-content">. Nesting a second <main> inside the outer
  one trips axe-core's landmark-main-is-top-level and
  landmark-no-duplicate-main rules. Convert to role="region" (a valid
  nested landmark) — same semantics for assistive tech, no duplicate
  main violation.
-->
<div
  role="region"
  aria-label="Semantic explorer preview"
  class="placeholder-2d"
  data-testid="placeholder-2d"
>
  <svg
    class="placeholder-svg"
    viewBox="0 0 375 812"
    preserveAspectRatio="xMidYMid slice"
    aria-hidden="true"
    xmlns="http://www.w3.org/2000/svg"
  >
    <defs>
      <!-- Background wash -->
      <radialGradient id="bg-grad" cx="50%" cy="40%" r="70%">
        <stop offset="0%" stop-color="rgba(var(--color-primary-alt-rgb), 0.14)" />
        <stop offset="60%" stop-color="rgba(7,16,24,0.95)" />
        <stop offset="100%" stop-color="rgba(0,0,0,0.98)" />
      </radialGradient>

      <!-- Unit orb (radius = 1). Reused via <use> + scale to draw each
           cluster as a vibrant colored circle without duplicating geometry. -->
      <circle id="orb" cx="0" cy="0" r="1" />

      <!-- Sphere shading: soft highlight upper-left, gentle vignette lower-right.
           Painted on top of the colored base via a second <use href="#orb">. -->
      <radialGradient id="orb-shade" cx="32%" cy="28%" r="78%">
        <stop offset="0%" stop-color="rgba(255,255,255,0.45)" />
        <stop offset="42%" stop-color="rgba(255,255,255,0)" />
        <stop offset="100%" stop-color="rgba(0,0,0,0.35)" />
      </radialGradient>

      <!-- Soft glow filter: blurs the orb stack then composites crisp shape on top
           so the cluster reads as a hazy, modern-art disc. -->
      <filter id="soft-glow" x="-40%" y="-40%" width="180%" height="180%">
        <feGaussianBlur stdDeviation="6" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>

    <!-- Full-viewport background -->
    <rect width="375" height="812" fill="url(#bg-grad)" />

    <!-- Vibrant orb cluster. Each orb is a colored disc + sphere-shading overlay,
         placed in an asymmetric modern-art composition. The outer .orb-anim wrapper
         exists so CSS keyframes can drift it without disturbing the scale/translate
         on the inner <g>. -->
    <g class="orb-cluster" filter="url(#soft-glow)">
      <g class="orb-anim orb-1">
        <g style="color:var(--color-primary-alt)" transform="translate(95,250) scale(115)">
          <use href="#orb" fill="currentColor" opacity="0.88" />
          <use href="#orb" fill="url(#orb-shade)" />
        </g>
      </g>
      <g class="orb-anim orb-2">
        <g style="color:var(--status-danger)" transform="translate(270,195) scale(88)">
          <use href="#orb" fill="currentColor" opacity="0.85" />
          <use href="#orb" fill="url(#orb-shade)" />
        </g>
      </g>
      <g class="orb-anim orb-3">
        <g style="color:var(--color-accent)" transform="translate(130,410) scale(78)">
          <use href="#orb" fill="currentColor" opacity="0.82" />
          <use href="#orb" fill="url(#orb-shade)" />
        </g>
      </g>
      <g class="orb-anim orb-4">
        <g style="color:var(--status-success)" transform="translate(260,430) scale(100)">
          <use href="#orb" fill="currentColor" opacity="0.86" />
          <use href="#orb" fill="url(#orb-shade)" />
        </g>
      </g>
    </g>

    <!-- Fine spore dots -->
    <g style="fill: var(--color-text-teal-light)" opacity="0.06">
      {#each Array.from({ length: 60 }) as _, i}
        {@const x = 30 + (i * 173) % 315}
        {@const y = 120 + (i * 307) % 500}
        {@const r = 0.5 + (i % 3) * 0.4}
        <circle {x} {y} {r} />
      {/each}
    </g>

    <!-- Thread lines between orbs (subtle) -->
    <g stroke="var(--color-primary-alt)" stroke-width="0.5" opacity="0.08" fill="none">
      <path d="M95,250 Q187,210 270,195" />
      <path d="M130,410 Q187,420 260,430" />
      <path d="M95,250 Q90,330 130,410" />
      <path d="M270,195 Q280,310 260,430" />
    </g>
  </svg>

  <!-- Text overlay (HTML for accessibility + tap target). W47-C: copy is now
       explicitly labeled as a "Preview" so the user knows this is the mobile
       fallback, not the real product. The CTA stays the same ("Enter 3D
       Scene") because it accurately describes what tapping it does. -->
  <div class="placeholder-overlay">
    <h1 class="placeholder-title">
      Semantic Explorer
      <span class="placeholder-badge">Preview</span>
    </h1>
    <p class="placeholder-subtitle">Preview · Montgomery County businesses</p>

    <button
      class="placeholder-cta"
      type="button"
      onclick={enter3d}
      data-testid="placeholder-cta"
      aria-label="Enter 3D scene"
      aria-describedby="placeholder-hint"
    >
      <span class="cta-icon" aria-hidden="true">◆</span>
      Enter 3D Scene
    </button>

    <ul class="placeholder-legend" data-testid="placeholder-legend" aria-label="Business categories in the dataset">
      {#each previewCategories as cat (cat.name)}
        <li class="placeholder-legend-item">
          <span class="placeholder-legend-dot" style="background-color: {cat.color}" aria-hidden="true"></span>
          <span class="placeholder-legend-label">{cat.name}</span>
        </li>
      {/each}
    </ul>

    <p class="placeholder-hint" id="placeholder-hint">
      Click or tap to load the full 3D scene.
    </p>
  </div>
</div>
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

  /* CSS-only scrim behind the title block. Lives in the overlay's stacking
     context so it sits in front of the SVG (z-index 0) but behind every line
     of copy. Pointer-events disabled so it never intercepts the CTA. */
  .placeholder-overlay::before {
    content: '';
    position: absolute;
    inset: -10% -18% -14%;
    background: radial-gradient(
      ellipse at center,
      rgba(2, 8, 14, 0.74) 0%,
      rgba(2, 8, 14, 0.48) 48%,
      rgba(2, 8, 14, 0) 86%
    );
    z-index: -1;
    pointer-events: none;
    border-radius: 28px;
    filter: blur(2px);
  }

  .placeholder-title {
    font-size: clamp(1.3rem, 5.5vw, 2rem);
    font-weight: 200;
    letter-spacing: 0.08em;
    margin: 0 0 0.5rem;
    text-transform: uppercase;
    color: rgba(255, 255, 255, 0.98);
  }

  /* W47-C: "Preview" badge next to the title so the user knows this is the
     mobile fallback, not the real product. Inline so the title stays on
     one line on small viewports. */
  .placeholder-badge {
    display: inline-block;
    margin-left: 0.6rem;
    padding: 0.15rem 0.55rem;
    font-size: 0.55em;
    font-weight: 600;
    letter-spacing: 0.12em;
    color: rgba(var(--color-primary-alt-rgb), 0.95);
    border: 1px solid rgba(var(--color-primary-alt-rgb), 0.45);
    border-radius: 4px;
    vertical-align: middle;
    text-transform: uppercase;
  }

  .placeholder-subtitle {
    font-size: clamp(0.75rem, 2.5vw, 0.95rem);
    opacity: 0.72;
    margin: 0 0 0.25rem;
    line-height: 1.5;
  }

  .placeholder-cta {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    background: rgba(var(--color-primary-alt-rgb), 0.18);
    border: 1px solid rgba(var(--color-primary-alt-rgb), 0.6);
    color: rgba(255, 255, 255, 0.98);
    font-size: 1rem;
    padding: 0.75rem 2rem;
    border-radius: 4px;
    cursor: pointer;
    letter-spacing: 0.08em;
    min-height: 44px;
    min-width: 44px;
    pointer-events: auto;
    /* Stack: cyan halo + deep drop shadow + inset top highlight.
       Together they make the CTA win the eye-test against the blurred orbs
       behind it without looking like a stacked card. */
    box-shadow:
      0 0 24px rgba(82, 229, 215, 0.28),
      0 10px 28px rgba(0, 0, 0, 0.55),
      inset 0 1px 0 rgba(255, 255, 255, 0.14);
    transition:
      background 160ms ease,
      border-color 160ms ease,
      box-shadow 220ms ease,
      transform 220ms ease;
  }

  .placeholder-cta:hover,
  .placeholder-cta:focus-visible {
    background: rgba(var(--color-primary-alt-rgb), 0.32);
    border-color: rgba(78, 229, 215, 0.85);
    box-shadow:
      0 0 32px rgba(82, 229, 215, 0.45),
      0 12px 32px rgba(0, 0, 0, 0.6),
      inset 0 1px 0 rgba(255, 255, 255, 0.18);
    transform: translateY(-1px);
    outline: 2px solid rgba(var(--color-primary-alt-rgb), 0.85);
    outline-offset: 2px;
  }

  .cta-icon {
    font-size: 0.75em;
    opacity: 0.85;
  }

  .placeholder-hint {
    font-size: 0.8rem;
    opacity: 0.5;
    margin: 1rem 0 0;
    letter-spacing: 0.02em;
  }

  /* W47-C2 (Tier 2 #2.4): compact inline legend so mobile users get
     terminology access even though the full Legend.svelte panel is
     hidden behind the CTA on the placeholder. Two-column grid of 5 items;
     capped at 320px wide so it doesn't dominate the placeholder. */
  .placeholder-legend {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.35rem 0.9rem;
    margin: 1.1rem auto 0;
    padding: 0;
    list-style: none;
    max-width: 20rem;
    pointer-events: auto;
  }
  .placeholder-legend-item {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    font-size: 0.7rem;
    color: rgba(231, 240, 240, 0.78);
    letter-spacing: 0.01em;
  }
  .placeholder-legend-dot {
    display: inline-block;
    width: 0.6rem;
    height: 0.6rem;
    border-radius: 999px;
    flex-shrink: 0;
  }
  .placeholder-legend-label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* ── Motion ────────────────────────────────────────────────────────────
     Each orb drifts a few pixels on its own slow loop with a negative
     delay so they don't pulse in lock-step. The CTA breathes a soft
     expanding ring so it keeps catching the eye against the moving orbs.
     Both gated by @media (prefers-reduced-motion: no-preference). */

  @keyframes orb-drift-a {
    0%, 100% { transform: translate(0, 0); }
    50%      { transform: translate(8px, -6px); }
  }
  @keyframes orb-drift-b {
    0%, 100% { transform: translate(0, 0); }
    50%      { transform: translate(-7px, 6px); }
  }
  @keyframes orb-drift-c {
    0%, 100% { transform: translate(0, 0); }
    50%      { transform: translate(6px, 7px); }
  }
  @keyframes orb-drift-d {
    0%, 100% { transform: translate(0, 0); }
    50%      { transform: translate(-9px, -5px); }
  }

  @keyframes cta-pulse {
    0% {
      box-shadow:
        0 0 0 0 rgba(82, 229, 215, 0.45),
        0 0 24px rgba(82, 229, 215, 0.28),
        0 10px 28px rgba(0, 0, 0, 0.55),
        inset 0 1px 0 rgba(255, 255, 255, 0.14);
    }
    70% {
      box-shadow:
        0 0 0 14px rgba(82, 229, 215, 0),
        0 0 24px rgba(82, 229, 215, 0.28),
        0 10px 28px rgba(0, 0, 0, 0.55),
        inset 0 1px 0 rgba(255, 255, 255, 0.14);
    }
    100% {
      box-shadow:
        0 0 0 0 rgba(82, 229, 215, 0),
        0 0 24px rgba(82, 229, 215, 0.28),
        0 10px 28px rgba(0, 0, 0, 0.55),
        inset 0 1px 0 rgba(255, 255, 255, 0.14);
    }
  }

  @media (prefers-reduced-motion: no-preference) {
    .orb-1 { animation: orb-drift-a 9s ease-in-out infinite; }
    .orb-2 { animation: orb-drift-b 11s ease-in-out infinite -2s; }
    .orb-3 { animation: orb-drift-c 8s ease-in-out infinite -3s; }
    .orb-4 { animation: orb-drift-d 10s ease-in-out infinite -1s; }
    .placeholder-cta { animation: cta-pulse 2.6s ease-out infinite; }
  }

  @media (prefers-reduced-motion: reduce) {
    .orb-anim,
    .placeholder-cta {
      animation: none !important;
      transition: none !important;
    }
  }

  /* Small-viewport adjustments: keep the placeholder usable on 320–360 px
     devices and on narrow desktop windows that still fall back to the
     2D preview. Reduces padding, collapses the legend to a single column,
     and slightly trims the CTA so content is not pushed below the fold. */
  @media (max-width: 360px) {
    .placeholder-overlay {
      padding: 1.25rem;
      max-width: 100%;
    }
    .placeholder-title {
      font-size: 1.2rem;
    }
    .placeholder-badge {
      margin-left: 0.4rem;
      padding: 0.1rem 0.4rem;
      font-size: 0.5em;
    }
    .placeholder-cta {
      padding: 0.6rem 1.5rem;
      font-size: 0.95rem;
    }
    .placeholder-legend {
      grid-template-columns: 1fr;
      max-width: 16rem;
      gap: 0.25rem 0.6rem;
    }
    .placeholder-legend-item {
      font-size: 0.65rem;
    }
    .placeholder-hint {
      font-size: 0.75rem;
    }
  }

  @media (max-height: 700px) {
    .placeholder-overlay {
      padding: 1.25rem;
    }
    .placeholder-legend {
      margin-top: 0.8rem;
    }
    .placeholder-hint {
      margin-top: 0.6rem;
    }
  }
</style>
