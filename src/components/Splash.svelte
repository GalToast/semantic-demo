<!--
  @components/Splash.svelte — W6-T1 splash screen

  Renders while the user has not yet signaled readiness. CSS-only, no
  Three.js, no Worker, no DOM-coupling to the engine. Hides itself once
  `engineReady.value === true`.
-->
<script lang="ts">
  import { engineReady } from '@lib/stores/engine-ready.svelte';

  const dismiss = (e: Event) => {
    e.preventDefault();
    engineReady.signalReady();
  };

  $effect(() => {
    if (typeof document !== 'undefined') {
      document.body.dataset.appState = engineReady.value ? 'ready' : 'splash';
    }
  });
</script>

<main
  class="splash"
  aria-label="Loading semantic explorer"
>
  <div class="splash-frame">
    <h1 class="splash-title">Semantic Explorer</h1>
    <p class="splash-tag">
      A 3D mycelium visualization of Montgomery County business relationships.
   </p>
      <button
         class="splash-cta"
         type="button"
         onclick={dismiss}
         data-testid="splash-cta"
      >
         Explore
   </button>
    <p class="splash-hint">
      Or interact with the page to begin.
   </p>
 </div>
</main>

<style>
  .splash {
    position: fixed;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: radial-gradient(
      circle at 50% 40%,
      rgba(78, 205, 196, 0.18),
      rgba(0, 0, 0, 0.92) 60%
    );
    z-index: var(--z-overlay, 40);
    font-family: system-ui, -apple-system, sans-serif;
    color: rgba(231, 240, 240, 0.9);
  }

  .splash-frame {
    text-align: center;
    padding: 2rem;
    max-width: 32rem;
  }

  .splash-title {
    font-size: 2.25rem;
    font-weight: 200;
    letter-spacing: 0.08em;
    margin: 0 0 1rem;
    text-transform: uppercase;
  }

  .splash-tag {
    font-size: 1rem;
    opacity: 0.72;
    margin: 0 0 2rem;
    line-height: 1.5;
  }

  .splash-cta {
    background: rgba(78, 205, 196, 0.18);
    border: 1px solid rgba(78, 205, 196, 0.6);
    color: inherit;
    font-size: 1rem;
    padding: 0.75rem 2rem;
    border-radius: 4px;
    cursor: pointer;
    letter-spacing: 0.08em;
    transition: background 160ms ease;
  }

  .splash-cta:hover,
  .splash-cta:focus-visible {
    background: rgba(78, 205, 196, 0.32);
    outline: 2px solid rgba(78, 205, 196, 0.8);
    outline-offset: 2px;
  }

  .splash-hint {
    font-size: 0.85rem;
    opacity: 0.55;
    margin: 1.25rem 0 0;
  }
</style>
