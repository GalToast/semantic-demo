<!--
  @lib/components/PlaceholderCategoryLegend.svelte

  Compact inline category legend for the mobile 2D placeholder.
  Extracted from Placeholder2D.svelte so the parent can focus on the
  splash layout + CTA while the legend owns its own markup, styles, and
  accessibility.
-->
<script lang="ts">
  interface Props {
    categories: Array<{ name: string; color: string }>
  }

  let { categories }: Props = $props()
</script>

<ul class="placeholder-legend" data-testid="placeholder-legend" aria-label="Business categories in the dataset">
  {#each categories as cat (cat.name)}
    <li class="placeholder-legend-item">
      <span class="placeholder-legend-dot" style="background-color: {cat.color}" aria-hidden="true"></span>
      <span class="placeholder-legend-label">{cat.name}</span>
    </li>
  {/each}
</ul>

<style>
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
    color: rgba(231, 240, 240, 0.85);
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

  @media (max-width: 360px) {
    .placeholder-legend {
      grid-template-columns: 1fr;
      max-width: 16rem;
      gap: 0.45rem 0.6rem;
    }
    .placeholder-legend-item {
      font-size: 0.65rem;
    }
  }

  @media (max-height: 700px) {
    .placeholder-legend {
      margin-top: 0.8rem;
    }
  }
</style>
