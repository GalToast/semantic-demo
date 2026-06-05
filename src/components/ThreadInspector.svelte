<!--
  @components/ThreadInspector.svelte — Connection inspector
-->
<script lang="ts">
  import { focusState, threadInspector, threadInspectorActive, clearThreadInspector } from '@lib/stores/focus';
  import { viewport } from '@lib/stores/viewport';
  import type { ThreadInspectorState } from '@lib/types/state';

  interface Props {
    visible?: boolean;
  }

  let { visible = false }: Props = $props();
</script>

{#if visible && $threadInspectorActive}
  <div
    class="thread-inspector"
    id="thread-inspector"
    aria-label="Thread connection inspector"
    role="complementary"
  >
    <div class="inspector-header">
      <span class="inspector-title">Connection Inspector</span>
      <button class="inspector-close" onclick={clearThreadInspector} aria-label="Close inspector">&times;</button>
    </div>
    <div class="inspector-source-row">
      <span class="inspector-source">Source: {$threadInspector.source}</span>
    </div>
    <div class="inspector-stats">
      <span class="stat">Segments: {$threadInspector.segmentCount}</span>
      <span class="stat">Braids: {$threadInspector.braidCount}</span>
      <span class="stat">Endpoints: {$threadInspector.endpointCount}</span>
    </div>
    {#if $threadInspector.inspectedIndex !== null}
      <div class="inspector-detail">
        <span class="detail-label">Inspecting node #{$threadInspector.inspectedIndex}</span>
      </div>
    {/if}
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
  .inspector-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.4rem;
  }
  .inspector-title {
    font-family: 'Bricolage Grotesque', sans-serif;
    font-size: 0.75rem;
    font-weight: 600;
    color: #4ecdc4;
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
  .inspector-source-row {
    margin-bottom: 0.3rem;
  }
  .inspector-source {
    font-size: 0.6rem;
    color: #6a8a8a;
  }
  .inspector-stats {
    display: flex;
    gap: 0.75rem;
  }
  .stat {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.6rem;
    color: #b0d0d0;
  }
  .inspector-detail {
    margin-top: 0.4rem;
    padding-top: 0.3rem;
    border-top: 1px solid rgba(78, 205, 196, 0.12);
  }
  .detail-label {
    font-size: 0.6rem;
    color: #4ecdc4;
  }
</style>
