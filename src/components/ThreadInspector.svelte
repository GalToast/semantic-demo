<!--
  @components/ThreadInspector.svelte — Connection inspector
-->
<script lang="ts">
  import { onMount, tick } from 'svelte';
  import {
    focusStore,
    threadInspector,
    clearThreadInspector,
    pinThread,
    unpinThread
  } from '@lib/stores/focus.svelte';
  import type { FocusStoreState } from '@lib/stores/focus.svelte';
  import { dispatchNavTransition, focusedIndex, NAV_TRANSITION_ACTIONS, updateNavState } from '@lib/stores/navigation.svelte.ts';
  import { appState } from '@lib/state/app.svelte';
  import { viewport } from '@lib/stores/viewport.svelte.ts';
  import { addWalkHistoryIndex, setTrailDepth, trailDepth, walkHistoryIndices } from '@lib/stores/journey.svelte.ts';

  interface Props {
    visible?: boolean;
  }

  let { visible = false }: Props = $props();
  let focusSnapshot = $state<FocusStoreState>(focusStore());
  let bodyThreadInspectSurface = $state('idle');
  let bodyStrandJourney = $state('idle');

  function removeLegacyInspectorDuplicates(): void {
    if (typeof document === 'undefined') return;
    for (const legacyInspector of document.querySelectorAll<HTMLElement>('#focus-thread-inspector')) {
      if (!legacyInspector.closest('#thread-inspector')) legacyInspector.remove();
    }
  }

  onMount(removeLegacyInspectorDuplicates);

  $effect(() => {
    if (!visible || !focusSnapshot.threadInspector.active) return;
    void tick().then(removeLegacyInspectorDuplicates);
  });

  $effect(() => {
    const unsubscribe = focusStore.subscribe((next) => {
      focusSnapshot = next;
    });
    return unsubscribe;
  });

  $effect(() => {
    if (typeof document === 'undefined') return;
    const sync = () => {
      bodyThreadInspectSurface = document.body?.dataset.threadInspectSurface || 'idle';
      bodyStrandJourney = document.body?.dataset.strandJourney || 'idle';
    };
    const obs = new MutationObserver(sync);
    obs.observe(document.body, { attributes: true, attributeFilter: ['data-thread-inspect-surface', 'data-strand-journey'] });
    sync();
    return () => obs.disconnect();
  });

  // ── Escape key to close inspector ───────────────────────────────────────────
  // T1: a global keydown listener (active only while the inspector is
  // visible + active) so users can close the panel with the Escape key
  // without first moving focus into the panel. The listener is removed
  // on inspector hide/unmount, so it doesn't leak when the panel isn't
  // open. Cancel the event so any outer handler doesn't double-handle.
  $effect(() => {
    if (!visible || !focusSnapshot.threadInspector.active) return;
    const handleKeydown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        clearThreadInspector();
      }
    };
    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  });

  /** Fallback: read inspectedThreadIndex from focusStore (body.dataset was a legacy mirror). */
  function bodyInspectedIndex(): number | null {
    const snap = focusStore();
    const idx = snap.threadInspector.inspectedIndex ?? snap.inspectedStrandIndex;
    return idx != null && Number.isFinite(idx) ? idx : null;
  }

  function localizeSource(source: string | undefined): string {
    switch (source) {
      case 'rail-hover': return 'hovering a neighbor';
      case 'rail-inspect': return 'inspecting a neighbor';
      case 'semantic-search': return 'your search anchor';
      case 'trail-step': return 'your last trail step';
      default: return 'focus';
    }
  }

  function handlePin(index: number | null, pinnedIndex: number | null): void {
    if (index === null || !Number.isFinite(index)) return;
    if (pinnedIndex === index) unpinThread();
    else pinThread(index);
  }

  function handleFollow(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    const inspectedIndex = threadInspector().inspectedIndex ?? bodyInspectedIndex();
    if (inspectedIndex === null || !Number.isFinite(inspectedIndex)) return;
    const actions = window.__APP_ACTIONS__;

    const currentIndex = focusedIndex();
    const history = walkHistoryIndices();
    const nextHistory = [...history];
    if (history.length === 0 && currentIndex !== null && Number.isFinite(currentIndex)) { // audit-ok: plain Ln() callback, not transformed
      addWalkHistoryIndex(currentIndex);
      nextHistory.push(currentIndex);
    }
    addWalkHistoryIndex(inspectedIndex);
    nextHistory.push(inspectedIndex);
    const nextTrailDepth = Math.max(1, trailDepth());
    setTrailDepth(nextTrailDepth);
    actions?.walkThreadNeighbor?.(inspectedIndex, {
      surface: 'thread-inspector',
      reason: 'thread-inspector-follow'
    });
    actions?.clearThreadInspection?.({ force: true, preserveJourney: false });
    updateNavState({
      focusedIndex: inspectedIndex,
      mode: 'trail',
      surface: 'focus',
      trailDepth: nextTrailDepth,
      walkHistoryIndices: nextHistory,
      lastTraversalReason: 'thread-inspector-follow'
    });
    dispatchNavTransition(NAV_TRANSITION_ACTIONS.WALK_THREAD, {
      index: inspectedIndex,
      reason: 'thread-inspector-follow'
    });
    clearThreadInspector();
  }
</script>

{#if visible && focusSnapshot.threadInspector.active}
  {@const inspector = focusSnapshot.threadInspector}
  {@const inspectedIndex = inspector.inspectedIndex ?? bodyInspectedIndex()}
  {@const pinned = inspectedIndex != null && inspector.pinnedIndex === inspectedIndex}
  {@const isMobile = $viewport.isCompact}
  {@const pinText = pinned ? (isMobile ? 'Unpin' : 'Unpin Connection') : (isMobile ? 'Pin' : 'Pin Connection')}
  {@const followTargetsCurrent =
    inspectedIndex != null && Number.isFinite(inspectedIndex) && inspectedIndex === focusedIndex()}
  {@const journeyPhaseIsExploring = focusSnapshot.strandContinuityPhase === 'exploring'}
  {@const followText = journeyPhaseIsExploring
    ? 'Following'
    : followTargetsCurrent
      ? (isMobile ? 'Current' : 'Current Stop')
      : (isMobile ? 'Follow' : 'Follow Connection')}
  {@const followAriaLabel = journeyPhaseIsExploring
    ? 'Following this connection'
    : followTargetsCurrent
      ? 'This connection is the current path stop'
      : 'Follow this connection as the next path stop'}
  {@const followDisabled = inspectedIndex === null || followTargetsCurrent || journeyPhaseIsExploring}
  <div
    class="thread-inspector"
    id="thread-inspector"
    aria-label="Thread connection inspector"
    role="complementary"
    aria-live="polite"
    onpointerdown={(e) => e.stopPropagation()}
    onwheel={(e) => e.stopPropagation()}
    ondblclick={(e) => e.stopPropagation()}
  >
    <section
      class="focus-thread-inspector active"
      id="focus-thread-inspector"
      aria-labelledby="focus-thread-inspector-title"
      data-thread-inspect-surface={bodyThreadInspectSurface}
      data-strand-journey={bodyStrandJourney}
    >
      <div class="inspector-header">
        <span class="focus-thread-inspector-kicker">Connection Preview</span>
        <button type="button" class="inspector-close" onclick={clearThreadInspector} aria-label="Close inspector"></button>
      </div>
      <h2 id="focus-thread-inspector-title" class="focus-thread-inspector-title inspector-title">
        <!-- Renders as 'Thread connection to node N' (when name missing) or 'Thread connection to {name}' when present. -->
        {inspectedIndex != null ? `Thread connection to ${appState.points[inspectedIndex]?.name ?? `node ${inspectedIndex}`}` : 'Connection Inspector'}
      </h2>
      <p id="focus-thread-inspector-copy" class="focus-thread-inspector-copy inspector-source">
        {inspectedIndex != null
          ? `Previewing the semantic connection from ${localizeSource(inspector.source)} to ${appState.points[inspectedIndex]?.name ?? `node ${inspectedIndex}`}.`
          : 'Preview why this nearby stop belongs in the current focus path.'}
      </p>
      {#if inspector.segmentCount > 0 || inspector.braidCount > 0 || inspector.endpointCount > 0}
        <div id="focus-thread-inspector-meta" class="focus-thread-inspector-meta inspector-stats" role="list" aria-label="Connection statistics: {inspector.segmentCount} segments, {inspector.braidCount} braids, {inspector.endpointCount} endpoints">
          <span role="listitem">{inspector.segmentCount} segments</span>
          <span role="listitem">{inspector.braidCount} braids</span>
          <span role="listitem">{inspector.endpointCount} endpoints</span>
        </div>
      {/if}
      <div class="focus-thread-inspector-actions" aria-label="Thread actions">
        <button
          id="btn-thread-pin"
          type="button"
          class="thread-action primary"
          onclick={() => handlePin(inspectedIndex, inspector.pinnedIndex)}
          disabled={inspectedIndex === null}
          aria-pressed={pinned}
        >
          {pinText}
        </button>
        <button
          id="btn-thread-follow"
          type="button"
          class="thread-action"
          onclick={handleFollow}
          disabled={followDisabled}
          aria-disabled={followDisabled}
          aria-busy={journeyPhaseIsExploring}
          aria-label={followAriaLabel}
        >
          {followText}
        </button>
        <button
          id="btn-thread-clear"
          type="button"
          class="thread-action"
          onclick={clearThreadInspector}
        >
          Clear
        </button>
      </div>
    </section>
  </div>
{:else if visible && !focusSnapshot.threadInspector.active}
  <!-- Empty-state guidance: inspector is requested but no real thread strand exists -->
  <div
    class="thread-inspector thread-inspector--empty"
    id="thread-inspector"
    aria-label="Thread connection inspector"
    role="complementary"
    onpointerdown={(e) => e.stopPropagation()}
    onwheel={(e) => e.stopPropagation()}
    ondblclick={(e) => e.stopPropagation()}
  >
    <section
      class="focus-thread-inspector"
      id="focus-thread-inspector"
      aria-labelledby="focus-thread-inspector-title"
      data-thread-inspect-surface={bodyThreadInspectSurface}
      data-strand-journey={bodyStrandJourney}
    >
      <div class="inspector-header">
        <span class="focus-thread-inspector-kicker">Connection Preview</span>
        <button type="button" class="inspector-close" onclick={clearThreadInspector} aria-label="Close inspector"></button>
      </div>
      <h2 id="focus-thread-inspector-title" class="focus-thread-inspector-title inspector-title">
        Connection Inspector
      </h2>
      <p id="focus-thread-inspector-copy" class="focus-thread-inspector-copy inspector-source">
        Select a nearby stop to preview why it belongs here, then pin or follow.
      </p>
      <div id="focus-thread-inspector-meta" class="focus-thread-inspector-meta inspector-stats" role="list" aria-label="Connection statistics unavailable until a nearby stop is selected">
        <span role="listitem">Preview connection</span>
      </div>
      <div class="focus-thread-inspector-actions" aria-label="Thread actions">
        <button
          id="btn-thread-pin"
          type="button"
          class="thread-action primary"
          disabled
        >
          Pin
        </button>
        <button
          id="btn-thread-follow"
          type="button"
          class="thread-action"
          disabled
        >
          Follow
        </button>
        <button
          id="btn-thread-clear"
          type="button"
          class="thread-action"
          onclick={clearThreadInspector}
        >
          Clear
        </button>
      </div>
    </section>
  </div>
{/if}

<style>
  .thread-inspector {
    position: absolute;
    top: 1rem;
    left: 1rem;
    z-index: var(--z-compass);
    background: rgba(var(--color-surface-chrome-rgb), 0.92);
    backdrop-filter: blur(12px);
    border: 1px solid rgba(var(--color-primary-alt-rgb), 0.2);
    border-radius: var(--radius-tight);
    padding: 0.6rem 0.75rem;
    max-width: 260px;
    pointer-events: auto;
  }
  .thread-inspector--empty {
    opacity: 0.7;
    border-style: dashed;
    border-color: rgba(var(--color-primary-alt-rgb), 0.14);
  }
  .focus-thread-inspector {
    display: grid;
    gap: 0.45rem;
  }
  .inspector-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .focus-thread-inspector-kicker {
    font-family: var(--font-display);
    font-size: 0.62rem;
    font-weight: 600;
    letter-spacing: 0;
    color: var(--color-primary-alt);
    text-transform: uppercase;
  }
  .focus-thread-inspector-title {
    margin: 0;
    font-family: var(--font-display);
    font-size: 0.84rem;
    font-weight: 700;
    line-height: 1.15;
    color: var(--color-text-teal-light);
  }
  .focus-thread-inspector-copy {
    margin: 0;
    font-size: 0.68rem;
    line-height: 1.35;
    color: var(--color-text-teal-muted);
  }
  .inspector-close {
    display: inline-grid;
    place-items: center;
    width: 44px;
    min-width: 44px;
    height: 44px;
    background: none;
    border: none;
    color: var(--color-text-teal-dark);
    font-size: 1rem;
    cursor: pointer;
    padding: 0;
    line-height: 1;
    transition: color 0.15s;
  }
  /* T1: × glyph via CSS pseudo-element (not text content) so screen
   * readers don't read the character when announcing the button.
   * The aria-label='Close inspector' already provides the accessible name. */
  .inspector-close::before {
    content: '\00d7';
    font-size: 1.2rem;
    line-height: 1;
  }
  .inspector-close:hover {
    color: var(--color-text-teal-light);
  }
  .focus-thread-inspector-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem 0.55rem;
    font-family: var(--font-mono);
    font-size: 0.6rem;
    color: var(--color-text-teal-dark);
  }
  .focus-thread-inspector-actions {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.35rem;
    align-items: stretch;
    max-height: 54px;
  }
  .thread-action {
    min-height: 44px;
    border: 1px solid rgba(var(--color-primary-alt-rgb), 0.22);
    border-radius: 0.35rem;
    background: rgba(var(--color-primary-alt-rgb), 0.08);
    color: var(--color-text-teal-light);
    font: 600 0.64rem/1 'Bricolage Grotesque', sans-serif;
    cursor: pointer;
  }
  .thread-action:disabled {
    cursor: default;
    color: var(--color-text-teal-dark);
    background: rgba(255, 255, 255, 0.04);
  }
  .thread-action.primary {
    border-color: rgba(var(--color-primary-alt-rgb), 0.65);
    background: rgba(var(--color-primary-alt-rgb), 0.35);
    color: #caf4f1;
    box-shadow: 0 0 8px rgba(var(--color-primary-alt-rgb), 0.2);
  }
  .thread-action.primary:hover:not(:disabled) {
    background: rgba(var(--color-primary-alt-rgb), 0.45);
    box-shadow: 0 0 12px rgba(var(--color-primary-alt-rgb), 0.35);
  }
  .thread-action.primary:disabled {
    color: var(--color-text-teal-dark);
    background: rgba(255, 255, 255, 0.04);
    border-color: rgba(var(--color-primary-alt-rgb), 0.22);
    box-shadow: none;
  }
</style>
