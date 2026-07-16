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
  import { activeResult } from '@lib/stores/search.svelte';
  import { businessRecords } from '@lib/data-store';
  import { parityMap, getBypassAttr } from '@lib/orchestration/parity-attrs.svelte';
  import { appState } from '@lib/state/app.svelte';
  import type { BusinessRecord } from '@lib/types/business';
  import { getBusinessNamePresentation, sanitizePublicFacingNote, describeCluster } from '@lib/utils';
  import { parseLegalName } from '@lib/business/humanize';
  import { CLUSTER_NAMES } from '@lib/utils/ui-presentation';
  import {
    normalizeRelationshipRole,
    getRelationshipRoleLabel,
    describeRelationshipRoleReason,
    type RelationshipRole
  } from '@lib/utils/relationship-roles';
  import SelectedBusinessDetails from '@components/SelectedBusinessDetails.svelte';


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

  // ── navStore → appState.navState (Phase 6) ──────────────────────────────
  // appState.navState is a Svelte 5 rune-backed $state (see app.svelte.ts:223).
  // Reading it inside $derived registers reactivity directly — no mirror needed.
  let nav = $derived(appState.navState);

  // ── Cluster names (canonical, imported from @lib/utils/ui-presentation) ──
  // Previously this component had its own hardcoded 15-entry list that was
  // stale and showed wrong category names. The hardcoded list was a 15-entry
  // subset of an older taxonomy (e.g. "Food & Dining") while the data layer
  // was migrated to a 21-entry taxonomy (e.g. "Food & Hospitality"). The
  // result was every focus card showing the wrong category for the actual
  // cluster index. Now uses the shared canonical list, the same source
  // ProximityLegend and Placeholder2D already use.

  // ── Derived state ─────────────────────────────────────────────────────────────
  // Source: appState.navState rune (Phase 6).
  // The body data-focused-node attr is written by parity-attrs from the same
  // store; we read from the store directly to avoid a body.dataset round-trip.

  let currentFocusedIdx = $derived.by(() => {
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

  // ── Derived state from appState.navState (replaces body.dataset reads) ────
  // The parity layer writes body.dataset.panelSurface, .navMode, .focusedNode,
  // .sceneReady from these same stores. We read from the stores directly to
  // avoid the body.dataset → MutationObserver → $state round-trip.
  let panelSurface = $derived(parityMap.panelSurface ?? '');
  let panelSurfaceDetail = $derived(parityMap.panelSurfaceDetail ?? '');

  // Read body data-focus-panel-mode reactively via shared parity-attrs observer (set by setFocusPanelMode)
  let bodyFocusPanelMode = $derived(getBypassAttr('focusPanelMode') ?? '');

  // Reactive focus detection: read from appState.navState rune so Svelte re-evaluates
  // when nav state changes (same semantics as the former body.dataset reads).
  let isFocusedReactive = $derived(
    currentFocusedIdx != null ||
    nav.mode === 'focus' ||
    nav.mode === 'inside' ||
    isFocused
  );

  let semanticDiveActive = $derived(
    forceSemanticDiveVisible ||
      panelSurface === 'semantic-dive' ||
      panelSurfaceDetail === 'semantic-dive' ||
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
    if (!selectedRecord) return null;
    // A selection is 'search' ONLY when it is an active search result — i.e.
    // the focused node is a member of the current search summary's result
    // set. A plain field/canvas focus (focusedIndex set, no active search)
    // is 'field'. This keeps the de-jargoned badge "Business view" for
    // normal node selections (UX-2) and reserves "Search result" for real
    // matches, fixing the 5k regression where activeResult() (keyed off
    // focusedIndex for ANY focus) mislabeled field clicks as 'search'.
    const summary = appState.searchState.currentSearchSummary as
      | { resultIndices?: number[] }
      | null;
    const isSearchResult =
      !!summary &&
      Array.isArray(summary.resultIndices) &&
      currentFocusedIdx != null &&
      summary.resultIndices.includes(currentFocusedIdx as number);
    if (isSearchResult) return 'search';
    if (currentFocusedIdx != null && currentFocusedIdx >= 0) return 'field';
    return null;
  });

  function relationshipContextFor(candidates: unknown): Record<string, unknown> | null {
    if (!Array.isArray(candidates)) return null;
    const normalized: Array<{ relationshipRole: RelationshipRole; roleReason: string; reason: string }> = [];
    for (const c of candidates) {
      if (!c || typeof c !== 'object') continue;
      const detail = c as Record<string, unknown>;
      const role = normalizeRelationshipRole(String(detail.relationshipRole || ''));
      normalized.push({
        relationshipRole: role,
        roleReason: String(detail.roleReason || ''),
        reason: String(detail.reason || 'Neighborhood connection')
      });
    }
    if (normalized.length === 0) return null;

    const counts = new Map<RelationshipRole, number>();
    for (const c of normalized) {
      counts.set(c.relationshipRole, (counts.get(c.relationshipRole) || 0) + 1);
    }
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    const top = sorted[0];
    if (!top) return null;
    const [dominantRole, dominantCount] = top;
    const topCandidate = normalized.find((c) => c.relationshipRole === dominantRole);
    const distribution = sorted.slice(0, 3).map(([role, count]) => ({
      label: getRelationshipRoleLabel(role, 'rail'),
      count
    }));

    return {
      roleLabel: getRelationshipRoleLabel(dominantRole, 'rail'),
      roleTitle: getRelationshipRoleLabel(dominantRole, 'title'),
      roleReason: describeRelationshipRoleReason(dominantRole, topCandidate?.roleReason),
      dominantCount,
      total: normalized.length,
      distribution,
      hasContext: true
    };
  }

  // ── View Model (mirrors InfoPanel fallback path) ──────────────────────────────
  let viewModel = $derived.by((): Record<string, unknown> => {
    if (!selectedRecord) return {
      name: 'Select a business',
      filedAs: '',
      showFiledAs: false,
      what: 'Click a business on the map to explore.',
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
    // Prefer the human-readable Legal name (from public_note) when present so
    // the user sees "ANGEL FIRE COFFEE" instead of the slug "519-angel-fire-coffee".
    // Falls back to the existing slug-derived title-case name otherwise.
    const legalName = parseLegalName(selectedRecord.public_note);
    const name = legalName ?? namePresentation.display ?? 'Business Name';
    const filedAs = '';
    const showFiledAs = false;
    const what = sanitizePublicFacingNote(selectedRecord.what ?? '');
    const theme = describeCluster(selectedRecord.cluster);
    const status = formatStatus(selectedRecord.status ?? 'active');
    // PR-UX (UI/UX audit): replace internal-data jargon "Field Node" / "Search Match"
    // with user-friendly role labels. See docs/ux-copy-rules.md.
    const role = selectionSource === 'search' ? 'Search result' : 'Business view';
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
    const relationshipContext = relationshipContextFor(nav.threadCandidates);

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
      relationshipContext,
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
  void buildTheme;
</script>

{#if cardVisible}
  <!-- svelte-ignore a11y_no_noninteractive_tabindex: focusable scroll region for keyboard users -->
  <div
    class="focus-card selected-card focus-stage-card"
    class:surface-focus={panelSurface === 'focus'}
    class:surface-focus-search={panelSurface === 'focus-search'}
    class:surface-semantic-dive={semanticDiveActive}
    class:mode-field-node={bodyFocusPanelMode === 'field-node'}
    id="focus-card-selected"
    class:selected-card-empty={isEmpty}
    role="region"
    aria-label="Selected business"
  >
    <!-- Empty state -->
    {#if isEmpty}
    <div id="selected-empty" class="selected-empty">
      <svg class="empty-icon" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
        <circle cx="12" cy="12" r="10"/>
        <path d="M12 16v-4M12 8h.01"/>
      </svg>
      <p class="selected-empty-headline">Select a business</p>
      <p class="selected-empty-sub">Click a business on the map to explore.</p>
    </div>
    {/if}

    <!-- Populated state -->
    {#if !isEmpty}
      <div id="fc-selected-details" class="selected-details">
        <SelectedBusinessDetails {viewModel} {selectedCity} idPrefix="fc-" />
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
    border: 1px solid rgba(var(--color-primary-alt-rgb), 0.18);
    border-radius: 0.6rem;
    padding: 0.75rem;
    pointer-events: auto;
    animation: card-enter 0.25s ease-out;
    box-shadow:
      0 10px 32px rgba(0, 0, 0, 0.55),
      0 0 0 1px rgba(var(--color-primary-alt-rgb), 0.2);
  }

  @media (prefers-reduced-motion: reduce) {
    .focus-card {
      animation: none;
    }
  }

  /* Offset focus card above journey chrome when both are active
     to avoid vertical collision on narrow viewports. */
  .focus-card.surface-focus,
  .focus-card.surface-focus-search {
    bottom: 7rem;
  }

  @media (max-width: 768px) {
    .focus-card.surface-focus-search.mode-field-node.selected-card-empty {
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
    color: rgba(var(--color-primary-alt-rgb), 0.25); /* a11y-ok: icon-color — empty-state icon, not body text */
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

  @media (max-width: 768px) {
    .focus-card.surface-semantic-dive,
    .focus-card.surface-focus-search,
    .focus-card.surface-focus {
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

    .focus-card.surface-semantic-dive {
      border-radius: 22px 22px 0 0;
      padding: 18px 14px 10px;
    }

    /* Bottom-sheet radius for all mobile focus states */
    .focus-card.surface-focus-search,
    .focus-card.surface-focus {
      border-radius: 22px 22px 0 0;
    }

    /* F1-5 fix (bugsweep W1): the focus card also carries .focus-stage-card,
       whose z-index is var(--z-panels-elevated)=90 — ABOVE the a11y toggle
       (var(--z-panels)=80). The shared mobile rule
       `body:not(.surface-idle)[data-panel-surface]:not(.surface-map-any) .focus-stage-card`
       has specificity (0,4,1) (body element + :not()/attr classes) and beats any
       class-only override on .focus-card. Svelte also strips selectors that
       reference elements outside the component (html/body), so we stay on the
       card's own classes and add the always-present .selected-card to reach
       (0,5,0) — 5 classes beats 4 classes, no !important needed. Covers both
       focus surface states. */
    .focus-card.focus-stage-card.selected-card.surface-focus,
    .focus-card.focus-stage-card.selected-card.surface-focus-search {
      z-index: var(--z-focus-stage-card);
    }
  }
</style>
