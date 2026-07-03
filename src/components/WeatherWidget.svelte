<!--
  @components/WeatherWidget.svelte — Weather display

  W46-D4 polish: real Open-Meteo data via @lib/stores/weather, inline SVG
  icons (sun/cloud/rain), temperature always visible in the pill, and the
  FORECAST row removed (CONDITION + FEELS LIKE + HUMIDITY + WIND are
  sufficient — real data is more useful than a redundant text string).
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import {
    weatherTemperature,
    weatherLabel,
    weatherIconKey,
    weatherHumidity,
    weatherWindSpeed,
    weatherWindDirection,
    hasWeather,
    fetchWeather
  } from '@lib/stores/weather.svelte';
  import { viewport } from '@lib/stores/viewport.svelte';
  import { parityMap, getBypassAttr } from '@lib/orchestration/parity-attrs.svelte';


  interface Props {
    /** Whether the widget is visible */
    visible?: boolean;
  }

  let { visible = false }: Props = $props();

  let expanded = $state(false);

  // ── Body state for CSS class derivation ────────────────────────────────────
  // bodyPanelSurface is kept in sync by parity-attrs.svelte.ts:installParityAttributeSync()
  // via the reactive parityMap proxy — no $state mirror or MutationObserver needed.
  let bodyPanelSurface = $derived(parityMap.panelSurface || '');
  // bodyFocusPanelMode is a bypass attr — parity-attrs owns the observer;
  // getBypassAttr() reads the reactive bypass store directly.
  let bodyFocusPanelMode = $derived(getBypassAttr('focusPanelMode') ?? '');

  let temperature = $derived(weatherTemperature());
  let label = $derived(weatherLabel());
  let iconKey = $derived(weatherIconKey());
  let humidity = $derived(weatherHumidity());
  let windSpeed = $derived(weatherWindSpeed());
  let windDir = $derived(weatherWindDirection());
  let loaded = $derived(hasWeather());

  onMount(() => {
    fetchWeather().catch(() => {
      // Weather is non-critical; silently degrade
    });
  });

  function toggleExpanded(): void {
    expanded = !expanded;
  }
</script>

{#snippet iconSvg(key: string)}
  {#if key === 'sun'}
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="4" fill="var(--color-primary-alt)" />
      <g stroke="var(--color-primary-alt)" stroke-width="2" stroke-linecap="round">
        <line x1="12" y1="2" x2="12" y2="5" />
        <line x1="12" y1="19" x2="12" y2="22" />
        <line x1="2" y1="12" x2="5" y2="12" />
        <line x1="19" y1="12" x2="22" y2="12" />
        <line x1="5.6" y1="5.6" x2="7.7" y2="7.7" />
        <line x1="16.3" y1="16.3" x2="18.4" y2="18.4" />
        <line x1="5.6" y1="18.4" x2="7.7" y2="16.3" />
        <line x1="16.3" y1="7.7" x2="18.4" y2="5.6" />
      </g>
    </svg>
  {:else if key === 'rain'}
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" focusable="false">
      <path
        d="M17.5 13a4.5 4.5 0 1 0-1.4-8.78 6.5 6.5 0 0 0-12.6 1.78A4 4 0 0 0 4 13h13.5z"
        fill="var(--color-primary-alt)"
      />
      <g stroke="var(--color-primary-alt)" stroke-width="2" stroke-linecap="round">
        <line x1="8" y1="17" x2="7" y2="20" />
        <line x1="12" y1="17" x2="11" y2="20" />
        <line x1="16" y1="17" x2="15" y2="20" />
      </g>
    </svg>
  {:else}
    <!-- cloud (default) -->
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" focusable="false">
      <path
        d="M17.5 19a4.5 4.5 0 1 0-1.4-8.78 6.5 6.5 0 0 0-12.6 1.78A4 4 0 0 0 4 19h13.5z"
        fill="var(--color-primary-alt)"
      />
    </svg>
  {/if}
{/snippet}

{#if visible}
  <div
    class="weather-widget"
    class:expanded
    class:compact={$viewport.isCompact}
    class:surface-focus-search={bodyPanelSurface === 'focus-search'}
    class:mode-field-node={bodyFocusPanelMode === 'field-node'}
    id="weather-widget"
    aria-label="Weather conditions for Montgomery County"
    title="Current conditions for Montgomery County"
  >
    <button
      class="weather-toggle"
      onclick={toggleExpanded}
      aria-label="Toggle weather details — current conditions for Montgomery County"
      title="Current conditions for Montgomery County"
      aria-expanded={expanded}
      aria-controls="weather-details"
      type="button"
    >
      <span class="weather-icon">{@render iconSvg(iconKey)}</span>
      {#if loaded}
        <span class="weather-temp">{temperature}&deg;</span>
      {/if}
    </button>

    {#if expanded && loaded}
      <div class="weather-details" id="weather-details">
        <div class="weather-detail-row">
          <span class="detail-label">Condition</span>
          <span class="detail-value">{label}</span>
        </div>
        <div class="weather-detail-row">
          <span class="detail-label">Feels like</span>
          <span class="detail-value">{temperature}&deg;F</span>
        </div>
        <div class="weather-detail-row">
          <span class="detail-label">Humidity</span>
          <span class="detail-value">{humidity}%</span>
        </div>
        <div class="weather-detail-row">
          <span class="detail-label">Wind</span>
          <span class="detail-value">{windSpeed} mph {windDir}</span>
        </div>
      </div>
    {/if}
  </div>
{/if}

<style>
  .weather-widget {
    position: absolute;
    /* Clear the app header (60.8px) AND the fixed chrome buttons that
       sit below the header at top:117px (legend) and top:169px (help).
       W46-D2: previous value of `+ 0.5rem` (~67px) put the pill behind
       the legend button (z=100, fixed). `+ 10rem` (~221px) clears both
       buttons with an 8px gap. */
    top: calc(var(--app-header-height, 60.8px) + 10rem);
    right: 0.5rem;
    z-index: var(--z-legend, 50);
    pointer-events: auto;
    display: block;

    /* Reset legacy time_weather.css styles that leak onto this component.
       The old CSS treats .weather-widget as the pill itself; this component
       uses the div as a positioning wrapper and styles the button inside. */
    padding: 0;
    border: none;
    border-radius: 0;
    background: none;
    box-shadow: none;
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
    overflow: visible;
    font-size: inherit;
    color: inherit;
    gap: 0;
    align-items: stretch;
    transition: none;
  }

  /* W46-D4: pill always shows icon + temperature. No more icon-only
     collapsed state — the temperature is the primary signal. */
  .weather-toggle {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    padding: 0.45rem 0.75rem;
    background: linear-gradient(
      180deg,
      rgba(11, 22, 32, 0.78),
      rgba(7, 16, 24, 0.92)
    );
    backdrop-filter: blur(10px) saturate(140%);
    -webkit-backdrop-filter: blur(10px) saturate(140%);
    border: 1px solid rgba(var(--color-primary-alt-rgb), 0.18);
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
      border-color 0.18s ease,
      background 0.18s ease,
      box-shadow 0.18s ease,
      transform 0.18s ease;
  }
  .weather-toggle:hover,
  .weather-widget.expanded .weather-toggle,
  .weather-toggle:focus-visible {
    border-color: rgba(var(--color-primary-alt-rgb), 0.45);
    background: linear-gradient(
      180deg,
      rgba(15, 30, 42, 0.85),
      rgba(9, 20, 28, 0.95)
    );
    box-shadow:
      0 1px 0 rgba(255, 255, 255, 0.05) inset,
      0 8px 22px rgba(0, 0, 0, 0.45),
      0 0 0 1px rgba(var(--color-primary-alt-rgb), 0.08),
      0 0 18px rgba(var(--color-primary-alt-rgb), 0.12);
  }
  .weather-toggle:focus-visible {
    border-color: rgba(var(--color-primary-alt-rgb), 0.6);
  }
  .weather-toggle:active {
    transform: translateY(0.5px);
  }

  .weather-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 14px;
    height: 14px;
    line-height: 1;
    filter: drop-shadow(0 0 4px rgba(var(--color-primary-alt-rgb), 0.25));
  }
  .weather-icon :global(svg) {
    display: block;
  }

  /* W46-D4: temperature is always visible — primary data point. */
  .weather-temp {
    font-family: 'JetBrains Mono', monospace;
    font-weight: 600;
    font-size: 0.75rem;
    color: var(--color-primary-alt);
    white-space: nowrap;
    line-height: 1;
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
    border: 1px solid rgba(var(--color-primary-alt-rgb), 0.18);
    border-radius: 0.55rem;
    padding: 0.55rem 0.7rem;
    min-width: 200px;
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
    border-top: 1px solid rgba(78, 205, 206, 0.07);
    margin-top: 0.1rem;
    padding-top: 0.28rem;
  }

  .detail-label {
    font-size: 0.55rem;
    color: rgba(176, 208, 208, 0.5); /* a11y-ok: caption-text — UPPERCASE tracked label */
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

  .weather-widget.compact {
    /* Mobile header collapses to ~48px on compact; keep the same
       token-driven clearance pattern as the desktop rule above so the
       pill never overlaps the chrome bar. */
    top: calc(var(--app-header-height, 60.8px) + 0.3rem);
    right: 0.3rem;
    display: block;
  }

  /* Respect reduced motion: skip the expand/hover transitions. */
  @media (prefers-reduced-motion: reduce) {
    .weather-toggle,
    .weather-details {
      transition: none;
      animation: none;
    }
  }

  @media (max-width: 768px) {
    .weather-widget.surface-focus-search.mode-field-node {
      display: none;
      visibility: hidden;
      pointer-events: none;
    }
  }
</style>
