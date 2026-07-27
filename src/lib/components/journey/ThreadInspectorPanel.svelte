<script lang="ts">
  import { clearThreadInspector, pinThread, unpinThread } from '@lib/stores/focus.svelte';
  import type { FocusStoreState } from '@lib/stores/focus.svelte';
  import { dispatchNavTransition, focusedIndex, NAV_TRANSITION_ACTIONS, updateNavState } from '@lib/stores/navigation.svelte.ts';
  import { appState } from '@lib/state/app.svelte';
  import { viewport } from '@lib/stores/viewport.svelte.ts';
  import { addWalkHistoryIndex, setTrailDepth, trailDepth, walkHistoryIndices } from '@lib/stores/journey.svelte.ts';

  interface Props {
    focusSnapshot: FocusStoreState;
    bodyThreadInspectSurface?: string;
    bodyStrandJourney?: string;
  }

  let { focusSnapshot, bodyThreadInspectSurface = 'idle', bodyStrandJourney = 'idle' }: Props = $props();

  const inspector = $derived(focusSnapshot.threadInspector);
  const active = $derived(inspector.active);

  /** Fallback: read inspectedThreadIndex from focusStore (body.dataset was a legacy mirror). */
  function bodyInspectedIndex(): number | null {
    const snap = focusSnapshot;
    const idx = snap.threadInspector.inspectedIndex ?? snap.inspectedStrandIndex;
    return idx != null && Number.isFinite(idx) ? idx : null;
  }

  const inspectedIndex = $derived(inspector.inspectedIndex ?? bodyInspectedIndex());
  const pinned = $derived(inspectedIndex != null && inspector.pinnedIndex === inspectedIndex);
  const isMobile = $derived($viewport.isCompact);
  const pinText = $derived(pinned ? (isMobile ? 'Unpin' : 'Unpin Connection') : (isMobile ? 'Pin' : 'Pin Connection'));
  const followTargetsCurrent = $derived(inspectedIndex != null && Number.isFinite(inspectedIndex) && inspectedIndex === focusedIndex());
  const journeyPhaseIsExploring = $derived(focusSnapshot.strandContinuityPhase === 'exploring');
  const followText = $derived(journeyPhaseIsExploring
    ? 'Following'
    : followTargetsCurrent
      ? (isMobile ? 'Current' : 'Current Stop')
      : (isMobile ? 'Follow' : 'Follow Connection'));
  const followAriaLabel = $derived(journeyPhaseIsExploring
    ? 'Following this connection'
    : followTargetsCurrent
      ? 'This connection is the current stop'
      : 'Follow this connection as the next stop');
  const followDisabled = $derived(inspectedIndex === null || followTargetsCurrent || journeyPhaseIsExploring);

  const title = $derived(inspectedIndex != null
    ? `Connection to ${appState.points[inspectedIndex]?.name ?? 'a nearby business'}`
    : 'Connection Inspector');

  function localizeSource(source: string | undefined): string {
    switch (source) {
      case 'rail-hover': return 'hovering a neighbor';
      case 'rail-inspect': return 'inspecting a neighbor';
      case 'semantic-search': return 'your search anchor';
      case 'trail-step': return 'your last trail step';
      default: return 'focus';
    }
  }

  const copy = $derived(active && inspectedIndex != null
    ? `Previewing the connection from ${localizeSource(inspector.source)} to ${appState.points[inspectedIndex]?.name ?? 'a nearby business'}.`
    : 'Select a nearby stop to preview why it belongs here, then pin or follow.');

  const metaVisible = $derived(active && (inspector.segmentCount > 0 || inspector.braidCount > 0 || inspector.endpointCount > 0));
  const emptyMetaVisible = $derived(!metaVisible);
  const metaAriaLabel = $derived(metaVisible
    ? `Connection statistics: ${inspector.segmentCount} stops, ${inspector.braidCount} overlapping paths, ${inspector.endpointCount} destinations`
    : 'Connection statistics unavailable until a nearby stop is selected');

  function handlePin(): void {
    if (inspectedIndex === null || !Number.isFinite(inspectedIndex)) return;
    if (inspector.pinnedIndex === inspectedIndex) unpinThread();
    else pinThread(inspectedIndex);
  }

  function handleFollow(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    if (inspectedIndex === null || !Number.isFinite(inspectedIndex)) return;
    const actions = window.__APP_ACTIONS__;

    const currentIndex = focusedIndex();
    const history = walkHistoryIndices();
    const nextHistory = [...history];
    if (history.length === 0 && currentIndex !== null && Number.isFinite(currentIndex)) {
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

<section
  class="focus-thread-inspector"
  class:active={active}
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
    {title}
  </h2>
  <p id="focus-thread-inspector-copy" class="focus-thread-inspector-copy inspector-source">
    {copy}
  </p>
  {#if metaVisible}
    <div id="focus-thread-inspector-meta" class="focus-thread-inspector-meta inspector-stats" role="list" aria-label={metaAriaLabel}>
      <span role="listitem">{inspector.segmentCount} stops</span>
      <span role="listitem">{inspector.braidCount} overlapping paths</span>
      <span role="listitem">{inspector.endpointCount} destinations</span>
    </div>
  {:else if emptyMetaVisible}
    <div id="focus-thread-inspector-meta" class="focus-thread-inspector-meta inspector-stats" role="list" aria-label={metaAriaLabel}>
      <span role="listitem">Preview connection</span>
    </div>
  {/if}
  <div class="focus-thread-inspector-actions" aria-label="Connection actions">
    <button
      id="btn-thread-pin"
      type="button"
      class="thread-action primary"
      onclick={handlePin}
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
      Close
    </button>
  </div>
</section>

<style>
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
