<!--
  @lib/components/MapBackButton.svelte

  Footer back button for the map view. Extracted from MapView.svelte so
  MapView can focus on Leaflet lifecycle while this button owns its own
  markup and scoped styles.
-->
<script lang="ts">
  interface Props {
    onClick: () => void
    label?: string
    ariaLabel?: string
  }

  let { onClick, label = 'Overview', ariaLabel }: Props = $props()
</script>

<button class="map-back-btn" type="button" onclick={onClick} aria-label={ariaLabel ?? label}>
  {label}
</button>

<style>
  .map-back-btn {
    min-height: 44px;
    border: 1px solid rgba(126, 231, 219, 0.35);
    border-radius: 8px;
    background: rgba(10, 23, 29, 0.78);
    color: #eafffb;
    font: inherit;
    font-size: 0.84rem;
    font-weight: 800;
    letter-spacing: 0;
    cursor: pointer;
    box-shadow: 0 12px 30px rgba(0, 0, 0, 0.28);
    transition:
      background 0.16s ease,
      border-color 0.16s ease,
      transform 0.16s ease;
  }

  .map-back-btn {
    padding: 0 16px;
  }

  .map-back-btn:hover {
    background: rgba(17, 41, 47, 0.92);
    border-color: rgba(126, 231, 219, 0.64);
    transform: translateY(-1px);
  }
</style>
