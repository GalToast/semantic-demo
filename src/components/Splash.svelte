<!--
  @components/Splash.svelte — W6-T1 splash screen

  Renders while the user has not yet signaled readiness. CSS-only, no
  Three.js, no Worker, no DOM-coupling to the engine. Hides itself once
  `engineReady.value === true`.

  Behaves as a modal gate: role="dialog" + aria-modal, auto-focuses the
  primary CTA, and traps keyboard focus so keyboard/AT users opt in via
  the CTA rather than being dropped into the 3D app chrome.

  Search-on-splash: a search input lets users capture intent before the
  3D engine loads (the data layer is ready within ~1s; the scene takes
  far longer). On submit, the query is written to the `?q=` URL param
  and engineReady fires. SearchInput.svelte's onMount reads `?q=` once
  the app chrome mounts (after the gesture gate) and runs the real
  search against the already-loaded records — no duplicate pipeline.
-->
<script lang="ts">
  import { engineReady } from '@lib/stores/engine-ready.svelte';
  import { pendingSearch } from '@lib/stores/pending-search.svelte';

  /** CSS selector for focusable elements cycled by the modal trap. */
  const FOCUSABLE =
    'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

  // Root ref for modal focus management (bound via bind:this).
  let rootEl: HTMLDivElement | undefined = $state();
  let query = $state('');

  /** Visible focusable elements inside the dialog (filters hidden/zero-size). */
  function focusables(): HTMLElement[] {
    if (!rootEl) return [];
    return Array.from(rootEl.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => {
      if (el.hasAttribute('hidden')) return false;
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && getComputedStyle(el).visibility !== 'hidden';
    });
  }

  /** Write the query to `?q=` so SearchInput.onMount fulfills it post-mount. */
  function commitQueryToUrl(q: string): void {
    if (typeof window === 'undefined' || q.trim().length < 2) return;
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('q', q.trim());
      window.history.replaceState({}, '', url);
    } catch {
      /* replaceState may throw in sandboxed contexts — non-fatal */
    }
  }

  const dismiss = (e?: Event) => {
    e?.preventDefault();
    engineReady.signalReady();
  };

  /** Primary submit: persist the query, then enter the app. */
  function handleSubmit(e: Event): void {
    e.preventDefault();
    const q = query.trim();
    commitQueryToUrl(q);
    // Stage the query for SearchInput to fulfill once the app is live. The
    // `?q=` URL param above makes the result shareable/reloadable; this signal
    // drives the live fulfillment because SearchInput.onMount already ran.
    pendingSearch.set(q);
    engineReady.signalReady();
  }

  // Modal focus management: auto-focus the search input on mount and cycle
  // Tab within the gate so keyboard + screen-reader users aren't dumped into
  // the 3D app chrome (legend, view modes) before opting in. Focus is
  // restored to the previously focused element when the gate dismisses.
  //
  // Uses a local listener (not the shared focus-trap util) so it cannot be
  // clobbered by the data-panel-surface MutationObserver that releases the
  // shared trap on the 'idle' surface.
  $effect(() => {
    if (typeof document === 'undefined' || !rootEl) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const focusFirst = () => focusables()[0]?.focus();
    const raf = requestAnimationFrame(focusFirst);
    const onKeydown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const els = focusables();
      if (els.length === 0) return;
      const first = els[0]!;
      const last = els[els.length - 1]!;
      const activeIdx = els.indexOf(document.activeElement as HTMLElement);
      if (e.shiftKey) {
        if (activeIdx <= 0) {
          e.preventDefault();
          last.focus();
        }
      } else if (activeIdx === -1 || activeIdx === els.length - 1) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeydown);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('keydown', onKeydown);
      if (previouslyFocused && document.contains(previouslyFocused)) {
        previouslyFocused.focus();
      }
    };
  });
</script>

<div
  class="splash"
  role="dialog"
  aria-modal="true"
  aria-labelledby="splash-title"
  bind:this={rootEl}
  hidden={engineReady.value}
>
  <div class="splash-frame">
    <h2 class="splash-title" id="splash-title">Semantic Explorer</h2>
    <p class="splash-tag">
      Explore Montgomery County businesses through an interactive 3D network. Search, click, and discover connections.
    </p>

    <form class="splash-search" onsubmit={handleSubmit} role="search">
      <svg class="splash-search-icon" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="10.5" cy="10.5" r="5.8" fill="none" stroke="currentColor" stroke-width="2" />
        <path d="m15 15 5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
      </svg>
      <input
        class="splash-search-input"
        type="search"
        inputmode="search"
        autocomplete="off"
        autocorrect="off"
        autocapitalize="off"
        spellcheck="false"
        placeholder="Try “coffee”, “plumber”, “Conroe”…"
        aria-label="Search Montgomery County businesses"
        bind:value={query}
        data-testid="splash-search-input"
      />
      <button class="splash-submit" type="submit" data-testid="splash-search-submit">
        Search
      </button>
    </form>

    <button
      class="splash-cta"
      type="button"
      onclick={dismiss}
      data-testid="splash-cta"
    >
      Explore
    </button>
    <p class="splash-hint">Press Enter to search, or just look around.</p>
  </div>
</div>

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
    z-index: var(--z-modal, 400);
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

  .splash-search {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    width: min(26rem, 100%);
    margin: 0 auto;
    background: rgba(7, 16, 24, 0.92);
    border: 1px solid rgba(78, 205, 196, 0.6);
    border-radius: 6px;
    padding: 0.35rem 0.35rem 0.35rem 0.75rem;
    transition: border-color 160ms ease, box-shadow 160ms ease;
  }

  .splash-search:focus-within {
    border-color: rgba(78, 205, 196, 0.85);
    box-shadow: 0 0 0 3px rgba(78, 205, 196, 0.18);
  }

  .splash-search-icon {
    color: var(--color-primary-alt);
    opacity: 0.8;
    flex-shrink: 0;
  }

  .splash-search-input {
    flex: 1;
    min-width: 0;
    min-height: 44px;
    background: none;
    border: none;
    outline: none;
    color: inherit;
    font-family: inherit;
    font-size: 1rem;
  }

  .splash-search-input:focus-visible {
    outline: 2px solid rgba(78, 205, 196, 0.6);
    outline-offset: -2px;
    border-radius: 0.4rem;
  }

  .splash-search-input::placeholder {
    color: rgba(231, 240, 240, 0.4);
  }

  .splash-search-input::-webkit-search-cancel-button {
    display: none;
  }

  .splash-submit {
    flex-shrink: 0;
    min-height: 40px;
    padding: 0 1rem;
    border: none;
    border-radius: 4px;
    background: rgba(78, 205, 196, 0.32);
    color: inherit;
    font-family: inherit;
    font-size: 0.95rem;
    letter-spacing: 0.04em;
    cursor: pointer;
    transition: background 160ms ease;
  }

  .splash-submit:hover,
  .splash-submit:focus-visible {
    background: rgba(78, 205, 196, 0.5);
    outline: 2px solid rgba(78, 205, 196, 0.8);
    outline-offset: 2px;
  }

  .splash-cta {
    display: inline-block;
    margin-top: 1.25rem;
    background: transparent;
    border: none;
    color: rgba(231, 240, 240, 0.6);
    font-size: 0.95rem;
    font-family: inherit;
    padding: 0.5rem 1rem;
    cursor: pointer;
    letter-spacing: 0.08em;
    text-decoration: underline;
    text-underline-offset: 3px;
    transition: color 160ms ease;
  }

  .splash-cta:hover,
  .splash-cta:focus-visible {
    color: rgba(231, 240, 240, 0.9);
  }

  .splash-hint {
    font-size: 0.85rem;
    opacity: 0.55;
    margin: 0.75rem 0 0;
  }
</style>
