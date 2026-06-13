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
    top: 0.5rem;
    right: 0.5rem;
    z-index: var(--z-legend, 50);
    pointer-events: auto;
  }

  .weather-toggle {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.3rem 0.5rem;
    background: rgba(7, 16, 24, 0.82);
    backdrop-filter: blur(8px);
    border: 1px solid rgba(78, 205, 196, 0.15);
    border-radius: 0.4rem;
    color: #b0d0d0;
    cursor: pointer;
    font-family: 'Nunito Sans', sans-serif;
    font-size: 0.7rem;
    transition: all 0.15s;
  }
  .weather-toggle:hover {
    border-color: rgba(78, 205, 196, 0.35);
    color: #e0f0f0;
  }

  .weather-icon {
    font-size: 0.85rem;
  }

  .weather-temp {
    font-family: 'JetBrains Mono', monospace;
    font-weight: 600;
    color: #4ecdc4;
  }

  .weather-details {
    margin-top: 0.3rem;
    background: rgba(7, 16, 24, 0.92);
    backdrop-filter: blur(12px);
    border: 1px solid rgba(78, 205, 196, 0.15);
    border-radius: 0.4rem;
    padding: 0.5rem;
    min-width: 160px;
    animation: details-in 0.2s ease-out;
  }

  @keyframes details-in {
    from { opacity: 0; transform: translateY(-4px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .weather-detail-row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 0.5rem;
    padding: 0.15rem 0;
  }
  .weather-detail-row + .weather-detail-row {
    border-top: 1px solid rgba(78, 205, 196, 0.06);
  }

  .detail-label {
    font-size: 0.6rem;
    color: rgba(176, 208, 208, 0.5);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    flex-shrink: 0;
  }
  .detail-value {
    font-size: 0.65rem;
    color: #b0d0d0;
    text-align: right;
  }
  .detail-value.forecast {
    font-size: 0.55rem;
    color: rgba(176, 208, 208, 0.6);
    max-width: 120px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .weather-widget.compact {
    top: 0.25rem;
    right: 0.25rem;
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
