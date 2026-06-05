/**
 * @lib/orchestration/compass-controller.ts
 * 
 * Execute compass actions based on state.
 * Replaces js/modules/journey-compass-controller.js.
 *
 * Reads compass state, syncs DOM elements, and dispatches
 * journey actions (search focus, anchor center, map switch, etc.).
 */
import { get } from 'svelte/store';
import { navStore, switchView as navSwitchView } from '@lib/stores/navigation';
import { searchStore } from '@lib/stores/search';
import {
  JOURNEY_COMPASS_PHASE_ORDER,
  JOURNEY_CONFIG,
  setTrailDepth as journeySetTrailDepth
} from '@lib/stores/journey';
import {
  focusStore,
  setSemanticDiveMode
} from '@lib/stores/focus';
import {
  isMapSummarySurface,
  isSemanticDiveSurface
} from '@lib/stores/viewport';
import {
  getJourneyCompassState,
  getFocusedJourneyPoint,
  type CompassStateContext
} from './compass-state';
import { JOURNEY_ACTIONS, type CompassAction } from '@lib/stores/compass';

// ── Types ─────────────────────────────────────────────────────────────────

export interface CompassPresentationState {
  density: 'hidden' | 'compact' | 'expanded';
  copy: 'quiet' | 'full';
  actions: 'minimal' | 'primary-secondary' | 'route' | 'standard';
  navigationOwner: string;
}

export interface ViewHandoffModel {
  icon: string;
  kicker: string;
  title: string;
  note: string;
}

// ── Internal State ────────────────────────────────────────────────────────

let _switchView: (view: string) => void = (view) => navSwitchView(view as 'galaxy' | 'map');

// ── Initialization ────────────────────────────────────────────────────────

/**
 * Initialize the journey compass adapter with a view-switch function.
 * Subscribes to relevant events so the compass stays in sync.
 */
export function initJourneyCompassAdapter(opts: {
  switchView?: (view: string) => void;
} = {}): void {
  if (typeof opts.switchView === 'function') {
    _switchView = opts.switchView;
  }
  // Event subscriptions are wired in App.svelte via onMount;
  // this function is the legacy init entry point kept for API compat.
}

// ── Presentation State ────────────────────────────────────────────────────

/**
 * Derive the compass presentation layout from the current compass state.
 */
export function getJourneyCompassPresentationState(
  compassState: Partial<CompassStateContext> = {}
): CompassPresentationState {
  const phase = compassState.phase || 'overview';
  const $nav = get(navStore);
  const hasTrail = $nav.trailDepth > 0;

  if (phase === 'map') {
    return {
      density: 'hidden',
      copy: 'quiet',
      actions: 'minimal',
      navigationOwner: hasTrail ? 'map-trail-strip' : 'map-controls'
    };
  }

  if (phase === 'search' || phase === 'focus') {
    return {
      density: 'compact',
      copy: 'quiet',
      actions: 'primary-secondary',
      navigationOwner: 'scene'
    };
  }

  if (phase === 'inside') {
    return {
      density: 'compact',
      copy: 'quiet',
      actions: 'route',
      navigationOwner: 'inside-walk'
    };
  }

  return {
    density: 'expanded',
    copy: 'full',
    actions: 'standard',
    navigationOwner: 'journey-compass'
  };
}

// ── Mobile Action Labels ──────────────────────────────────────────────────

const MOBILE_JOURNEY_ACTION_LABELS: Record<string, string> = {
  [JOURNEY_ACTIONS.FOCUS_SEARCH]: 'Search',
  [JOURNEY_ACTIONS.CENTER_ANCHOR]: 'Center',
  [JOURNEY_ACTIONS.ENTER_INSIDE]: 'Inside',
  [JOURNEY_ACTIONS.SHOW_TRAIL_PANEL]: 'Trail',
  [JOURNEY_ACTIONS.NEXT_STOP]: 'Follow',
  [JOURNEY_ACTIONS.OPEN_MAP]: 'Map',
  [JOURNEY_ACTIONS.OPEN_MYCELIUM]: 'Field',
  [JOURNEY_ACTIONS.COUNTY_OVERVIEW]: 'County'
};

function getMobileJourneyActionLabel(
  action: CompassAction | null | undefined,
  fallback: string = ''
): string {
  if (!action?.action) return fallback;
  return MOBILE_JOURNEY_ACTION_LABELS[action.action] || fallback || action.label || 'Go';
}

// ── Sync Actions to DOM ───────────────────────────────────────────────────

/**
 * Sync the compass action buttons to the DOM.
 * Sets text, aria, hidden, and disabled state for each button.
 */
export function syncJourneyCompassActions(
  compassState: Partial<CompassStateContext> = {}
): void {
  const suppressInsideDiveActions =
    compassState.phase === 'inside' && isSemanticDiveSurface();
  const $focus = get(focusStore);

  const buttons: Array<[HTMLButtonElement | null, CompassAction | null | undefined, string]> = [
    [document.getElementById('btn-journey-primary') as HTMLButtonElement | null, compassState.primaryAction, 'primary'],
    [document.getElementById('btn-journey-secondary') as HTMLButtonElement | null, compassState.secondaryAction, 'secondary'],
    [document.getElementById('btn-journey-tertiary') as HTMLButtonElement | null, compassState.tertiaryAction, 'tertiary']
  ];

  buttons.forEach(([button, action, role]) => {
    if (!button) return;

    const fullLabel = action?.label || (role === 'primary' ? 'Search' : role === 'secondary' ? 'Map' : 'Navigate');
    const mobileLabel = action?.action ? getMobileJourneyActionLabel(action, fullLabel) : '';

    button.textContent = fullLabel;

    if (mobileLabel) {
      button.dataset.mobileLabel = mobileLabel;
      button.dataset.fullLabel = fullLabel;
    } else {
      delete button.dataset.mobileLabel;
      delete button.dataset.fullLabel;
    }

    button.dataset.journeyAction = action?.action || '';

    const disabled =
      !action?.action ||
      (action.action === JOURNEY_ACTIONS.NEXT_STOP &&
        $focus.strandContinuityPhase === 'exploring');

    button.disabled = false;
    button.setAttribute('aria-disabled', String(disabled || suppressInsideDiveActions));
    button.hidden = suppressInsideDiveActions || !action?.action;

    if (button.hidden) {
      button.setAttribute('tabindex', '-1');
      button.setAttribute('aria-hidden', 'true');
    } else {
      button.removeAttribute('tabindex');
      button.removeAttribute('aria-hidden');
    }

    if (action?.hint) {
      button.setAttribute('aria-label', `${fullLabel} - ${action.hint}`);
      button.setAttribute('title', action.hint);
    } else {
      button.setAttribute('aria-label', fullLabel);
      button.removeAttribute('title');
    }

    if (role === 'tertiary') {
      button.setAttribute('aria-expanded', button.hidden ? 'false' : 'true');
    }
  });
}

// ── Map Trail Strip ───────────────────────────────────────────────────────

/**
 * Sync the map trail strip visibility and title.
 */
export function syncMapTrailStrip(
  compassState: Partial<CompassStateContext> = {},
  presentationState: CompassPresentationState = getJourneyCompassPresentationState(compassState)
): void {
  const strip = document.getElementById('map-trail-strip');
  if (!strip) return;

  const $nav = get(navStore);
  const shouldShow =
    $nav.currentView === 'map' &&
    presentationState.navigationOwner === 'map-trail-strip';

  strip.hidden = !shouldShow;
  strip.setAttribute('aria-hidden', String(!shouldShow));

  if (!shouldShow) return;

  const stripTitle = compassState.title || 'Map trail';
  const compactStripTitle = stripTitle.replace(/\s+pinned to map$/i, '');

  strip.replaceChildren();
  const title = document.createElement('div');
  title.className = 'map-strip-title';
  title.textContent = compactStripTitle || stripTitle;
  title.setAttribute('title', stripTitle);
  title.setAttribute('aria-label', stripTitle);
  strip.appendChild(title);
}

// ── Execute Action ────────────────────────────────────────────────────────

/**
 * Execute a journey compass action.
 * This is the central dispatch for compass button presses.
 */
export function executeJourneyCompassAction(action: string): void {
  switch (action) {
    case JOURNEY_ACTIONS.FOCUS_SEARCH: {
      const focusSearchInput = () =>
        window.requestAnimationFrame(() => {
          document.getElementById('search-input')?.focus();
        });

      const $nav = get(navStore);
      const isMapFocusSearch = $nav.currentView === 'map' && isMapSummarySurface();

      if (isMapFocusSearch) {
        // Reset exploration but keep search
        focusSearchInput();
        return;
      }

      focusSearchInput();
      return;
    }

    case JOURNEY_ACTIONS.CENTER_ANCHOR: {
      const $search = get(searchStore);
      const $nav2 = get(navStore);
      const anchorIndex = Number.isFinite($search.summary?.anchorIndex)
        ? $search.summary!.anchorIndex
        : Number.isFinite($nav2.focusedIndex)
          ? $nav2.focusedIndex
          : null;

      if (Number.isFinite(anchorIndex)) {
        journeySetTrailDepth(1);
        // The engine bridge handles camera focus; we just update stores
        navSwitchView($nav2.currentView);
      }
      return;
    }

    case JOURNEY_ACTIONS.ENTER_INSIDE:
      setSemanticDiveMode(true);
      return;

    case JOURNEY_ACTIONS.SHOW_TRAIL_PANEL:
      setSemanticDiveMode(false);
      return;

    case JOURNEY_ACTIONS.NEXT_STOP: {
      const $focus = get(focusStore);
      if ($focus.strandContinuityPhase === 'exploring') return;
      // The engine bridge handles the actual traversal
      return;
    }

    case JOURNEY_ACTIONS.OPEN_MAP:
      _switchView('map');
      return;

    case JOURNEY_ACTIONS.OPEN_MYCELIUM:
      _switchView('galaxy');
      return;

    case JOURNEY_ACTIONS.COUNTY_OVERVIEW:
      // County overview resets exploration; do not preserve search
      return;

    default:
      return;
  }
}

// ── Update Compass ────────────────────────────────────────────────────────

/**
 * Full compass DOM update: derives state, sets body attributes,
 * updates compass header elements, and syncs action buttons.
 */
export function updateJourneyCompass(): void {
  const capitalize = (s: string) => s && s.charAt(0).toUpperCase() + s.slice(1);

  const compass = document.getElementById('journey-compass');
  if (!compass) return;

  const compassState = getJourneyCompassState();
  const phase = compassState.phase || 'overview';
  const presentationState = getJourneyCompassPresentationState(compassState);

  // Sync body data attributes
  if (typeof document !== 'undefined' && document.body) {
    document.body.dataset.journeyPhase = phase;
    document.body.dataset.journeyCompassDensity = presentationState.density;
    document.body.dataset.journeyCompassCopy = presentationState.copy;
    document.body.dataset.journeyNavigationOwner = presentationState.navigationOwner;
  }

  compass.dataset.phase = phase;
  compass.dataset.density = presentationState.density;
  compass.dataset.copy = presentationState.copy;
  compass.dataset.actions = presentationState.actions;
  compass.dataset.navigationOwner = presentationState.navigationOwner;
  compass.setAttribute('aria-live', presentationState.copy === 'full' ? 'polite' : 'off');

  // Update compass text elements
  const kicker = document.getElementById('journey-compass-kicker');
  const title = document.getElementById('journey-compass-title');
  const note = document.getElementById('journey-compass-note');

  if (kicker) kicker.textContent = compassState.kicker || 'Journey';

  if (title) {
    const visibleTitle =
      compassState.title || (phase === 'focus' || phase === 'inside' ? '' : 'County overview');
    if (visibleTitle) {
      title.textContent = visibleTitle;
      title.classList.remove('sr-only');
    } else {
      const focusedPoint = getFocusedJourneyPoint();
      const focusedName = focusedPoint
        ? formatBusinessName((focusedPoint.name as string) || 'this business')
        : 'Focused business';
      title.textContent = `Focused on ${focusedName}`;
      title.classList.add('sr-only');
    }
  }

  if (note) {
    note.textContent = compassState.note || 'Search to open one semantic trail.';
    note.classList.toggle('discovery-active', !!compassState.discovery);
  }

  // Sync action buttons and map trail strip
  syncJourneyCompassActions(compassState);
  syncMapTrailStrip(compassState, presentationState);

  // Update step indicators
  const order = JOURNEY_COMPASS_PHASE_ORDER;
  const activeOrderIndex = order.indexOf(phase);
  const stepDescriptions: Record<string, string> = {
    overview: 'See the whole county.',
    search: 'Find and center on a business.',
    focus: 'Inspect a centered anchor.',
    inside: 'Explore the neighborhood.',
    map: 'View the geographic layer.'
  };

  compass.querySelectorAll<HTMLElement>('[data-journey-step]').forEach((step) => {
    const stepPhase = step.dataset.journeyStep!;
    const stepIndex = order.indexOf(stepPhase);
    const isCurrent = stepPhase === phase;

    step.classList.toggle('current', isCurrent);
    step.classList.toggle(
      'done',
      activeOrderIndex >= 0 && stepIndex >= 0 && stepIndex < activeOrderIndex
    );

    const description = stepDescriptions[stepPhase] || stepPhase;
    step.setAttribute('aria-label', `${stepIndex + 1}. ${capitalize(stepPhase)}: ${description}`);
    step.setAttribute('title', description);
  });
}

// ── View Handoff Model ────────────────────────────────────────────────────

/**
 * Build the view handoff model for a view transition.
 */
export function getViewHandoffModel(view: string): ViewHandoffModel {
  const focusPoint = getFocusedJourneyPoint();
  const focusName = focusPoint
    ? formatBusinessName((focusPoint.name as string) || 'this business')
    : '';
  const $search = get(searchStore);
  const hasSearch = !!$search.summary;
  const searchLabel = hasSearch
    ? ($search.summary!.query || 'current trail')
    : '';

  if (view === 'map') {
    if (focusName && hasSearch) {
      return {
        icon: 'map',
        kicker: 'Route layer: map',
        title: 'The semantic trail lands on terrain',
        note: `${focusName} stays anchored while "${searchLabel}" becomes physical distance.`
      };
    }
    if (focusName) {
      return {
        icon: 'map',
        kicker: 'Route layer: map',
        title: 'The focused record lands on terrain',
        note: `${focusName} keeps its semantic context while county distance becomes visible.`
      };
    }
    return {
      icon: 'map',
      kicker: 'Route layer: map',
      title: 'Geography carries the last layer',
      note: 'Semantic colors remain, but physical distance is now the thing to read.'
    };
  }

  if (focusName && hasSearch) {
    return {
      icon: 'mycelium',
      kicker: 'Route layer: mycelium',
      title: 'The trail returns to the living field',
      note: `${focusName} remains the anchor for "${searchLabel}" inside the semantic cloud.`
    };
  }
  if (focusName) {
    return {
      icon: 'mycelium',
      kicker: 'Route layer: mycelium',
      title: 'The record returns to its pocket',
      note: `${focusName} is back inside its semantic neighborhood.`
    };
  }
  return {
    icon: 'mycelium',
    kicker: 'Route layer: mycelium',
    title: 'Mycelium view restored',
    note: 'Semantic neighborhoods breathe as one living field.'
  };
}

// ── Semantic Lane Probe ───────────────────────────────────────────────────

/**
 * Install a semantic journey probe (returns presentation state for diagnostics).
 */
export function installSemanticJourneyProbe(): CompassPresentationState {
  return getJourneyCompassPresentationState();
}

/**
 * Clear the mobile route field peek state.
 */
export function invokeClearMobileRouteFieldPeek(): void {
  // The actual implementation lives in the engine bridge;
  // this is the store-side no-op kept for API compat.
}

/**
 * Schedule a map route refresh (debounced via RAF + timeouts).
 */
export function scheduleMapRouteRefresh(): void {
  const refresh = () => {
    const $nav = get(navStore);
    if ($nav.currentView !== 'map') return;
    // The actual route refresh is handled by the engine bridge
  };

  refresh();
  window.requestAnimationFrame(() => window.requestAnimationFrame(refresh));

  const delays = [120, 450, JOURNEY_CONFIG.MAP_HANDOFF_PRELUDE_MS + JOURNEY_CONFIG.MAP_TRAIL_REFRESH_LATE_DELAY_MS];
  delays.forEach((delay) => {
    window.setTimeout(refresh, delay);
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────

/** Format a business name for display. */
function formatBusinessName(name: string): string {
  if (!name) return '';
  return name
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
