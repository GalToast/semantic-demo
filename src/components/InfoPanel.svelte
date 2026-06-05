<!--
  @components/InfoPanel.svelte — Business info panel

  Mirrors the legacy #info-panel DOM structure for contract test compat.
  Surfaces: idle (empty), search, focus, discovery.
  Driven by navState.surface and focusedIndex / activeResult.

  DOM ids/classes expected by contract tests:
    #info-panel, #info-panel-content, .info-header,
    #selected-card, #selected-empty, .selected-empty-headline, .selected-empty-sub,
    #selected-details, #selected-name, #selected-what, #selected-theme,
    #selected-status, .selected-hero, #selected-role-badge,
    .info-panel-surface-selection
-->
<script lang="ts">
  import { hasFocus, currentSurface } from '@lib/stores/navigation';
  import { focusedIndex } from '@lib/stores/navigation';
  import { activeResult } from '@lib/stores/search';
  import { businessRecords, isDataReady } from '@lib/stores';
  import type { BusinessRecord } from '@lib/types/business';

  // ── Props ─────────────────────────────────────────────────────────────────────

  interface Props {
    /** Whether the panel is open */
    open?: boolean;
  }

  let { open = false }: Props = $props();

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

  let currentFocusedIdx = $derived($focusedIndex);
  let currentActiveResult = $derived($activeResult);
  let isFocused = $derived($hasFocus);
  let surface = $derived($currentSurface);

  let selectedRecord = $derived.by(() => {
    if (!$isDataReady || $businessRecords.length === 0) {
      return null;
    }

    if (surface === 'search' && currentActiveResult !== null) {
      const searchIndex = currentActiveResult.index;
      return $businessRecords[searchIndex] ?? null;
    }

    if (surface === 'focus' && currentFocusedIdx !== null && currentFocusedIdx >= 0) {
      return $businessRecords[currentFocusedIdx] ?? null;
    }

    return null;
  });

  let selectionSource = $derived.by(() => {
    if (surface === 'search' && currentActiveResult !== null && selectedRecord !== null) {
      return 'search';
    }

    if (
      surface === 'focus'
      && currentFocusedIdx !== null
      && currentFocusedIdx >= 0
      && selectedRecord !== null
    ) {
      return 'field';
    }

    return null;
  });

  /** Whether the panel should visually appear open */
  let panelOpen = $derived(open || isFocused || currentActiveResult !== null);

  /** Whether to show the empty state */
  let isEmpty = $derived(!selectedRecord);

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

  /** Build a theme string like "Food & Drink · Cafes" */
  function buildTheme(record: BusinessRecord): string {
    const cluster = formatClusterName(record.cluster);
    return record.category
      ? `${cluster} · ${record.category}`
      : cluster;
  }
</script>

<aside
  class="info-panel"
  class:open={panelOpen}
  aria-hidden={!panelOpen}
  aria-label="Business information"
  id="info-panel"
>
  <!-- Surface wrapper for selection state (empty vs populated) -->
  <div class="info-panel-content" id="info-panel-content">

    <!-- Info header (hidden in search mode per contract) -->
    <div class="info-header">
      <h3>Business Details</h3>
    </div>

    <!-- Selected card container -->
    <div id="selected-card" class:selected-card-empty={isEmpty}>

      <!-- Empty state -->
      <div id="selected-empty" class="selected-empty" hidden={!isEmpty}>
        <svg class="empty-icon" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
          <circle cx="12" cy="12" r="10"/>
          <path d="M12 16v-4M12 8h.01"/>
        </svg>
        <p class="selected-empty-headline">Select a business to see details.</p>
        <p class="selected-empty-sub">Click a node in the field or choose a search result.</p>
      </div>

      <!-- Populated state -->
      <div id="selected-details" class="info-panel-surface-selection selected-details" hidden={isEmpty}>
        {#if selectedRecord}
          <!-- Hero section -->
          <div class="selected-hero">
            <span
              class="selected-role-badge"
              id="selected-role-badge"
            >
              {selectionSource === 'search' ? 'Search Match' : 'Field Node'}
            </span>
          </div>

          <!-- Business name -->
          <h2 class="selected-card-name" id="selected-name">{selectedRecord.name}</h2>

          <!-- What they do -->
          {#if selectedRecord.what}
            <p class="selected-card-what" id="selected-what">{selectedRecord.what}</p>
          {/if}

          <!-- Theme / category -->
          <p class="selected-card-category" id="selected-theme">{buildTheme(selectedRecord)}</p>

          <!-- Status -->
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

          <!-- Location -->
          {#if selectedRecord.city}
            <div class="selected-card-location">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
                <circle cx="12" cy="9" r="2.5"/>
              </svg>
              <span>{selectedRecord.city}{selectedRecord.zip ? `, ${selectedRecord.zip}` : ''}</span>
            </div>
          {/if}

          <!-- Contact info -->
          {#if selectedRecord.phone}
            <div class="selected-card-contact">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
              </svg>
              <span>{selectedRecord.phone}</span>
            </div>
          {/if}

          {#if selectedRecord.email}
            <div class="selected-card-contact">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <rect x="2" y="4" width="20" height="16" rx="2"/>
                <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
              </svg>
              <span>{selectedRecord.email}</span>
            </div>
          {/if}

          {#if selectedRecord.website}
            <div class="selected-card-contact">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <circle cx="12" cy="12" r="10"/>
                <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
              </svg>
              <a href={selectedRecord.website} target="_blank" rel="noopener noreferrer" class="selected-card-link">
                {selectedRecord.website.replace(/^https?:\/\//, '')}
              </a>
            </div>
          {/if}

          <!-- Public note -->
          {#if selectedRecord.public_note}
            <div class="selected-card-note">
              <p class="note-label">Note</p>
              <p class="note-text">{selectedRecord.public_note}</p>
            </div>
          {/if}

          <!-- Search snippet -->
          {#if selectionSource === 'search' && currentActiveResult?.snippet}
            <div class="selected-card-snippet">
              <p class="snippet-label">Match reason</p>
              <p class="snippet-text">{currentActiveResult.snippet}</p>
              {#if currentActiveResult.score > 0}
                <span class="snippet-score">Relevance: {currentActiveResult.score.toFixed(2)}</span>
              {/if}
            </div>
          {/if}

          <!-- Footer -->
          <div class="selected-card-footer">
            {#if currentFocusedIdx !== null}
              <span class="footer-index">Node {currentFocusedIdx}</span>
            {/if}
            {#if selectionSource === 'field'}
              <span class="footer-source">Field focus</span>
            {:else if selectionSource === 'search'}
              <span class="footer-source">Search result</span>
            {/if}
          </div>
        {/if}
      </div>
    </div>
  </div>
</aside>

<style>
  .info-panel {
    position: absolute;
    top: 0;
    right: 0;
    width: 320px;
    height: 100%;
    z-index: var(--z-panels, 80);
    background: rgba(7, 16, 24, 0.92);
    backdrop-filter: blur(12px);
    transform: translateX(100%);
    transition: transform 0.3s ease;
    overflow-y: auto;
    padding: 1rem;
    scrollbar-width: thin;
    scrollbar-color: rgba(78, 205, 196, 0.2) transparent;
  }
  .info-panel::-webkit-scrollbar {
    width: 4px;
  }
  .info-panel::-webkit-scrollbar-thumb {
    background: rgba(78, 205, 196, 0.2);
    border-radius: 2px;
  }
  .info-panel.open {
    transform: translateX(0);
  }
  .info-panel-content {
    padding-top: 3rem;
  }

  /* ── Info header (hidden in search mode per contract) ──────────────────── */
  .info-header {
    margin-bottom: 0.75rem;
  }
  .info-header h3 {
    font-family: 'Bricolage Grotesque', sans-serif;
    font-size: 0.8rem;
    font-weight: 600;
    color: rgba(78, 205, 196, 0.6);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin: 0;
  }

  /* ── Empty state ─────────────────────────────────────────────────────────── */
  .selected-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 3rem 1rem;
    gap: 0.75rem;
  }
  .empty-icon {
    color: rgba(78, 205, 196, 0.25);
    margin-bottom: 0.5rem;
  }
  .selected-empty-headline {
    opacity: 0.5;
    font-style: italic;
    font-size: 0.875rem;
    color: #e0f0f0;
    margin: 0;
  }
  .selected-empty-sub {
    font-size: 0.75rem;
    color: rgba(224, 240, 240, 0.3);
    margin: 0;
  }

  /* ── Populated card layout ──────────────────────────────────────────────── */
  .selected-details {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }
  .selected-hero {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .selected-role-badge {
    font-size: 0.6rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding: 0.2rem 0.5rem;
    border-radius: 0.25rem;
    background: rgba(78, 205, 196, 0.15);
    color: #4ecdc4;
    white-space: nowrap;
  }

  .selected-card-name {
    font-family: 'Bricolage Grotesque', sans-serif;
    font-size: 1.25rem;
    font-weight: 700;
    color: #e0f0f0;
    margin: 0;
    line-height: 1.3;
  }

  .selected-card-category {
    font-size: 0.8rem;
    font-weight: 600;
    color: #4ecdc4;
    margin: 0;
  }

  .selected-card-what {
    font-size: 0.8rem;
    color: rgba(224, 240, 240, 0.7);
    line-height: 1.45;
    margin: 0;
  }

  /* ── Status badge ────────────────────────────────────────────────────────── */
  .selected-card-status-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .selected-card-status {
    font-size: 0.6rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding: 0.2rem 0.5rem;
    border-radius: 0.25rem;
    white-space: nowrap;
  }
  .selected-card-status.active {
    background: rgba(150, 206, 180, 0.15);
    color: #96ceb4;
  }
  .selected-card-status.inactive {
    background: rgba(255, 107, 107, 0.12);
    color: #ff6b6b;
  }

  /* ── Location ────────────────────────────────────────────────────────────── */
  .selected-card-location {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.75rem;
    color: rgba(224, 240, 240, 0.5);
  }
  .selected-card-location svg {
    flex-shrink: 0;
    color: rgba(78, 205, 196, 0.5);
  }

  /* ── Contact rows ────────────────────────────────────────────────────────── */
  .selected-card-contact {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.75rem;
    color: rgba(224, 240, 240, 0.55);
  }
  .selected-card-contact svg {
    flex-shrink: 0;
    color: rgba(78, 205, 196, 0.4);
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

  /* ── Public note ─────────────────────────────────────────────────────────── */
  .selected-card-note {
    background: rgba(78, 205, 196, 0.06);
    border-radius: 0.375rem;
    padding: 0.5rem 0.6rem;
    margin-top: 0.15rem;
  }
  .note-label,
  .snippet-label {
    font-size: 0.6rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: rgba(78, 205, 196, 0.6);
    margin: 0 0 0.2rem 0;
  }
  .note-text {
    font-size: 0.75rem;
    color: rgba(224, 240, 240, 0.6);
    line-height: 1.4;
    margin: 0;
  }

  /* ── Search snippet ──────────────────────────────────────────────────────── */
  .selected-card-snippet {
    background: rgba(78, 205, 196, 0.06);
    border-left: 2px solid rgba(78, 205, 196, 0.3);
    border-radius: 0 0.375rem 0.375rem 0;
    padding: 0.5rem 0.6rem;
    margin-top: 0.15rem;
  }
  .snippet-text {
    font-size: 0.75rem;
    color: rgba(224, 240, 240, 0.6);
    line-height: 1.4;
    margin: 0;
  }
  .snippet-score {
    display: block;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.65rem;
    color: #96ceb4;
    margin-top: 0.3rem;
  }

  /* ── Footer ──────────────────────────────────────────────────────────────── */
  .selected-card-footer {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding-top: 0.5rem;
    border-top: 1px solid rgba(78, 205, 196, 0.08);
    margin-top: 0.3rem;
  }
  .footer-index {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.65rem;
    color: rgba(224, 240, 240, 0.3);
  }
  .footer-source {
    font-size: 0.6rem;
    color: rgba(78, 205, 196, 0.4);
  }

  /* ── Mobile: bottom sheet ────────────────────────────────────────────────── */
  @media (max-width: 768px) {
    .info-panel {
      width: 100%;
      height: auto;
      max-height: 50vh;
      top: auto;
      bottom: 0;
      transform: translateY(100%);
      border-radius: 1rem 1rem 0 0;
    }
    .info-panel.open {
      transform: translateY(0);
    }
    .info-panel-content {
      padding-top: 1rem;
    }
    .selected-card-name {
      font-size: 1.1rem;
    }
  }
</style>
