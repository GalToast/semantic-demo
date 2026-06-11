<!--
  @components/FocusCard.svelte — Selected business focus card

  Ported from:
    - js/modules/journey-selected-card.js (card rendering, selected business hydration)
    - js/modules/ui-renderers.js (card chrome, selected-card template)

  Displays the currently focused business record with full details.
  Surfaces: idle (empty), search match, field focus.

  DOM ids/classes expected by contract tests:
    #selected-card, #selected-empty, .selected-empty-headline,
    #selected-details, #selected-name, #selected-what,
    #selected-theme, #selected-status, .selected-hero,
    #selected-role-badge
-->
<script lang="ts">
  import { currentSurface, hasFocus, focusedIndex } from '@lib/stores/navigation.svelte';
  import { activeResult } from '@lib/stores/search.svelte';
  import { getBusinessRecords, getIsDataReady } from '@lib/stores/index.svelte';
  import type { BusinessRecord } from '@lib/types/business';

  interface Props {
    /** Whether the card is visible */
    visible?: boolean;
  }

  let { visible = false }: Props = $props();

  // ── Cluster names (mirrors CLUSTER_NAMES from state.js) ───────────────────────

  const CLUSTER_NAMES: readonly string[] = [
    'Food & Dining',
    'Professional Services',
    'Retail & Shopping',
    'Health & Medical',
    'Home & Garden',
    'Automotive',
    'Education & Childcare',
    'Entertainment & Events',
    'Construction & Trades',
    'Real Estate',
    'Nonprofit & Civic',
    'Technology',
    'Manufacturing & Industrial',
    'Financial Services',
    'Agriculture & Land'
  ];

  // ── Derived state ─────────────────────────────────────────────────────────────

  let currentFocusedIdx = $derived(focusedIndex());
  let currentActiveResult = $derived(activeResult());
  let isFocused = $derived(hasFocus());
  let surface = $derived(currentSurface());

  let selectedRecord = $derived.by((): BusinessRecord | null => {
    if (!getIsDataReady() || getBusinessRecords().length === 0) return null;

    // Use search result if available
    if (currentActiveResult !== null) {
      return getBusinessRecords()[currentActiveResult.index] ?? null;
    }

    // Otherwise use field focus
    if (currentFocusedIdx !== null && currentFocusedIdx >= 0) {
      return getBusinessRecords()[currentFocusedIdx] ?? null;
    }

    return null;
  });

  let selectionSource = $derived.by((): 'search' | 'field' | null => {
    if (currentActiveResult !== null && selectedRecord !== null) return 'search';
    if (currentFocusedIdx !== null && currentFocusedIdx >= 0 && selectedRecord !== null) return 'field';
    return null;
  });

  let isEmpty = $derived(!selectedRecord);
  let cardVisible = $derived(visible && isFocused && surface !== 'search');

  // ── Display helpers ───────────────────────────────────────────────────────────

  function formatStatus(status: string): string {
    switch (status) {
      case 'active': return 'Active';
      case 'inactive': return 'Inactive';
      case 'disqualified': return 'Disqualified';
      default: return status;
    }
  }

  function formatClusterName(cluster: number): string {
    return CLUSTER_NAMES[cluster % CLUSTER_NAMES.length] ?? 'Uncategorized';
  }

  function buildTheme(record: BusinessRecord): string {
    const cluster = formatClusterName(record.cluster);
    return record.category ? `${cluster} \u00B7 ${record.category}` : cluster;
  }
</script>

{#if cardVisible}
  <div
    class="focus-card selected-card focus-stage-card"
    id="selected-card"
    class:selected-card-empty={isEmpty}
    aria-label="Selected business"
  >
    <!-- Empty state -->
    <div id="selected-empty" class="selected-empty" hidden={!isEmpty}>
      <svg class="empty-icon" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
        <circle cx="12" cy="12" r="10"/>
        <path d="M12 16v-4M12 8h.01"/>
      </svg>
      <p class="selected-empty-headline">Select a node</p>
      <p class="selected-empty-sub">Click a business in the field to explore.</p>
    </div>

    <!-- Populated state -->
    <div id="selected-details" class="selected-details" hidden={isEmpty}>
      {#if selectedRecord}
        <div class="selected-hero">
          <span class="selected-role-badge" id="selected-role-badge">
            {selectionSource === 'search' ? 'Search Match' : 'Field Node'}
          </span>
        </div>

        <h2 class="selected-card-name" id="selected-name" aria-live="polite">{selectedRecord.name}</h2>

        {#if selectedRecord.what}
          <p class="selected-card-what" id="selected-what">{selectedRecord.what}</p>
        {/if}

        <p class="selected-card-category" id="selected-theme">{buildTheme(selectedRecord)}</p>

        <div class="selected-card-status-row">
          <span
            class="selected-card-status"
            id="selected-status"
            class:active={selectedRecord.status === 'active'}
            class:inactive={selectedRecord.status === 'inactive'}
          >
            {formatStatus(selectedRecord.status)}
          </span>
        </div>

        {#if selectedRecord.city}
          <div class="selected-card-location">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
              <circle cx="12" cy="9" r="2.5"/>
            </svg>
            <span>{selectedRecord.city}{selectedRecord.zip ? `, ${selectedRecord.zip}` : ''}</span>
          </div>
        {/if}

        {#if selectedRecord.phone}
          <div class="selected-card-contact">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
            </svg>
            <span>{selectedRecord.phone}</span>
          </div>
        {/if}

        {#if selectedRecord.email}
          <div class="selected-card-contact">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <rect x="2" y="4" width="20" height="16" rx="2"/>
              <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
            </svg>
            <span>{selectedRecord.email}</span>
          </div>
        {/if}

        {#if selectedRecord.website}
          <div class="selected-card-contact">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <circle cx="12" cy="12" r="10"/>
              <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
            </svg>
            <a href={selectedRecord.website} target="_blank" rel="noopener noreferrer" class="selected-card-link">
              {selectedRecord.website.replace(/^https?:\/\//, '')}
            </a>
          </div>
        {/if}

        {#if currentFocusedIdx !== null}
          <div class="selected-card-footer">
            <span class="footer-index">Node {currentFocusedIdx}</span>
            {#if selectionSource === 'field'}
              <span class="footer-source">Field focus</span>
            {:else if selectionSource === 'search'}
              <span class="footer-source">Search result</span>
            {/if}
          </div>
        {/if}
      {/if}
    </div>
  </div>
{/if}

<style>
  .focus-card {
    position: absolute;
    bottom: 4.5rem;
    right: 1rem;
    z-index: var(--z-focus-card, 600);
    width: 260px;
    background: rgba(7, 16, 24, 0.92);
    backdrop-filter: blur(12px);
    border: 1px solid rgba(78, 205, 196, 0.18);
    border-radius: 0.6rem;
    padding: 0.75rem;
    pointer-events: auto;
    animation: card-enter 0.25s ease-out;
  }

  @keyframes card-enter {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
  }

  /* ── Empty state ─────────────────────────────────────────────────────────── */
  .selected-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    padding: 1.5rem 0.5rem;
    gap: 0.4rem;
  }
  .empty-icon {
    color: rgba(78, 205, 196, 0.25);
  }
  .selected-empty-headline {
    font-size: 0.8rem;
    color: #e0f0f0;
    opacity: 0.5;
    font-style: italic;
    margin: 0;
  }
  .selected-empty-sub {
    font-size: 0.7rem;
    color: rgba(224, 240, 240, 0.3);
    margin: 0;
  }

  /* ── Populated card ──────────────────────────────────────────────────────── */
  .selected-details {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }
  .selected-hero {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .selected-role-badge {
    font-size: 0.55rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding: 0.15rem 0.4rem;
    border-radius: 0.2rem;
    background: rgba(78, 205, 196, 0.15);
    color: #4ecdc4;
  }

  .selected-card-name {
    font-family: 'Bricolage Grotesque', sans-serif;
    font-size: 1rem;
    font-weight: 700;
    color: #e0f0f0;
    margin: 0;
    line-height: 1.25;
  }

  .selected-card-category {
    font-size: 0.75rem;
    font-weight: 600;
    color: #4ecdc4;
    margin: 0;
  }

  .selected-card-what {
    font-size: 0.72rem;
    color: rgba(224, 240, 240, 0.65);
    line-height: 1.4;
    margin: 0;
  }

  /* ── Status ────────────────────────────────────────────────────────────────── */
  .selected-card-status-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .selected-card-status {
    font-size: 0.55rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding: 0.15rem 0.4rem;
    border-radius: 0.2rem;
  }
  .selected-card-status.active {
    background: rgba(150, 206, 180, 0.15);
    color: #96ceb4;
  }
  .selected-card-status.inactive {
    background: rgba(255, 107, 107, 0.12);
    color: #ff6b6b;
  }

  /* ── Location / contact ────────────────────────────────────────────────────── */
  .selected-card-location,
  .selected-card-contact {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.7rem;
    color: rgba(224, 240, 240, 0.5);
  }
  .selected-card-location svg,
  .selected-card-contact svg {
    flex-shrink: 0;
    color: rgba(78, 205, 196, 0.45);
  }
  .selected-card-link {
    color: #4ecdc4;
    text-decoration: none;
    transition: color 0.15s ease;
  }
  .selected-card-link:hover {
    color: #7eeee6;
    text-decoration: underline;
  }

  /* ── Footer ──────────────────────────────────────────────────────────────── */
  .selected-card-footer {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding-top: 0.4rem;
    border-top: 1px solid rgba(78, 205, 196, 0.08);
    margin-top: 0.2rem;
  }
  .footer-index {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.6rem;
    color: rgba(224, 240, 240, 0.3);
  }
  .footer-source {
    font-size: 0.55rem;
    color: rgba(78, 205, 196, 0.4);
  }

  @media (max-width: 768px) {
    /* Rely on legacy mobile CSS ownership (mobile_premium__focus-dive.css) for
       bottom-sheet layout and sizing in active states, to prevent Svelte
       scoped CSS from breaking the bottom-flush contract. */

    /* Legacy CSS positions .focus-stage at bottom:0 in dive/focus-search.
       Override the component-scoped bottom:4.5rem so the card sits flush
       with the viewport bottom for the bottom-flush contract. */
    :global(body.is-active[data-panel-surface='semantic-dive']) .focus-card,
    :global(body.is-active[data-panel-surface='semantic-dive']) .focus-stage-card,
    :global(body.is-active[data-panel-surface='focus-search']) .focus-card,
    :global(body.is-active[data-panel-surface='focus-search']) .focus-stage-card,
    :global(body.is-active[data-panel-surface='focus-search'][data-focus-panel-mode='field-node']) .focus-card,
    :global(body.is-active[data-panel-surface='focus-search'][data-focus-panel-mode='field-node']) .focus-stage-card {
      bottom: 0;
      max-height: 62dvh;
      overflow-y: auto;
    }
  }
</style>
