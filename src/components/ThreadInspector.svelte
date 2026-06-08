<!--
  @components/ThreadInspector.svelte — Connection inspector
-->
<script lang="ts">
  import {
    threadInspector,
    threadInspectorActive,
    clearThreadInspector,
    pinThread,
    unpinThread
  } from '@lib/stores/focus.svelte';

  interface Props {
    visible?: boolean;
  }

  let { visible = false }: Props = $props();

  function handlePin(index: number | null, pinnedIndex: number | null): void {
    if (index === null || !Number.isFinite(index)) return;
    if (pinnedIndex === index) unpinThread();
    else pinThread(index);
  }

  function handleFollow(event: MouseEvent): void {
    event.preventDefault();
  }
</script>

{#if visible && threadInspectorActive()}
  {@const inspector = threadInspector()}
  {@const inspectedIndex = inspector.inspectedIndex}
  {@const pinned = inspectedIndex !== null && inspector.pinnedIndex === inspectedIndex}
  <div
    class="thread-inspector"
    id="thread-inspector"
    aria-label="Thread connection inspector"
    role="complementary"
  >
    <section
      class="focus-thread-inspector active"
      id="focus-thread-inspector"
      aria-labelledby="focus-thread-inspector-title"
    >
      <div class="inspector-header">
        <span class="focus-thread-inspector-kicker">Connection Preview</span>
        <button class="inspector-close" onclick={clearThreadInspector} aria-label="Close inspector">&times;</button>
      </div>
      <h2 id="focus-thread-inspector-title" class="focus-thread-inspector-title">
        {inspectedIndex !== null ? `Node ${inspectedIndex} thread` : 'Connection Inspector'}
      </h2>
      <p id="focus-thread-inspector-copy" class="focus-thread-inspector-copy">
        {inspectedIndex !== null
          ? `Previewing the semantic connection from ${inspector.source || 'focus'} to node ${inspectedIndex}.`
          : 'Preview why this nearby stop belongs in the current focus path.'}
      </p>
      <div id="focus-thread-inspector-meta" class="focus-thread-inspector-meta">
        <span>{inspector.segmentCount} segments</span>
        <span>{inspector.braidCount} braids</span>
        <span>{inspector.endpointCount} endpoints</span>
      </div>
      <div class="focus-thread-inspector-actions" aria-label="Thread actions">
        <button
          id="btn-thread-pin"
          type="button"
          class="thread-action"
          onclick={() => handlePin(inspectedIndex, inspector.pinnedIndex)}
          disabled={inspectedIndex === null}
        >
          {pinned ? 'Unpin' : 'Pin'}
        </button>
        <button
          id="btn-thread-follow"
          type="button"
          class="thread-action"
          onclick={handleFollow}
          disabled={inspectedIndex === null}
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
    z-index: var(--z-overlays);
    background: rgba(7, 16, 24, 0.92);
    backdrop-filter: blur(12px);
    border: 1px solid rgba(78, 205, 196, 0.2);
    border-radius: 0.5rem;
    padding: 0.6rem 0.75rem;
    max-width: 260px;
    pointer-events: auto;
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
    font-family: 'Bricolage Grotesque', sans-serif;
    font-size: 0.62rem;
    font-weight: 600;
    letter-spacing: 0;
    color: #4ecdc4;
    text-transform: uppercase;
  }
  .focus-thread-inspector-title {
    margin: 0;
    font-family: 'Bricolage Grotesque', sans-serif;
    font-size: 0.84rem;
    font-weight: 700;
    line-height: 1.15;
    color: #e0f0f0;
  }
  .focus-thread-inspector-copy {
    margin: 0;
    font-size: 0.68rem;
    line-height: 1.35;
    color: #b0d0d0;
  }
  .inspector-close {
    background: none;
    border: none;
    color: #6a8a8a;
    font-size: 1rem;
    cursor: pointer;
    padding: 0 0.25rem;
    line-height: 1;
    transition: color 0.15s;
  }
  .inspector-close:hover {
    color: #e0f0f0;
  }
  .focus-thread-inspector-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem 0.55rem;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.6rem;
    color: #6a8a8a;
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
    border: 1px solid rgba(78, 205, 196, 0.22);
    border-radius: 0.35rem;
    background: rgba(78, 205, 196, 0.08);
    color: #e0f0f0;
    font: 600 0.64rem/1 'Bricolage Grotesque', sans-serif;
    cursor: pointer;
  }
  .thread-action:disabled {
    cursor: default;
    color: #6a8a8a;
    background: rgba(255, 255, 255, 0.04);
  }
</style>
