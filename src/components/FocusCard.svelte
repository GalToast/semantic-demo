<!--
  @components/FocusCard.svelte — Selected business focus card

  Ported from:
 - (card rendering, selected business hydration)
 - (card chrome, selected-card template)

  Displays the currently focused business record with full details.
  Surfaces: idle (empty), search match, field focus.

  DOM ids/classes expected by contract tests:
    #selected-card, #selected-empty, .selected-empty-headline,
    #selected-details, #selected-name, #selected-what,
    #selected-theme, #selected-status, .selected-hero,
    #selected-role-badge
-->
<script lang="ts">
  import { navStore } from '@lib/stores/navigation.svelte';
  import { activeResult } from '@lib/stores/search.svelte';
  import { businessRecords } from '@lib/data-store';
  import type { BusinessRecord } from '@lib/types/business';
  import { getBusinessNamePresentation, sanitizePublicFacingNote, describeCluster } from '@lib/utils';
  import SelectedBusinessDetails from '@components/SelectedBusinessDetails.svelte';
  import { selectedPointStore } from '@lib/stores/index.svelte.ts';

  // ── Business records (reactive store subscription) ─────────────────────
  // Subscribe to the businessRecords writable store directly. The store is
  // populated by hydrateFromLegacyState() or the data loader during init.
  let _records = $state<readonly BusinessRecord[]>([]);
  $effect(() => {
    const unsub = businessRecords.subscribe(($s) => { _records = $s; });
    return unsub;
  });

  interface Props {
    /** Whether the card is visible */
    visible?: boolean;
    /** Keep the card visible when tests force semantic-dive body state. */
    forceSemanticDiveVisible?: boolean;
  }

  let { visible = false, forceSemanticDiveVisible = false }: Props = $props();

  // ── navStore → $state bridge (5c51450 pattern) ──────────────────────────
  // navStore is a regular svelte/store writable. Reading it via get() inside
  // a $derived does NOT register as a tracked dependency under Svelte 5 runes.
  // Mirror it into a $state rune so $derived/$effect track its changes.
  let nav = $state(navStore());
  $effect(() => {
    const unsub = navStore.subscribe(($s) => (nav = $s));
    return unsub;
  });

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
  // Primary source: body data attribute (parity attrs write this from the
  //   legacy code path; reading it registers a dep on bodyFocusedNode so the
  //   $derived re-evaluates when the body attribute changes).
  // Secondary: navStore rune (5c51450 pattern, mirrors FocusPocket.svelte).

  let currentFocusedIdx = $derived.by(() => {
    void bodyFocusedNode;
    const fromBody = !(bodyFocusedNode === '') ? Number(bodyFocusedNode) : null;
    if (fromBody != null && Number.isFinite(fromBody)) return fromBody;
    const fromNav = nav.focusedIndex;
    if (typeof fromNav === 'number' && Number.isFinite(fromNav)) return fromNav;
    return null;
  });
  let currentActiveResult = $derived(activeResult());
  // Note: avoid `!==` in $derived — Svelte 5 strict-mode compiler bug
  // inverts `!==` to `===`. Use `!= null` (Pattern 3) for null checks.
  let isFocused = $derived(
    nav.mode === 'focus' || nav.mode === 'inside' || currentFocusedIdx != null
  );
  let surface = $derived(nav.surface ?? 'idle');

  let bodyPanelSurface = $state('');
  let bodyPanelSurfaceDetail = $state('');

  let bodyFocusedNode = $state('');
  let bodyNavMode = $state('');
  let _bodySceneReady = $state('');

  $effect(() => {
    if (typeof document === 'undefined') return;
    const syncBodyPanelSurface = () => {
      bodyPanelSurface = document.body.dataset.panelSurface ?? '';
      bodyPanelSurfaceDetail = document.body.dataset.panelSurfaceDetail ?? '';
      bodyFocusedNode = document.body.dataset.focusedNode ?? '';
      bodyNavMode = document.body.dataset.navMode ?? '';
      _bodySceneReady = document.body.dataset.sceneReady ?? '';
    };
    const observer = new MutationObserver(syncBodyPanelSurface);
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['data-panel-surface', 'data-panel-surface-detail', 'data-focused-node', 'data-nav-mode', 'data-scene-ready']
    });
    syncBodyPanelSurface();
    return () => observer.disconnect();
  });

  // Reactive focus detection: read from body data-attrs so Svelte re-evaluates
  // when the legacy code updates the DOM.
  let isFocusedReactive = $derived(
    bodyFocusedNode !== '' || // audit-ok: inside $derived — previously audited as SAFE (RISKY items already fixed)
    bodyNavMode === 'focus' ||
    bodyNavMode === 'inside' ||
    isFocused
  );

  let semanticDiveActive = $derived(
    forceSemanticDiveVisible ||
      bodyPanelSurface === 'semantic-dive' ||
      bodyPanelSurfaceDetail === 'semantic-dive' ||
      String(surface) === 'semantic-dive'
  );

  let selectedRecord = $derived.by((): BusinessRecord | null => {
    // Read _records (a $state rune) so this $derived is registered as a
    // dep on it. _records is updated in the $effect above via the
    // businessRecords store subscription.
    void _records;
    if (_records.length === 0) return null;

    // Use search result if available
    // Note: avoid `!==` in $derived — Svelte 5 strict-mode compiler bug
    // inverts `!==` to `===`. Use `!= null` (Pattern 3) for null checks.
    if (currentActiveResult != null) {
      return _records[Number(currentActiveResult)] ?? null;
    }

    // Otherwise use field focus
    if (currentFocusedIdx != null && currentFocusedIdx >= 0) {
      return _records[currentFocusedIdx] ?? null;
    }

    return null;
  });

  let selectionSource = $derived.by((): 'search' | 'field' | null => {
    if (currentActiveResult != null && selectedRecord != null) return 'search';
    if (currentFocusedIdx != null && currentFocusedIdx >= 0 && selectedRecord != null) return 'field';
    return null;
  });

  // ── View Model (mirrors InfoPanel fallback path) ──────────────────────────────
  let viewModel = $derived.by((): Record<string, unknown> => {
    if (!selectedRecord) return {
      name: 'Select a node',
      filedAs: '',
      showFiledAs: false,
      what: 'Click a business in the field to explore.',
      role: 'Record',
      theme: 'Theme',
      status: 'Record status',
      trivia: '',
      showTrivia: false,
      matchNarrative: '',
      showMatchPanel: false,
      facts: [],
      sensitivityBadges: [],
      mapText: 'No geocoded point yet',
      threadText: 'Waiting for a related path.',
      isPopulated: false
    };

    const rawName = selectedRecord.name ?? '';
    const namePresentation = getBusinessNamePresentation(rawName);
    const name = namePresentation.display || 'Business Name';
    const filedAs = '';
    const showFiledAs = false;
    const what = sanitizePublicFacingNote(selectedRecord.what ?? '');
    const theme = describeCluster(selectedRecord.cluster);
    const status = formatStatus(selectedRecord.status ?? 'active');
    const role = selectionSource === 'search' ? 'Search Match' : 'Field Node';
    const trivia = '';
    const showTrivia = false;
    const matchNarrative = '';
    const showMatchPanel = false;
    const facts: Record<string, unknown>[] = [];
    if (selectedRecord.website) {
      facts.push({ type: 'link', label: 'Website', href: selectedRecord.website, isExternal: true });
    }
    if (selectedRecord.email) {
      facts.push({ type: 'link', label: 'Email', href: `mailto:${selectedRecord.email}`, isExternal: false });
    }
    if (selectedRecord.phone) {
      facts.push({ value: `Phone: ${selectedRecord.phone}` });
    }
    const sensitivityBadges: Record<string, unknown>[] = [];
    const mapText = (selectedRecord.lat != null && selectedRecord.lng != null)
      ? `${selectedRecord.lat.toFixed(4)}, ${selectedRecord.lng.toFixed(4)}`
      : 'No geocoded point yet';
    const threadText = '';

    return {
      name,
      filedAs,
      showFiledAs,
      what,
      role,
      theme,
      status,
      trivia,
      showTrivia,
      matchNarrative,
      showMatchPanel,
      facts,
      sensitivityBadges,
      mapText,
      threadText,
      isPopulated: true
    };
  });

  let selectedCity = $derived.by(() => {
    if (!selectedRecord) return 'Montgomery County';
    return String(selectedRecord.city || 'Montgomery County');
  });

  let isEmpty = $derived(!selectedRecord);
  // When a business is focused, always show the card regardless of search surface.
  // The focused business should never be hidden behind the search chrome.
  let cardVisible = $derived(visible && isFocusedReactive);

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
  <!-- svelte-ignore a11y_no_noninteractive_tabindex: focusable scroll region for keyboard users -->
  <div
    class="focus-card selected-card focus-stage-card"
    id="selected-card"
    class:selected-card-empty={isEmpty}
    role="region"
    tabindex="0"
    aria-label="Selected business"
  >
    <!-- Empty state -->
    {#if isEmpty}
    <div id="selected-empty" class="selected-empty">
      <svg class="empty-icon" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
        <circle cx="12" cy="12" r="10"/>
        <path d="M12 16v-4M12 8h.01"/>
      </svg>
      <p class="selected-empty-headline">Select a node</p>
      <p class="selected-empty-sub">Click a business in the field to explore.</p>
    </div>
    {/if}

    <!-- Populated state -->
    {#if !isEmpty}
      <div id="selected-details" class="selected-details">
        <SelectedBusinessDetails {viewModel} {selectedCity} />
      </div>
    {/if}
  </div>
{/if}

<style>
  .focus-card {
    position: fixed;
    bottom: 4.5rem;
    right: 1rem;
    z-index: var(--z-focus-card, 600);
    width: 260px;
    max-width: 260px;
    min-width: 0;
    background: rgba(7, 16, 24, 0.92);
    backdrop-filter: blur(12px);
    border: 1px solid rgba(78, 205, 196, 0.18);
    border-radius: 0.6rem;
    padding: 0.75rem;
    pointer-events: auto;
    animation: card-enter 0.25s ease-out;
  }
  /* Offset focus card above journey chrome when both are active
     to avoid vertical collision on narrow viewports. */
  :global(body.is-active[data-panel-surface='focus']) .focus-card,
  :global(body.is-active[data-panel-surface='focus-search']) .focus-card {
    bottom: 7rem;
  }

  @media (max-width: 768px) {
    :global(body.is-active[data-panel-surface='focus-search'][data-focus-panel-mode='field-node']) .focus-card.selected-card-empty,
    :global(body[data-panel-surface='focus-search'][data-focus-panel-mode='field-node']) .focus-card.selected-card-empty {
      display: none;
      visibility: hidden;
      pointer-events: none;
    }
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
    color: rgba(78, 205, 196, 0.25); /* a11y-ok: icon-color — empty-state icon, not body text */
  }
  .selected-empty-headline {
    font-size: 0.8rem;
    color: var(--color-text-teal-light);
    opacity: 0.5;
    font-style: italic;
    margin: 0;
  }
  .selected-empty-sub {
    font-size: 0.7rem;
    color: rgba(224, 240, 240, 0.3); /* a11y-ok: caption-text — italic empty-state subhead */
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
    color: var(--color-primary-alt);
  }

  .selected-card-name {
    font-family: 'Bricolage Grotesque', sans-serif;
    font-size: 1rem;
    font-weight: 700;
    color: var(--color-text-teal-light);
    margin: 0;
    line-height: 1.25;
    overflow-wrap: anywhere;
    word-break: break-word;
  }

  .selected-card-category {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--color-primary-alt);
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
    color: var(--status-danger);
  }

  /* ── Location / contact ────────────────────────────────────────────────────── */
  .selected-card-location,
  .selected-card-contact {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.7rem;
    /* A11y W5-T2: lifted from 0.5 to 0.7 (≈9.05:1 contrast) to meet WCAG AA 4.5:1 */
    color: rgba(224, 240, 240, 0.7);
  }
  .selected-card-location svg,
  .selected-card-contact svg {
    flex-shrink: 0;
    color: rgba(78, 205, 196, 0.45); /* a11y-ok: icon-color — contact-method SVG fill */
  }
  .selected-card-link {
    color: var(--color-primary-alt);
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
  .footer-cluster {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.6rem;
    /* A11y W5-T2: lifted from 0.45 to 0.7 (≈9.05:1 contrast) to meet WCAG AA 4.5:1 */
    color: rgba(224, 240, 240, 0.7);
  }
  .footer-source {
    font-size: 0.55rem;
    color: rgba(78, 205, 196, 0.4); /* a11y-ok: caption-text — tiny footer source line */
  }

  @media (max-width: 768px) {
    :global(body.is-active[data-panel-surface='semantic-dive']) :is(.focus-card, .focus-stage-card),
    :global(body[data-panel-surface='semantic-dive']) :is(.focus-card, .focus-stage-card),
    :global(body.is-active[data-panel-surface='focus-search'][data-focus-panel-mode='field-node']) :is(.focus-card, .focus-stage-card),
    :global(body[data-panel-surface='focus-search'][data-focus-panel-mode='field-node']) :is(.focus-card, .focus-stage-card) {
      position: fixed;
      left: 0;
      right: 0;
      bottom: max(0px, env(safe-area-inset-bottom, 0px));
      width: 100%;
      max-width: 100%;
      margin: 0;
      max-height: calc(100dvh - max(0px, env(safe-area-inset-bottom, 0px)) - 10px);
      overflow-y: auto;
      visibility: visible;
      opacity: 1;
      z-index: var(--z-focus-card, 600);
    }

    :global(body.is-active[data-panel-surface='semantic-dive']) :is(.focus-card, .focus-stage-card),
    :global(body[data-panel-surface='semantic-dive']) :is(.focus-card, .focus-stage-card) {
      border-radius: 22px 22px 0 0;
      padding: 18px 14px 10px;
    }

    /* Bottom-sheet radius for all mobile focus states */
    :global(body.is-active[data-panel-surface='focus-search']) :is(.focus-card, .focus-stage-card),
    :global(body[data-panel-surface='focus-search']) :is(.focus-card, .focus-stage-card),
    :global(body.is-active[data-panel-surface='focus']) :is(.focus-card, .focus-stage-card),
    :global(body[data-panel-surface='focus']) :is(.focus-card, .focus-stage-card) {
      border-radius: 22px 22px 0 0;
    }
  }
</style>
