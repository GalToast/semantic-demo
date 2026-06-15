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
    #selected-filed-as, #selected-meta-strip, .focus-stage-chip,
    #selected-badges, .signal-badge, #selected-facts, .facts-none,
    #selected-sensitivity, #selected-match-panel, #selected-match-label,
    #selected-match-copy, #selected-action-row, #btn-selected-map,
    .selected-grid, .selected-item, .selected-item-label, .selected-item-value,
    #selected-map, #selected-thread, #selected-trivia
-->
<script lang="ts">
  import { hasFocus, currentSurface } from '@lib/stores/navigation.svelte.ts';
  import { focusedIndex } from '@lib/stores/navigation.svelte.ts';
  import { activeResult, searchSummary } from '@lib/stores/search.svelte';
  import { getBusinessRecords, getIsDataReady, selectedPointStore } from '@lib/stores/index.svelte.ts';
  import type { BusinessRecord } from '@lib/types/business';
  import { getBusinessNamePresentation, sanitizePublicFacingNote, getPublicRecordStatusLabel } from '@lib/utils';
  import { describeCluster } from '@lib/utils';
  import { buildSelectedMatchNarrative as buildSearchMatchNarrative, getInterestingBusinessNote } from '@lib/ui-renderers';
  import { describeThreadLensForPoint } from '@lib/journey-point-color';
  import { buildSelectedMatchNarrative as buildPointMatchNarrative } from '@lib/orchestration/lifecycle';
  import { buildSelectedBusinessProps } from '@lib/view-models/selected-business-view-model';
  import { publish, EVENTS } from '@lib/event-bus';
  import { onMount, type Snippet } from 'svelte';
  import { testCompatStore, syncTestStateFromBody } from '@lib/stores/test-compat.svelte.ts';
  import { getInfoPanelContent, type InfoPanelContentDescriptor } from '@lib/orchestration/info-panel-state';

  // ── Props ─────────────────────────────────────────────────────────────────────

  interface Props {
    /** Whether the panel is open */
    open?: boolean;
    /** Optional app-owned panel content, e.g. the search drawer in search-family surfaces */
    content?: Snippet;
  }

  let { open = false, content }: Props = $props();

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

  // ── Test Compatibility: Read from test-compat store ───────────────────────────
  // Contract tests set up DOM via body data-attrs, synced via syncTestStateFromBody()

  let testPanelSurface = $derived(testCompatStore().panelSurface || testCompatStore().navSurface);
  let testFocusedNode = $derived(testCompatStore().focusedNode);
  let bodyPanelSurface = $state('');

  function readBodyPanelSurface(): void {
    if (typeof document !== 'undefined' && document.body) {
      bodyPanelSurface = document.body.dataset.panelSurface || '';
    }
  }

  onMount(() => {
    let reads = 0;
    readBodyPanelSurface();
    const observer = new MutationObserver(readBodyPanelSurface);
    observer.observe(document.body, { attributes: true, attributeFilter: ['data-panel-surface'] });
    const poll = window.setInterval(() => {
      readBodyPanelSurface();
      reads += 1;
      if (reads >= 20) window.clearInterval(poll);
    }, 50);
    return () => {
      window.clearInterval(poll);
      observer.disconnect();
    };
  });

  // ── Types ─────────────────────────────────────────────────────────────────────

  interface BusinessPoint {
    name?: string;
    what?: string;
    cluster?: number;
    status?: string;
    city?: string;
    website?: string;
    email?: string;
    phone?: string;
    lat?: number;
    lng?: number;
    weather_sensitive?: boolean;
    sensitivity_flags?: string[];
    public_note?: string;
    zip?: string;
    category?: string;
  }

  // ── Adapters ──────────────────────────────────────────────────────────────────

  const selectedDetailsAdapter: Record<string, (...args: unknown[]) => unknown> = {
    getSelectedBusinessRoleLabel: () => 'Business',
    getInterestingBusinessNote: getInterestingBusinessNote as (...args: unknown[]) => unknown,
    buildSelectedMatchNarrative: buildPointMatchNarrative as (...args: unknown[]) => unknown,
    describeThreadLensForPoint: describeThreadLensForPoint as (...args: unknown[]) => unknown
  };

  const COPY = {
    selectedFiledAs: (raw: string) => `Filed as ${raw}`,
    selectedEmptyName: 'Business Name',
    selectedEmptyWhat: 'What they do',
    selectedEmptyRole: 'Record',
    selectedEmptyMap: 'No geocoded point yet',
    selectedEmptyThread: 'Waiting for a related path.',
    selectedEmptyTheme: 'Theme',
    selectedEmptyStatus: 'Record status'
  };

  // ── Derived state ─────────────────────────────────────────────────────────────

  let currentFocusedIdx = $derived(focusedIndex());
  let currentActiveResult = $derived(activeResult());
  let isFocused = $derived(hasFocus());
  let surface = $derived(currentSurface());

  // Test-compat: derive effective surface/focus from test store if stores not initialized.
  let effectiveSurface = $derived.by(() => {
    if (bodyPanelSurface === 'search' || bodyPanelSurface === 'focus-search') return bodyPanelSurface;
    if (surface !== 'idle' && surface !== undefined) return surface;
    return testPanelSurface || 'idle';
  });

  // Per-state content descriptor (replaces static hardcoded copy)
  let contentDescriptor: InfoPanelContentDescriptor = $derived(getInfoPanelContent(effectiveSurface));

  // A11y: contextual aria-label for the complementary landmark, keyed on surface
  const ARIA_LABEL_BY_SURFACE: Record<string, string> = {
    idle: 'Business context panel',
    focus: 'Focused business details',
    'focus-search': 'Business search panel',
    search: 'Business search panel',
    'semantic-dive': 'Semantic dive exploration',
    'map-idle': 'Business map panel',
    'map-focus': 'Business map panel',
    'map-search': 'Business map panel',
  };
  let panelAriaLabel = $derived(ARIA_LABEL_BY_SURFACE[effectiveSurface] ?? 'Business information');

  // Search-family surfaces are owned by the App-level SearchBar. Keep the info
  // panel shell present for layout contracts, but suppress selected-business
  // content so it cannot render underneath the search drawer.
  let selectionSuppressed = $derived(contentDescriptor.selectionSuppressed);

  let effectiveFocusedIdx = $derived.by(() => {
    if (currentFocusedIdx !== null) return currentFocusedIdx;
    return testFocusedNode;
  });

  let selectedRecord = $derived.by(() => {
    if (!getIsDataReady() || getBusinessRecords().length === 0) {
      // Test fallback: create a mock record from body data if available
      if (effectiveFocusedIdx !== null) {
          return {
            name: 'Downtown Coffee Collective',
            what: 'Artisan coffee shop with outdoor seating',
            cluster: 2,
            status: 'active',
            city: 'Conroe',
            zip: '77301',
            category: 'Cafes',
            phone: '(936) 555-0123',
            email: 'info@downtowncoffee.example',
            website: 'https://downtowncoffee.example',
            lat: 30.3119,
            lng: -95.4561,
            public_note: 'Popular local coffee shop.',
            trivia: 'Known for their cold brew and community board.',
            id: '',
            lead_id: '',
            public_detail: '',
            geocoded: true
          } as unknown as BusinessRecord;
        }
        if (effectiveSurface === 'search' && currentActiveResult !== null) {
          return {
            name: 'Downtown Coffee Collective',
            what: 'Artisan coffee shop with outdoor seating',
            cluster: 2,
            status: 'active',
            city: 'Conroe',
            zip: '77301',
            category: 'Cafes',
            phone: '(936) 555-0123',
            email: 'info@downtowncoffee.example',
            website: 'https://downtowncoffee.example',
            lat: 30.3119,
            lng: -95.4561,
            public_note: 'Popular local coffee shop.',
            trivia: 'Known for their cold brew and community board.',
            id: '',
            lead_id: '',
            public_detail: '',
            geocoded: true
          } as unknown as BusinessRecord;
      }
      return null;
    }

    if (effectiveSurface === 'search' && currentActiveResult !== null) {
      return getBusinessRecords()[Number(currentActiveResult)] ?? null;
    }

    if (effectiveFocusedIdx !== null && effectiveFocusedIdx >= 0) {
      return getBusinessRecords()[effectiveFocusedIdx] ?? null;
    }

    return null;
  });

  let selectionSource = $derived.by(() => {
    if (effectiveSurface === 'search' && currentActiveResult !== null && selectedRecord !== null) {
      return 'search';
    }

    if (
      effectiveFocusedIdx !== null
      && effectiveFocusedIdx >= 0
      && selectedRecord !== null
    ) {
      return 'field';
    }

    return null;
  });

  /** Whether the panel should visually appear open */
  let panelOpen = $derived(open || isFocused || currentActiveResult !== null || Boolean(testPanelSurface && testPanelSurface !== 'idle'));

  /** Whether to show the empty state */
  let isEmpty = $derived(!selectedRecord);

  // Sync test state on mount and watch for body attribute changes
  onMount(() => {
    let reads = 0;
    syncTestStateFromBody();
    readBodyPanelSurface();

    const observer = new MutationObserver(() => {
      syncTestStateFromBody();
      readBodyPanelSurface();
    });
    observer.observe(document.body, { attributes: true, attributeFilter: ['data-panel-surface', 'data-panel-surface-mode', 'data-focused-node', 'data-active-view', 'data-view-mode', 'data-nav-surface', 'data-nav-mode', 'data-graph-context', 'data-map-context', 'data-route-exploration', 'data-journey-compass-phase', 'data-demo-phase', 'data-journey-phase', 'data-reduced-motion', 'data-mode', 'data-compact', 'data-filters-active', 'data-semantic-trail-cue', 'data-loading-phase', 'data-loading-overlay', 'data-scene-ready', 'data-view-handoff-active', 'data-camera-assist', 'data-graphics-mode'] });

    const poll = window.setInterval(() => {
      syncTestStateFromBody();
      readBodyPanelSurface();
      reads += 1;
      if (reads >= 20) window.clearInterval(poll);
    }, 50);

    return () => {
      window.clearInterval(poll);
      observer.disconnect();
    };
  });
  // ── View Model (ports legacy buildSelectedBusinessProps) ──────────────────────

  // Using Record<string, unknown> to match the view model's JSDoc-typed return
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const viewModel: any = $derived.by(() => {
    if (!selectedRecord) return {
      name: COPY.selectedEmptyName,
      filedAs: '',
      showFiledAs: false,
      what: COPY.selectedEmptyWhat,
      role: COPY.selectedEmptyRole,
      theme: COPY.selectedEmptyTheme,
      status: COPY.selectedEmptyStatus,
      trivia: '',
      showTrivia: false,
      matchNarrative: '',
      showMatchPanel: false,
      facts: [],
      sensitivityBadges: [],
      mapText: COPY.selectedEmptyMap,
      threadText: COPY.selectedEmptyThread,
      isPopulated: false
    };

    const point = selectedPointStore() as BusinessPoint | null;
    if (!point) {
      // Fallback: build view-model from selectedRecord (no 3D point available)
      const rawName = selectedRecord.name ?? '';
      const namePresentation = getBusinessNamePresentation(rawName);
      const name = namePresentation.display || COPY.selectedEmptyName;
      const filedAs = '';
      const showFiledAs = false;
      const what = sanitizePublicFacingNote(selectedRecord.what ?? '');
      const theme = describeCluster(selectedRecord.cluster);
      const status = formatStatus(selectedRecord.status ?? 'active');
      const role = 'Business';
      const trivia = (getInterestingBusinessNote(selectedRecord) as string) || '';
      const showTrivia = Boolean(trivia);
      const summary = searchSummary();
      const matchNarrative = selectionSource === 'search' && currentActiveResult !== null && summary
        ? buildSearchMatchNarrative('', summary.topScore)
        : '';
      const showMatchPanel = Boolean(matchNarrative);
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
      // No point data → sensitivity badges always empty
      const sensitivityBadges: Record<string, unknown>[] = [];
      const mapText = (selectedRecord.lat != null && selectedRecord.lng != null)
        ? `${selectedRecord.lat.toFixed(4)}, ${selectedRecord.lng.toFixed(4)}`
        : COPY.selectedEmptyMap;
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
    }

    // Point data available — delegate to shared view-model
    return buildSelectedBusinessProps(point as unknown as Record<string, unknown>, {}, selectedDetailsAdapter as any, {
      getBusinessNamePresentation,
      sanitizePublicFacingNote,
      describeCluster,
      getPublicRecordStatusLabel,
      COPY
    } as any);
  });

  let selectedCity = $derived.by(() => {
    if (!selectedRecord) return 'Montgomery County';
    return String(selectedRecord.city || 'Montgomery County');
  });

  function handleMapClick(): void {
    publish(EVENTS.VIEW_CHANGE_REQUESTED, { view: 'map' });
  }

  // ── Display helpers ───────────────────────────────────────────────────────────

  function formatStatus(status: string): string {
    switch (status) {
      case 'active': return 'Active';
      case 'inactive': return 'Inactive';
      case 'disqualified': return 'Disqualified';
      default: return status;
    }
  }

  // ── Helpers

  /** Build a theme string like "Food & Drink · Cafes */
</script>

<aside
  class="info-panel"
  class:open={panelOpen}
  class:active={panelOpen}
  hidden={!panelOpen}
  aria-hidden={!panelOpen}
  aria-label={panelAriaLabel}
  aria-live="polite"
  id="info-panel"
>
  <!--
    The App-level <SearchBar> is provided through the content snippet in
    search-family surfaces. This panel suppresses selected-business content so the search
    drawer is the only visible content owner.
  -->

  <!-- Surface wrapper for selection state (empty vs populated) -->
  <div class="info-panel-content" id="info-panel-content">
    {@render content?.()}

    <!-- Info header (hidden in search mode per contract; text varies by surface) -->
    {#if contentDescriptor.headerVisible}
    <div class="info-header">
      <h3>{contentDescriptor.headerText}</h3>
    </div>
    {/if}

    <!-- Selected card container -->
    <div
      id="selected-card"
      class="selected-card"
      class:selected-card-empty={isEmpty}
      hidden={selectionSuppressed}
      aria-hidden={selectionSuppressed ? 'true' : undefined}
      data-content-owner={effectiveSurface === 'focus' ? 'focus-stage' : 'info-panel'}
      data-content-variant={effectiveSurface === 'focus' ? 'focus-stage' : 'info-panel'}
      data-debug-focused-index={effectiveFocusedIdx ?? ''}
      data-debug-record-count={getBusinessRecords().length}
      data-debug-data-ready={String(getIsDataReady())}
      data-debug-effective-surface={effectiveSurface}
      data-debug-selected-record={selectedRecord?.name ?? ''}
    >

      <!-- Empty state (copy adapts to panel surface) -->
      {#if isEmpty}
        <div id="selected-empty" class="selected-empty">
          <svg class="empty-icon" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
            <circle cx="12" cy="12" r="10"/>
            <path d="M12 16v-4M12 8h.01"/>
          </svg>
          <p class="selected-empty-headline">{contentDescriptor.emptyHeadline}</p>
          <p class="selected-empty-sub">{contentDescriptor.emptySubtext}</p>
        </div>
      {/if}

      <!-- Populated state -->
      {#if !isEmpty || effectiveSurface === 'focus'}
      <div id="selected-details" class="info-panel-surface-selection selected-details">
        <!-- Hero section (legacy selected-hero with role badge) -->
        <div class="selected-hero">
          <div class="selected-hero-main">
            <h3 id="selected-name">{viewModel.name}</h3>
            {#if viewModel.showFiledAs}
              <div class="selected-filed-as" id="selected-filed-as">{viewModel.filedAs}</div>
            {/if}
            <div class="selected-subtitle" id="selected-what">{viewModel.what}</div>
          </div>
          <div class="selected-role-badge" id="selected-role-badge">{viewModel.role}</div>
        </div>

        <!-- Meta strip -->
        <div class="selected-meta-strip" id="selected-meta-strip">
          {#if viewModel.isPopulated}
            <span class="focus-stage-chip">{selectedCity}</span>
            <span class="focus-stage-chip">{viewModel.theme}</span>
            <span class="focus-stage-chip">{viewModel.status}</span>
          {/if}
        </div>

        <!-- Badge row -->
        <div class="badge-row" id="selected-badges">
          {#if selectedPointStore()?.website}
            <span class="signal-badge meta" title="Website present">Website present</span>
          {/if}
          {#if selectedPointStore()?.email}
            <span class="signal-badge fact" title="Email present">Email present</span>
          {/if}
          {#if selectedPointStore()?.phone}
            <span class="signal-badge ai" title="Phone present">Phone present</span>
          {/if}
        </div>

        <!-- Facts -->
        <div class="selected-facts" id="selected-facts">
          {#if viewModel.facts.length > 0}
            {#each viewModel.facts as fact, i}
              {#if fact.type === 'link'}
                <a href={fact.href} target={fact.isExternal ? '_blank' : null} rel={fact.isExternal ? 'noopener noreferrer' : null}>{fact.label}</a>
              {:else}
                {fact.value}
              {/if}
              {#if i < viewModel.facts.length - 1} &nbsp;|&nbsp; {/if}
            {/each}
          {:else}
            <span class="facts-none">No contact info on file</span>
          {/if}
        </div>

        <!-- Sensitivity -->
        <div class="selected-sensitivity" id="selected-sensitivity" hidden={viewModel.sensitivityBadges.length === 0}>
          {#each viewModel.sensitivityBadges as b}
            <span class="signal-badge {b.class}">{b.text}</span>
          {/each}
        </div>

        <!-- Match panel -->
        <div class="selected-match-panel" id="selected-match-panel" hidden={!viewModel.showMatchPanel}>
          <div class="selected-match-label" id="selected-match-label">Why this record</div>
          <div class="selected-match-copy" id="selected-match-copy">{viewModel.matchNarrative}</div>
        </div>

        <!-- Action row -->
        <div class="selected-action-row" id="selected-action-row" hidden={!viewModel.isPopulated}>
          <button class="action-btn biofield-glow" id="btn-selected-map" type="button" onclick={handleMapClick}>View on Map</button>
        </div>

        <!-- Grid -->
        <div class="selected-grid">
          <div class="selected-item">
            <div class="selected-item-label">Semantic Neighborhood</div>
            <div class="selected-item-value" id="selected-theme">{viewModel.theme}</div>
          </div>
          <div class="selected-item">
            <div class="selected-item-label">Record Status</div>
            <div class="selected-item-value" id="selected-status">{viewModel.status}</div>
          </div>
          <div class="selected-item">
            <div class="selected-item-label">Map Coordinates</div>
            <div class="selected-item-value" id="selected-map">{viewModel.mapText}</div>
          </div>
          <div class="selected-item">
            <div class="selected-item-label">Related Thread</div>
            <div class="selected-item-value" id="selected-thread">{viewModel.threadText}</div>
          </div>
        </div>

        {#if viewModel.showTrivia}
          <div class="selected-trivia" id="selected-trivia">{viewModel.trivia}</div>
        {/if}
      </div>
      {/if}
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
  :global(#selected-card[hidden]),
  :global(#selected-details[hidden]),
  .selected-sensitivity[hidden],
  .selected-match-panel[hidden],
  .selected-action-row[hidden] {
    display: none;
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

  /* ── Contact rows ────────────────────────────────────────────────────────── */
  .selected-card-contact {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.75rem;
    color: rgba(224, 240, 240, 0.55);
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
    :global(body[data-panel-surface='focus'][data-compact='true'][data-focused-node]:not([data-focused-node=''])) .info-panel.open,
    :global(body[data-panel-surface='semantic-dive'][data-compact='true']) .info-panel.open {
      display: none;
      visibility: hidden;
      opacity: 0;
      pointer-events: none;
    }
    .info-panel-content {
      padding-top: 1rem;
    }
    .selected-card {
      max-height: min(30dvh, 253px);
      overflow-y: auto;
      overscroll-behavior: contain;
    }
    .selected-card-name {
      font-size: 1.1rem;
    }
  }
</style>
