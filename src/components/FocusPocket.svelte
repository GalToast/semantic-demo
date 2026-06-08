<!--
  @components/FocusPocket.svelte — Focus pocket constellation

  Self-populating: when a focused index is established, calls
  applyLocalNeighborhoodFocus() to build the deterministic constellation.
  Clears pocket nodes when focus is released.
-->
<script lang="ts">
  import { focusPocketNodes, anchorIndicator, clearPocketNodes } from '@lib/stores/focus';
  import { hasFocus, focusedIndex } from '@lib/stores/navigation';
  import { applyLocalNeighborhoodFocus } from '@lib/focus/pocket';

  interface Props {
    visible?: boolean;
  }

  let { visible = false }: Props = $props();

  // Track the last focused index to avoid redundant rebuilds
  let lastFocusIndex: number | null = null;

  $effect(() => {
    const idx = focusedIndex();
    const focused = hasFocus();

    if (focused && Number.isFinite(idx) && idx !== null && idx !== lastFocusIndex) {
      lastFocusIndex = idx;
      applyLocalNeighborhoodFocus(idx);
    } else if (!focused && lastFocusIndex !== null) {
      lastFocusIndex = null;
      clearPocketNodes();
    }
  });
</script>

{#if visible && hasFocus()}
  <div class="focus-pocket" id="focus-pocket" aria-label="Focus neighborhood">
    {#each focusPocketNodes() as node (node.index)}
      <div
        class="focus-node"
        class:direct={node.role === 'direct'}
        class:support={node.role === 'support'}
        class:civic={node.role === 'civic'}
        style="left: {((node.position[0] + 1) / 2) * 100}%; top: {((1 - node.position[1]) / 2) * 100}%"
        role="button"
        tabindex={0}
        aria-label="{node.label} ({node.role})"
      >
        <span class="node-dot"></span>
        <span class="node-label">{node.label}</span>
      </div>
    {/each}

    {#if anchorIndicator().active && anchorIndicator().position}
      {@const pos = anchorIndicator().position!}
      <div
        class="anchor-indicator"
        style="left: {((pos[0] + 1) / 2) * 100}%; top: {((1 - pos[1]) / 2) * 100}%"
        aria-hidden="true"
      ></div>
    {/if}
  </div>
{/if}

<style>
  .focus-pocket {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: var(--z-focus-card);
    pointer-events: none;
  }
  .focus-node {
    position: absolute;
    transform: translate(-50%, -50%);
    display: flex;
    flex-direction: column;
    align-items: center;
    pointer-events: auto;
    cursor: pointer;
    transition: opacity 0.3s, transform 0.3s;
  }
  .focus-node.direct .node-dot { background: #4ecdc4; box-shadow: 0 0 8px rgba(78, 205, 196, 0.6); }
  .focus-node.support .node-dot { background: #ffd93d; box-shadow: 0 0 6px rgba(255, 217, 61, 0.4); }
  .focus-node.civic .node-dot { background: #ff6b6b; box-shadow: 0 0 6px rgba(255, 107, 107, 0.4); }
  .node-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    border: 1px solid rgba(255, 255, 255, 0.3);
  }
  .node-label {
    font-size: 0.55rem;
    color: #b0d0d0;
    margin-top: 0.2rem;
    white-space: nowrap;
    max-width: 80px;
    overflow: hidden;
    text-overflow: ellipsis;
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.8);
  }
  .anchor-indicator {
    position: absolute;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    border: 2px solid #4ecdc4;
    transform: translate(-50%, -50%);
    animation: anchor-pulse 1.5s ease-in-out infinite;
  }
  @keyframes anchor-pulse {
    0%, 100% { opacity: 0.4; transform: translate(-50%, -50%) scale(1); }
    50% { opacity: 1; transform: translate(-50%, -50%) scale(1.5); }
  }
</style>
