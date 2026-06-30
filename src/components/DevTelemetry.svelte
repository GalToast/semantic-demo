<!--
  @components/DevTelemetry.svelte — Floating dev telemetry overlay

  Renders only when:
    - import.meta.env.DEV is true
    - `visible` prop is true (toggled via ?devtools=1 URL param or
      window.__telemetry_devtoolsVisible = true)

  What it shows:
    - Counts per event name (top-N most frequent)
    - Last 8 events (newest first)
    - Total recorded, dropped (overflow), buffer size
    - Clear button + auto-scroll toggle

  Privacy: the overlay shows event NAMES + key counts, never raw
  payload values (the store doesn't store them either).

  Phase 9b (2026-06-26) — initial scaffold.
-->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import {
      configureTelemetry,
      telemetryStore,
      type TelemetrySnapshot
  } from '@lib/telemetry'

  interface Props {
      visible?: boolean
  }
  let { visible = false }: Props = $props()

  let snapshot: TelemetrySnapshot = $state(telemetryStore.getSnapshot())
  let autoScroll = $state(true)
  let mounted = $state(false)

  // Local-state mount probe so we don't flash before lazy-load resolves.
  onMount(() => {
      mounted = true
      // Enable telemetry on first render of the overlay. The subscriber
      // is already wired (in App.svelte onMount), so events start flowing
      // as soon as we flip this on.
      configureTelemetry({ enabled: true, mirrorToConsole: false })
      const unsub = telemetryStore.subscribe(() => {
          snapshot = telemetryStore.getSnapshot()
      })
      onDestroy(() => {
          unsub()
      })
  })

  function handleClear(): void {
      telemetryStore.clear()
  }

  function toggleAutoScroll(): void {
      autoScroll = !autoScroll
  }

  // Derived: top 12 event names by count, alphabetical as tie-breaker.
  let topCounts = $derived(
      [...Object.entries(snapshot.counts)]
          .sort(([aName, aCount], [bName, bCount]) => {
              if (bCount !== aCount) return bCount - aCount
              return aName.localeCompare(bName)
          })
          .slice(0, 12)
  )

  let recent = $derived(snapshot.events.slice(-8).reverse())
</script>

{#if visible && mounted}
    <div
        class="dev-telemetry"
        role="region"
        aria-label="Dev telemetry overlay"
        aria-live="off"
    >
        <header class="dev-telemetry-header">
            <h2>Telemetry</h2>
            <div class="dev-telemetry-meta">
                <span title="Total events recorded">
                    total: <strong>{snapshot.totalRecorded}</strong>
                </span>
                <span title="Events dropped due to buffer overflow">
                    dropped: <strong>{snapshot.dropped}</strong>
                </span>
                <span title="In-memory buffer size">
                    buffer: <strong>{snapshot.events.length}/{snapshot.config.bufferSize}</strong>
                </span>
            </div>
            <div class="dev-telemetry-actions">
                <button
                    type="button"
                    class="dev-telemetry-btn"
                    aria-pressed={autoScroll}
                    onclick={toggleAutoScroll}
                >
                    auto-scroll: {autoScroll ? 'on' : 'off'}
                </button>
                <button
                    type="button"
                    class="dev-telemetry-btn"
                    onclick={handleClear}
                >
                    clear
                </button>
            </div>
        </header>

        <section class="dev-telemetry-counts" aria-label="Event counts">
            {#if topCounts.length === 0}
                <p class="dev-telemetry-empty">No events recorded yet.</p>
            {:else}
                <table class="dev-telemetry-table">
                    <thead>
                        <tr>
                            <th scope="col">event</th>
                            <th scope="col" class="num">count</th>
                        </tr>
                    </thead>
                    <tbody>
                        {#each topCounts as [name, count] (name)}
                            <tr>
                                <td><code>{name}</code></td>
                                <td class="num">{count}</td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            {/if}
        </section>

        <section class="dev-telemetry-recent" aria-label="Recent events">
            {#if recent.length === 0}
                <p class="dev-telemetry-empty">Waiting for events…</p>
            {:else}
                <ol class="dev-telemetry-list" class:auto-scroll={autoScroll}>
                    {#each recent as ev (ev.seq)}
                        <li>
                            <span class="seq">#{ev.seq}</span>
                            <code class="event-name">{ev.eventName}</code>
                            <span class="keys">
                                {#if ev.payloadKeys.length > 0}
                                    {#each ev.payloadKeys as k (k.key)}
                                        <span class="key">{k.key}:{k.type}</span>
                                    {/each}
                                {/if}
                            </span>
                            <span class="bytes">{ev.payloadBytes}b</span>
                        </li>
                    {/each}
                </ol>
            {/if}
        </section>
    </div>
{/if}

<style>
    .dev-telemetry {
        position: fixed;
        bottom: 0.5rem;
        right: 0.5rem;
        width: min(420px, 50vw);
        max-height: 70vh;
        display: flex;
        flex-direction: column;
        background: rgba(7, 16, 24, 0.94);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        border: 1px solid rgba(var(--color-primary-alt-rgb), 0.3);
        border-radius: 0.5rem;
        color: var(--color-text-teal-light);
        font-family: 'JetBrains Mono', monospace;
        font-size: 0.7rem;
        z-index: calc(var(--z-devtools, 9000));
        box-shadow: 0 4px 24px rgba(0, 0, 0, 0.6);
    }

    .dev-telemetry-header {
        padding: 0.5rem 0.6rem;
        border-bottom: 1px solid rgba(var(--color-primary-alt-rgb), 0.2);
        display: grid;
        grid-template-columns: auto 1fr auto;
        gap: 0.5rem;
        align-items: center;
    }

    .dev-telemetry-header h2 {
        font-family: 'Bricolage Grotesque', sans-serif;
        font-size: 0.85rem;
        margin: 0;
        color: var(--color-primary-alt);
    }

    .dev-telemetry-meta {
        display: flex;
        gap: 0.6rem;
        font-size: 0.6rem;
        opacity: 0.85;
    }

    .dev-telemetry-meta strong {
        color: #7eeee6;
        font-weight: 600;
    }

    .dev-telemetry-actions {
        display: flex;
        gap: 0.25rem;
    }

    .dev-telemetry-btn {
        background: rgba(var(--color-primary-alt-rgb), 0.12);
        border: 1px solid rgba(var(--color-primary-alt-rgb), 0.25);
        border-radius: 0.25rem;
        color: var(--color-text-teal-light);
        padding: 0.15rem 0.4rem;
        font-size: 0.6rem;
        font-family: inherit;
        cursor: pointer;
    }

    .dev-telemetry-btn:hover {
        background: rgba(var(--color-primary-alt-rgb), 0.2);
    }

    .dev-telemetry-btn:focus-visible {
        outline: 2px solid var(--color-primary-alt);
        outline-offset: 1px;
    }

    .dev-telemetry-counts,
    .dev-telemetry-recent {
        padding: 0.4rem 0.6rem;
        overflow-y: auto;
    }

    .dev-telemetry-counts {
        max-height: 30vh;
        border-bottom: 1px solid rgba(var(--color-primary-alt-rgb), 0.15);
    }

    .dev-telemetry-recent {
        flex: 1;
        min-height: 6rem;
    }

    .dev-telemetry-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 0.65rem;
    }

    .dev-telemetry-table th,
    .dev-telemetry-table td {
        text-align: left;
        padding: 0.1rem 0.25rem;
    }

    .dev-telemetry-table th {
        opacity: 0.6;
        font-weight: 400;
        text-transform: uppercase;
        letter-spacing: 0.05em;
    }

    .dev-telemetry-table td.num,
    .dev-telemetry-table th.num {
        text-align: right;
    }

    .dev-telemetry-table code {
        font-size: 0.65rem;
        color: var(--color-text-teal-muted);
    }

    .dev-telemetry-list {
        list-style: none;
        padding: 0;
        margin: 0;
        display: flex;
        flex-direction: column;
        gap: 0.2rem;
    }

    .dev-telemetry-list li {
        display: grid;
        grid-template-columns: auto 1fr auto;
        gap: 0.4rem;
        align-items: baseline;
        padding: 0.15rem 0.25rem;
        border-radius: 0.2rem;
        background: rgba(var(--color-primary-alt-rgb), 0.04);
    }

    .dev-telemetry-list .seq {
        opacity: 0.5;
        font-size: 0.6rem;
    }

    .dev-telemetry-list .event-name {
        color: var(--color-primary-alt);
        font-size: 0.7rem;
    }

    .dev-telemetry-list .keys {
        display: flex;
        flex-wrap: wrap;
        gap: 0.2rem;
        font-size: 0.6rem;
        color: var(--color-text-teal-dark);
    }

    .dev-telemetry-list .key {
        background: rgba(var(--color-primary-alt-rgb), 0.08);
        padding: 0.05rem 0.25rem;
        border-radius: 0.15rem;
        font-family: inherit;
    }

    .dev-telemetry-list .bytes {
        font-size: 0.6rem;
        opacity: 0.5;
        text-align: right;
    }

    .dev-telemetry-empty {
        margin: 0;
        padding: 0.5rem 0;
        opacity: 0.6;
        text-align: center;
        font-size: 0.7rem;
    }
</style>