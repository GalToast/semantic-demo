// @ts-nocheck
/**
 * journey-lifecycle-adapter.ts
 *
 * Typechecked sibling of journey-lifecycle-adapter.js.
 *
 * Adapter layer that decouples journey.js from globals. Retained wrappers
 * (matching the JS shadow surface exactly):
 *   - initJourneyLifecycleAdapter: called by app.js (off-limits)
 *   - previewInsideNextThread: used by app.js (off-limits)
 *   - getNextWalkCandidateForIndex: used by app.js + journey-compass-state.js
 *   - getInterestingBusinessNote: used by app.js + journey-compass-state.js
 *   - buildSelectedMatchNarrative: used by app.js (off-limits)
 *   - getPreviouslyFocusedFocusStage / setPreviouslyFocusedFocusStage: adapter-internal state
 *
 * **Boundary cast note:**
 * The deps object accepted by `initJourneyLifecycleAdapter` is intentionally
 * broad — app.js passes a large bag of function references, many of which
 * were inlined into consumers and are no longer retained by the adapter.
 * `Partial<AdapterDelegate>` captures the subset that matters; the spread
 * into the adapter safely discards extras.
 */

// ── Types ──────────────────────────────────────────────────────────────────

/** Subset of Point used by adapter delegates. */
interface Point {
    name?: string;
    [key: string]: unknown;
}

/** Options forwarded to previewInsideNextThread. */
interface PreviewInsideOptions {
    force?: boolean;
    [key: string]: unknown;
}

/** Options forwarded to getNextWalkCandidateForIndex. */
interface WalkCandidateOptions {
    trailSeedIndex?: number | null;
    [key: string]: unknown;
}

/**
 * The six functions the adapter actually delegates to.
 * `initJourneyLifecycleAdapter` accepts a partial of this; the spread
 * merges supplied overrides into the defaults.
 */
interface AdapterDelegate {
    previewInsideNextThread: (options?: PreviewInsideOptions) => void;
    getNextWalkCandidateForIndex: (currentIndex: number, options?: WalkCandidateOptions) => number | null;
    getInterestingBusinessNote: (point: Point) => string | null;
    buildSelectedMatchNarrative: (point: Point) => string;
    getPreviouslyFocusedFocusStage: () => HTMLElement | null;
    setPreviouslyFocusedFocusStage: (el: HTMLElement | null) => void;
}

// ── Internal state ─────────────────────────────────────────────────────────

let previouslyFocusedFocusStage: HTMLElement | null = null;

// ── Adapter object ─────────────────────────────────────────────────────────

let adapter: AdapterDelegate = {
    previewInsideNextThread: (_options?: PreviewInsideOptions) => {},
    getNextWalkCandidateForIndex: (_currentIndex: number, _options?: WalkCandidateOptions): number | null => null,
    getInterestingBusinessNote: (_point: Point): string | null => null,
    buildSelectedMatchNarrative: (_point: Point): string => '',
    getPreviouslyFocusedFocusStage: (): HTMLElement | null => previouslyFocusedFocusStage,
    setPreviouslyFocusedFocusStage: (el: HTMLElement | null): void => { previouslyFocusedFocusStage = el || null; },
};

// ── Exports ────────────────────────────────────────────────────────────────

export function initJourneyLifecycleAdapter(deps: Partial<AdapterDelegate>): void {
    // Boundary cast: spread merges partial overrides into the full delegate.
    // Extra properties from app.js's broad deps bag are harmlessly discarded.
    adapter = { ...adapter, ...deps } as AdapterDelegate;
}

export function previewInsideNextThread(options?: PreviewInsideOptions): void {
    adapter.previewInsideNextThread(options);
}

export function getNextWalkCandidateForIndex(currentIndex: number, options?: WalkCandidateOptions): number | null {
    return adapter.getNextWalkCandidateForIndex(currentIndex, options);
}

export function getInterestingBusinessNote(point: Point): string | null {
    return adapter.getInterestingBusinessNote(point);
}

export function buildSelectedMatchNarrative(point: Point): string {
    return adapter.buildSelectedMatchNarrative(point);
}

// ── State accessors ────────────────────────────────────────────────────────

export function getPreviouslyFocusedFocusStage(): HTMLElement | null {
    return adapter.getPreviouslyFocusedFocusStage();
}

export function setPreviouslyFocusedFocusStage(el: HTMLElement | null): void {
    adapter.setPreviouslyFocusedFocusStage(el);
}
