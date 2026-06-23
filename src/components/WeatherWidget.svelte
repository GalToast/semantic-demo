<!--
  @components/WeatherWidget.svelte — Weather display

  Ported from:
    - js/modules/weather-widget.js (weather data fetch + render)

  Shows current weather conditions for Montgomery County TX.
  Fetches weather data on mount and displays temperature, condition, and forecast.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import {
    weatherData,
    weatherTemperature,
    weatherCondition,
    weatherLabel,
    weatherForecast,
    hasWeather,
    CONDITION_ICONS,
    fetchWeather
  } from '@lib/stores/weather.svelte';
  import type { WeatherCondition } from '@lib/stores/weather.svelte';
  import { viewport, isCompact } from '@lib/stores/viewport.svelte';

  interface Props {
    /** Whether the widget is visible */
    visible?: boolean;
  }

  let { visible = false }: Props = $props();

  let expanded = $state(false);

  let temperature = $derived(weatherTemperature());
  let condition = $derived(weatherCondition());
  let label = $derived(weatherLabel());
  let forecast = $derived(weatherForecast());
  let loaded = $derived(hasWeather());
  let icon = $derived(CONDITION_ICONS[weatherCondition()] ?? '\u2600');

  onMount(() => {
    fetchWeather().catch(() => {
      // Weather is non-critical; silently degrade
    });
  });

  function toggleExpanded(): void {
    expanded = !expanded;
  }
</script>

{#if visible}
  <div
    class="weather-widget"
    class:expanded
    class:compact={$viewport.isCompact}
    id="weather-widget"
    aria-label="Weather conditions"
  >
    <button class="weather-toggle" onclick={toggleExpanded} aria-label="Toggle weather details" type="button">
      <span class="weather-icon">{icon}</span>
      {#if loaded}
        <span class="weather-temp">{temperature}&deg;</span>
      {/if}
    </button>

    {#if expanded && loaded}
      <div class="weather-details">
        <div class="weather-detail-row">
          <span class="detail-label">Condition</span>
          <span class="detail-value">{label}</span>
        </div>
        <div class="weather-detail-row">
          <span class="detail-label">Feels like</span>
          <span class="detail-value">{temperature}&deg;F</span>
        </div>
        <div class="weather-detail-row">
          <span class="detail-label">Forecast</span>
          <span class="detail-value forecast">{forecast}</span>
        </div>
      </div>
    {/if}
  </div>
{/if}

<style>
  .weather-widget {
    position: absolute;
    /* Clear the 60.8px app header so the pill no longer renders behind it.
       Previously top: 0.5rem left the widget at ~45.6px, which sliced the
       temperature label under the header. Use the same token App.svelte
       uses for .focus-stage.active so the two stay in sync if the header
       height ever changes. */
    top: calc(var(--app-header-height, 60.8px) + 0.4rem);
    right: 0.5rem;
    z-index: var(--z-legend, 50);
    pointer-events: auto;
  }

  /* Collapsed pill: circular icon-only chip. Expands horizontally on hover
     or when .expanded (clicked). Keeps the weather visible without crowding
     the map controls directly below. */
  .weather-toggle {
    display: inline-flex;
    align-items: center;
    gap: 0;
    padding: 0.45rem 0.5rem;
    /* W46-D: forced rebuild marker 2026-06-23 */
    background: linear-gradient(
      180deg,
      rgba(11, 22, 32, 0.78),
      rgba(7, 16, 24, 0.92)
    );
    backdrop-filter: blur(10px) saturate(140%);
    -webkit-backdrop-filter: blur(10px) saturate(140%);
    border: 1px solid rgba(78, 205, 196, 0.18);
    border-radius: 999px;
    color: #cfe4e0;
    cursor: pointer;
    font-family: 'Nunito Sans', sans-serif;
    font-size: 0.85rem;
    line-height: 1;
    box-shadow:
      0 1px 0 rgba(255, 255, 255, 0.04) inset,
      0 6px 18px rgba(0, 0, 0, 0.35);
    transition:
      padding 0.22s cubic-bezier(0.4, 0, 0.2, 1),
      gap 0.22s cubic-bezier(0.4, 0, 0.2, 1),
      border-color 0.18s ease,
      background 0.18s ease,
      box-shadow 0.18s ease,
      transform 0.18s ease;
  }
  .weather-toggle:hover,
  .weather-widget.expanded .weather-toggle,
  .weather-toggle:focus-visible {
    padding: 0.45rem 0.75rem;
    gap: 0.45rem;
    border-color: rgba(78, 205, 196, 0.45);
    background: linear-gradient(
      180deg,
      rgba(15, 30, 42, 0.85),
      rgba(9, 20, 28, 0.95)
    );
    box-shadow:
      0 1px 0 rgba(255, 255, 255, 0.05) inset,
      0 8px 22px rgba(0, 0, 0, 0.45),
      0 0 0 1px rgba(78, 205, 196, 0.08),
      0 0 18px rgba(78, 205, 196, 0.12);
    outline: none;
  }
  .weather-toggle:focus-visible {
    border-color: rgba(78, 205, 196, 0.6);
  }
  .weather-toggle:active {
    transform: translateY(0.5px);
  }

  .weather-icon {
    font-size: 0.95rem;
    line-height: 1;
    filter: drop-shadow(0 0 4px rgba(78, 205, 196, 0.25));
  }

  /* Temperature label is hidden when the pill is collapsed and slides in on
     hover or when the details panel is open. Keeps the icon-only footprint
     at rest. */
  .weather-temp {
    font-family: 'JetBrains Mono', monospace;
    font-weight: 600;
    font-size: 0.75rem;
    color: #4ecdc4;
    max-width: 0;
    opacity: 0;
    overflow: hidden;
    white-space: nowrap;
    transition:
      max-width 0.22s cubic-bezier(0.4, 0, 0.2, 1),
      opacity 0.18s ease;
  }
  .weather-toggle:hover .weather-temp,
  .weather-widget.expanded .weather-temp,
  .weather-toggle:focus-visible .weather-temp {
    max-width: 3.5rem;
    opacity: 1;
  }

  /* Skeleton state while weather is loading — subtle pulse on the chip. */
  .weather-toggle:has(.weather-temp:not(:empty))::after,
  .weather-toggle:not(:has(.weather-temp))::after {
    /* no-op: kept for future */
  }

  .weather-details {
    margin-top: 0.4rem;
    background: linear-gradient(
      180deg,
      rgba(11, 22, 32, 0.88),
      rgba(7, 16, 24, 0.95)
    );
    backdrop-filter: blur(14px) saturate(140%);
    -webkit-backdrop-filter: blur(14px) saturate(140%);
    border: 1px solid rgba(78, 205, 196, 0.18);
    border-radius: 0.55rem;
    padding: 0.55rem 0.7rem;
    min-width: 180px;
    box-shadow:
      0 1px 0 rgba(255, 255, 255, 0.04) inset,
      0 10px 28px rgba(0, 0, 0, 0.5);
    animation: details-in 0.2s ease-out;
  }

  @keyframes details-in {
    from { opacity: 0; transform: translateY(-4px) scale(0.98); }
    to { opacity: 1; transform: translateY(0) scale(1); }
  }

  .weather-detail-row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 0.6rem;
    padding: 0.18rem 0;
  }
  .weather-detail-row + .weather-detail-row {
    border-top: 1px solid rgba(78, 205, 196, 0.07);
    margin-top: 0.1rem;
    padding-top: 0.28rem;
  }

  .detail-label {
    font-size: 0.55rem;
    color: rgba(176, 208, 208, 0.5);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-weight: 600;
    flex-shrink: 0;
  }
  .detail-value {
    font-size: 0.7rem;
    color: #d4eaea;
    text-align: right;
    font-family: 'Nunito Sans', sans-serif;
  }
  .detail-value.forecast {
    font-size: 0.6rem;
    color: rgba(176, 208, 208, 0.7);
    max-width: 130px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .weather-widget.compact {
    /* Mobile header collapses to ~48px on compact; keep the same
       token-driven clearance pattern as the desktop rule above so the
       pill never overlaps the chrome bar. */
    top: calc(var(--app-header-height, 60.8px) + 0.3rem);
    right: 0.3rem;
  }

  /* Respect reduced motion: skip the expand/hover transitions. */
  @media (prefers-reduced-motion: reduce) {
    .weather-toggle,
    .weather-temp,
    .weather-details {
      transition: none;
      animation: none;
    }
  }

  @media (max-width: 768px) {
    :global(body.is-active[data-panel-surface='focus-search'][data-focus-panel-mode='field-node']) .weather-widget,
    :global(body[data-panel-surface='focus-search'][data-focus-panel-mode='field-node']) .weather-widget {
      display: none;
      visibility: hidden;
      pointer-events: none;
    }
  }
</style>
