<!--
  @components/sonic/SonicIdentity.svelte — Per-node generated music clip UI.

  Shows a play/pause control and the ear_v7.1 score badge for the focused
  business's sonic identity (Magenta RT2 generated clip keyed by cluster).
  v2: the exact clip variant is picked deterministically from the node's
  leadId, so businesses of the same cluster play different takes.
  Hidden entirely when no clip resolves (manifest missing / clips empty).
-->
<script lang="ts">
  import { loadSonicManifest, pickVariantForNode, type SonicManifest, type SonicClip } from '@lib/sonic/sonic-manifest';
  import { playSonicIdentity, stopSonicIdentity, isPlaying } from '@lib/audio/sonic-identity';
  import { CLUSTER_NAMES } from '@lib/utils/ui-presentation';

  interface Props {
    /** Focused business record fields driving clip resolution. */
    cluster: number | null;
    leadId?: string | null;
  }

  let { cluster, leadId = null }: Props = $props();

  let manifest = $state<SonicManifest | null>(null);
  $effect(() => {
    let cancelled = false;
    loadSonicManifest().then((m) => { if (!cancelled) manifest = m; });
    return () => { cancelled = true; };
  });

  const clusterName = $derived(cluster !== null ? CLUSTER_NAMES[cluster % CLUSTER_NAMES.length] ?? null : null);
  const clip = $derived(manifest ? pickVariantForNode(manifest, clusterName, leadId) : null);

  let playing = $state(false);
  // Keep the local flag in sync when the clip ends naturally.
  $effect(() => {
    if (!clip) return;
    const id = clip.id;
    const t = setInterval(() => { playing = isPlaying(id); }, 500);
    return () => clearInterval(t);
  });

  function toggle(): void {
    if (!clip) return;
    if (playing) {
      stopSonicIdentity();
      playing = false;
    } else {
      void playSonicIdentity(clusterName, clip.id, leadId).then((ok) => { playing = ok; });
    }
  }
</script>

{#if clip}
  <div class="sonic-identity" data-testid="sonic-identity">
    <button
      id="sonic-play"
      class="sonic-play"
      type="button"
      aria-label={playing ? `Pause sonic identity for ${clip.prompt}` : `Play sonic identity for ${clip.prompt}`}
      aria-pressed={playing}
      onclick={toggle}
    >{playing ? '⏸' : '▶'}</button>
    <div class="sonic-meta">
      {#if clip.ear}
        <span id="sonic-score" class="sonic-score sonic-score-{clip.ear.grade.toLowerCase()}">{clip.ear.score}/{clip.ear.grade}</span>
      {/if}
      <span class="sonic-prompt" title={clip.prompt}>{clip.prompt}</span>
    </div>
  </div>
{/if}

<style>
  .sonic-identity {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    margin-top: 0.5rem;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 0.5rem;
    background: rgba(255, 255, 255, 0.04);
  }
  .sonic-play {
    flex: none;
    width: 2rem;
    height: 2rem;
    border-radius: 50%;
    border: 1px solid rgba(255, 255, 255, 0.2);
    background: rgba(255, 255, 255, 0.08);
    color: inherit;
    font-size: 0.8rem;
    line-height: 1;
    cursor: pointer;
  }
  .sonic-play:hover { background: rgba(255, 255, 255, 0.16); }
  .sonic-meta {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    min-width: 0;
  }
  .sonic-score {
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .sonic-score-s { color: #7dd87d; }
  .sonic-score-a, .sonic-score-b { color: #d8d87d; }
  .sonic-score-c, .sonic-score-d { color: #d8a27d; }
  .sonic-score-f { color: #d87d7d; }
  .sonic-prompt {
    font-size: 0.75rem;
    opacity: 0.7;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
