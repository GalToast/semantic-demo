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
  import { navStore } from '@lib/stores/navigation.svelte.ts';
  import { activeResult, searchSummary } from '@lib/stores/search.svelte';
  import { getBusinessRecords, getIsDataReady } from '@lib/stores/index.svelte.ts';
  import { getBusinessNamePresentation, sanitizePublicFacingNote, getPublicRecordStatusLabel } from '@lib/utils';
  import { describeCluster } from '@lib/utils';
  import { buildSelectedMatchNarrative as buildSearchMatchNarrative, getInterestingBusinessNote } from '@lib/ui/renderers';
  import { describeThreadLensForPoint } from '@lib/journey/point-color';
  import { buildSelectedMatchNarrative as buildPointMatchNarrative } from '@lib/orchestration/lifecycle';
  import { buildSelectedBusinessProps, type SelectedCardAdapter, type BusinessPoint } from '@lib/view-models/selected-business-view-model';
  import { onMount, type Snippet } from 'svelte';
  import { testCompatStore, syncTestStateFromBody } from '@lib/stores/test-compat.svelte.ts';
  import { getInfoPanelContent, type InfoPanelContentDescriptor } from '@lib/orchestration/info-panel-state';
  // CSS side-effect import. Svelte 5 does NOT support `<style src="./X.css">`.
  // See JourneyChrome.svelte for the full note.
  import './InfoPanel.css';
  import SelectedBusinessDetails from '@components/SelectedBusinessDetails.svelte';

  // ── Props ─────────────────────────────────────────────────────────────────────

  interface Props {
    /** Whether the panel is open */
    open?: boolean;
    /** Optional app-owned panel content, e.g. the search drawer in search-family surfaces */
    content?: Snippet;
  }

  let { open = false, content }: Props = $props();

  let testPanelSurface = $derived($testCompatStore.panelSurface || $testCompatStore.navSurface);
  let testFocusedNode = $derived($testCompatStore.focusedNode);
  let testCompact = $derived($testCompatStore.compact === 'true');
  let surface = $derived($navStore.surface ?? 'idle');

  // ── CSS class derivation for body[data-...] selectors ─────────────────────
  // Derive classes from body state so CSS can target .info-panel.surface-focus etc.
  let infoPanelHasFocusedNode = $derived(
    testFocusedNode != null
  );

  // ── Types ─────────────────────────────────────────────────────────────────────

  // BusinessPoint is imported from @lib/view-models/selected-business-view-model.
  // Its [key: string]: unknown index signature accommodates the extra fields
  // (public_note, zip, category) that were previously in a local copy here.

  // ── Adapters ──────────────────────────────────────────────────────────────────

  const selectedDetailsAdapter: Record<string, (..._args: unknown[]) => unknown> = {
    getSelectedBusinessRoleLabel: () => {
      // UX-2 de-jargon (mirrors FocusCard.svelte): a plain field/canvas focus is
      // labeled "Business view"; an active search result is "Search result".
      // Previously hardcoded to "Business", which broke the 5k journey check
      // (it reads the first #selected-role-badge, rendered by this panel).
      const summary = searchSummary() as { resultIndices?: number[] } | null
      const idx = currentFocusedIdx
      const isSearchResult =
        !!summary &&
        Array.isArray(summary.resultIndices) &&
        idx != null &&
        (summary.resultIndices as number[]).includes(idx as number)
      return isSearchResult ? 'Search result' : 'Business view'
    },
    getInterestingBusinessNote: getInterestingBusinessNote as (..._args: unknown[]) => unknown,
    buildSelectedMatchNarrative: buildPointMatchNarrative as (..._args: unknown[]) => unknown,
    describeThreadLensForPoint: describeThreadLensForPoint as (..._args: unknown[]) => unknown
  };

  const COPY = {
    selectedFiledAs: (raw: string) => `Filed as ${raw}`,
    selectedEmptyName: 'Business Name',
    selectedEmptyWhat: 'What they do',
    selectedEmptyRole: 'Business',
    selectedEmptyMap: 'No geocoded point yet',
    selectedEmptyThread: 'Waiting for a related path.',
    selectedEmptyTheme: 'Theme',
    selectedEmptyStatus: 'Business status'
  };

  // ── Derived state ─────────────────────────────────────────────────────────────

  let currentFocusedIdx = $derived($navStore.focusedIndex);
  let currentActiveResult = $derived(activeResult());
  let isFocused = $derived($navStore.mode === 'focus' || $navStore.mode === 'inside' || !($navStore.focusedIndex === null));

  function bodySurfaceOwnsInfoPanel(surfaceValue: string): boolean {
    return surfaceValue === 'focus' ||
      surfaceValue === 'search' ||
      surfaceValue === 'focus-search' ||
      surfaceValue === 'semantic-dive' ||
      surfaceValue === 'map-idle' ||
      surfaceValue === 'map' ||
      surfaceValue === 'map-focus' ||
      surfaceValue === 'map-search' ||
      surfaceValue === 'map-trail' ||
      surfaceValue === 'map-focus-search';
  }

  // Test-compat: derive effective surface/focus from test store if stores not initialized.
  let effectiveSurface = $derived.by(() => {
    // Contract test override: when testPanelSurface is a body-owning surface
    // (set via body.dataset.panelSurface + syncTestStateFromBody), it must take
    // priority over the app-initialized navStore surface. Otherwise the
    // navStore surface (e.g. 'galaxy') preempts the test's explicit override,
    // causing InfoPanel to render the wrong branch in headed/full-suite mode.
    if (testPanelSurface && bodySurfaceOwnsInfoPanel(testPanelSurface)) return testPanelSurface;
    if (bodySurfaceOwnsInfoPanel(surface)) return surface;
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

  // Note: avoid `!==` in $derived — Svelte 5 strict-mode compiler bug
  // inverts `!==` to `===`. Use `!= null` (Pattern 3) for null checks.
  let effectiveFocusedIdx = $derived.by(() => {
    if (currentFocusedIdx != null) return currentFocusedIdx;
    return testFocusedNode;
  });

  let selectedRecord = $derived.by(() => {
    if (effectiveSurface === 'idle') return null;

    // Data not ready OR records empty: render the existing empty-state copy
    // (see viewModel below: COPY.selectedEmptyName etc.). The previous test
    // fallback shipped hardcoded fake business data when !getIsDataReady()
    // — a fake business presented as real if the data load failed AND the
    // user happened to have a focused index. Returning null here routes
    // through the empty-state path, which is what users should see when
    // data isn't ready.
    if (!getIsDataReady() || getBusinessRecords().length === 0) {
      return null;
    }

    if (effectiveSurface === 'search' && currentActiveResult != null) {
      return getBusinessRecords()[Number(currentActiveResult)] ?? null;
    }

    if (effectiveFocusedIdx != null && effectiveFocusedIdx >= 0) {
      return getBusinessRecords()[effectiveFocusedIdx] ?? null;
    }

    return null;
  });

  let selectionSource = $derived.by(() => {
    if (effectiveSurface === 'search' && currentActiveResult != null && selectedRecord != null) {
      return 'search';
    }

    if (
      effectiveFocusedIdx != null
      && effectiveFocusedIdx >= 0
      && selectedRecord != null
    ) {
      return 'field';
    }

    return null;
  });

  /** Whether the panel should visually appear open */
  // Note: avoid `!==` in $derived — Svelte 5 strict-mode compiler bug
  // inverts `!==` to `===`. Use `!= null` (Pattern 3) + positive equality (Pattern 2).
  let panelOpen = $derived(
    contentDescriptor.panelVisible &&
      (open || isFocused || currentActiveResult != null || Boolean(testPanelSurface && !(testPanelSurface === 'idle')))
  );

  /** Whether to show the empty state */
  let isEmpty = $derived(!selectedRecord);
  let hasError = $derived(false); // Extensible: set when record fetch fails

  // Sync test state on mount (no polling — stores are the source of truth)
  onMount(() => {
    syncTestStateFromBody();
  });
  // ── View Model (ports legacy buildSelectedBusinessProps) ──────────────────────

  // Using Record<string, unknown> to match the view model's JSDoc-typed return.
  // The `any` here is intentional: it's a legacy port whose typed return would
  // touch ~20 fields; tightening it is tracked separately.
  const viewModel = $derived.by(() => {
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

    // Reactive source for the selected business point: the view-model $derived
    // already depends on `selectedRecord`, so reading it here (instead of the
    // non-reactive selectedPointStore() snapshot) keeps the selected-business
    // props live on every selection. selectedRecord carries the same record
    // selectedPointStore() resolved for the focus case (and the active search
    // result otherwise).
    const point = selectedRecord as BusinessPoint | null;
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
      const matchNarrative = selectionSource === 'search' && currentActiveResult !== null && summary // audit-ok: inside $derived.by — previously audited as SAFE
        ? buildSearchMatchNarrative(selectedRecord)
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
    return buildSelectedBusinessProps(point as unknown as import('@lib/view-models/selected-business-view-model').BusinessPoint, {}, selectedDetailsAdapter as SelectedCardAdapter | undefined, {
      getBusinessNamePresentation,
      sanitizePublicFacingNote,
      describeCluster,
      getPublicRecordStatusLabel,
      COPY
    });
  });

  let selectedCity = $derived.by(() => {
    if (!selectedRecord) return 'Montgomery County';
    return String(selectedRecord.city || 'Montgomery County');
  });


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
  class:surface-focus={testPanelSurface === 'focus'}
  class:surface-semantic-dive={testPanelSurface === 'semantic-dive'}
  class:surface-idle={testPanelSurface === 'idle'}
  class:is-compact-body={testCompact}
  class:has-focused-node={infoPanelHasFocusedNode}
  aria-hidden={!panelOpen}
  aria-label={panelAriaLabel}
  aria-live="polite"
  id="info-panel"
  onpointerdown={(e) => e.stopPropagation()}
  onwheel={(e) => e.stopPropagation()}
  ondblclick={(e) => e.stopPropagation()}
>
  <!--
    The App-level <SearchBar> is provided through the content snippet in
    search-family surfaces. This panel suppresses selected-business content so the search
    drawer is the only visible content owner.
  -->

  <!-- Surface wrapper for selection state (empty vs populated) -->
  <div class="info-panel-content info-content" id="info-panel-content">
    {@render content?.()}

    {#if contentDescriptor.headerVisible}
      <div class="info-header">
        <h3>{contentDescriptor.headerText}</h3>
      </div>
    {/if}

    <!-- Selected card container -->
    {#if !selectionSuppressed}
    <div
      id="selected-card"
      class="selected-card"
      class:selected-card-empty={isEmpty}
      data-content-owner={effectiveSurface === 'focus' ? 'focus-stage' : 'info-panel'}
      data-content-variant={effectiveSurface === 'focus' ? 'focus-stage' : 'info-panel'}
    >

      <!-- Loading spinner -->
      {#if !getIsDataReady() && getBusinessRecords().length === 0}
        <div class="info-panel-loading" role="status" aria-label="Loading business information">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <circle cx="12" cy="12" r="10" opacity="0.25"/>
            <path d="M12 2a10 10 0 0 1 10 10" stroke-linecap="round"/>
          </svg>
          <span>Loading...</span>
        </div>
      {/if}

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

      <!-- Error state -->
      {#if hasError}
        <div class="info-panel-error" role="alert" aria-live="polite">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <p class="error-headline">Unable to load details</p>
          <p class="error-sub">Please try again later</p>
        </div>
      {/if}

      <!-- Populated state -->
      {#if !isEmpty || effectiveSurface === 'focus'}
      <div id="selected-details" class="info-panel-surface-selection selected-details">
        <SelectedBusinessDetails viewModel={viewModel} selectedCity={selectedCity} />
      </div>
      {/if}
    </div>
    {/if}
  </div>
</aside>

<!--
  Svelte 5 does NOT support `<style src="./X.css">` (Svelte 4 directive that
  is silently dropped). The CSS for this component is loaded via the
  side-effect `import './InfoPanel.css'` in the script block above.
-->
