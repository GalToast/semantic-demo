/**
 * w11-t6-triggers-lifecycle-ports.test.ts
 *
 * Regression detector for Ticket W11-T6 (Lifecycle Orchestration Svelte Port,
 * Wave 1: event-bus subscriptions).
 *
 * The four subscriptions below are Svelte-native mirrors of the legacy
 * `initEventBusSubscriptions()` calls in `js/modules/app.ts`. They live in
 * `src/lib/orchestration/triggers.ts` and run as side-effect imports from
 * `src/App.svelte`. This test locks in the port so a future accidental
 * removal is caught.
 *
 * Strangler-fig invariant: every event the legacy bus publishes (from
 * the engine kernel) must have a corresponding Svelte subscription
 * before the legacy `subscribeKeyed` call can be safely retired.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  publish,
  EVENTS,
  getSubscriberCount
} from '../../src/lib/orchestration/event-bus';
import { navStore } from '../../src/lib/stores/navigation.svelte';
// Side-effect import: registers the 19 subscriptions in triggers.ts
// (including the 4 W11-T6 Wave 1 + 5 Wave 2 new ones). The test then
// publishes events to verify the subscriptions fire.
import '../../src/lib/orchestration/triggers';

// ── Source file path for structural checks ────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SRC_PATH = resolve(__dirname, '../../src/lib/orchestration/triggers.ts');

function readSource(): string {
  return readFileSync(SRC_PATH, 'utf-8');
}

describe('W11-T6: lifecycle orchestration event-bus port (triggers.ts)', () => {
  describe('structural: 4 new subscriptions present in triggers.ts', () => {
    it('subscribes to EXPLORATION_FOCUS_SYNC with a FOCUS_NODE dispatch handler', () => {
      const src = readSource();
      const subscriptionPattern = /subscribe\(\s*EVENTS\.EXPLORATION_FOCUS_SYNC\s*,/;
      const handlerPattern =
        /subscribe\(\s*EVENTS\.EXPLORATION_FOCUS_SYNC\s*,[\s\S]*?dispatchNavTransition\(\s*NAV_TRANSITION_ACTIONS\.FOCUS_NODE\s*,/;
      expect(subscriptionPattern.test(src)).toBe(true);
      expect(handlerPattern.test(src)).toBe(true);
    });

    it('subscribes to SEARCH_STATE_RESET_REQUESTED with a resetExplorationFocus handler', () => {
      const src = readSource();
      const subscriptionPattern = /subscribe\(\s*EVENTS\.SEARCH_STATE_RESET_REQUESTED\s*,/;
      const handlerPattern =
        /subscribe\(\s*EVENTS\.SEARCH_STATE_RESET_REQUESTED\s*,[\s\S]*?resetExplorationFocus\(/;
      expect(subscriptionPattern.test(src)).toBe(true);
      expect(handlerPattern.test(src)).toBe(true);
    });

    it('subscribes to SUMMARY_CARD_HIDE_REQUESTED with a hideSummaryCard handler', () => {
      const src = readSource();
      const subscriptionPattern = /subscribe\(\s*EVENTS\.SUMMARY_CARD_HIDE_REQUESTED\s*,/;
      const handlerPattern =
        /subscribe\(\s*EVENTS\.SUMMARY_CARD_HIDE_REQUESTED\s*,[\s\S]*?hideSummaryCard\(/;
      expect(subscriptionPattern.test(src)).toBe(true);
      expect(handlerPattern.test(src)).toBe(true);
    });

    it('subscribes to SEMANTIC_GUIDE_BUTTON_STATE_REQUESTED (documented no-op)', () => {
      const src = readSource();
      const subscriptionPattern = /subscribe\(\s*EVENTS\.SEMANTIC_GUIDE_BUTTON_STATE_REQUESTED\s*,/;
      // The Svelte side intentionally no-ops this event (the focus store
      // owns guide state reactively), matching the legacy stub.
      const handlerPattern = /subscribe\(\s*EVENTS\.SEMANTIC_GUIDE_BUTTON_STATE_REQUESTED\s*,/;
      expect(subscriptionPattern.test(src)).toBe(true);
      expect(handlerPattern.test(src)).toBe(true);
    });
  });

  describe('structural: 5 Wave 2 subscriptions present in triggers.ts', () => {
    it('subscribes to URL_SYNC_REQUESTED with an updateUrlState handler', () => {
      const src = readSource();
      const subscriptionPattern = /subscribe\(\s*EVENTS\.URL_SYNC_REQUESTED\s*,/;
      const handlerPattern =
        /subscribe\(\s*EVENTS\.URL_SYNC_REQUESTED\s*,[\s\S]*?updateUrlState\(/;
      expect(subscriptionPattern.test(src)).toBe(true);
      expect(handlerPattern.test(src)).toBe(true);
    });

    it('subscribes to SEARCH_UI_SYNC_REQUESTED with a search result rebind handler', () => {
      const src = readSource();
      const subscriptionPattern = /subscribe\(\s*EVENTS\.SEARCH_UI_SYNC_REQUESTED\s*,/;
      const handlerPattern =
        /subscribe\(\s*EVENTS\.SEARCH_UI_SYNC_REQUESTED\s*,[\s\S]*?bindSearchResultInteractions\(/;
      expect(subscriptionPattern.test(src)).toBe(true);
      expect(handlerPattern.test(src)).toBe(true);
    });

    it('subscribes to SEARCH_STATUS_SYNC_REQUESTED with a syncSearchStatusForFocus handler', () => {
      const src = readSource();
      const subscriptionPattern = /subscribe\(\s*EVENTS\.SEARCH_STATUS_SYNC_REQUESTED\s*,/;
      const handlerPattern =
        /subscribe\(\s*EVENTS\.SEARCH_STATUS_SYNC_REQUESTED\s*,[\s\S]*?syncSearchStatusForFocus\(/;
      expect(subscriptionPattern.test(src)).toBe(true);
      expect(handlerPattern.test(src)).toBe(true);
    });

    it('subscribes to SEMANTIC_LANE_STATE_REQUESTED with a setSemanticLaneUiState handler', () => {
      const src = readSource();
      const subscriptionPattern = /subscribe\(\s*EVENTS\.SEMANTIC_LANE_STATE_REQUESTED\s*,/;
      const handlerPattern =
        /subscribe\(\s*EVENTS\.SEMANTIC_LANE_STATE_REQUESTED\s*,[\s\S]*?setSemanticLaneUiState\(/;
      expect(subscriptionPattern.test(src)).toBe(true);
      expect(handlerPattern.test(src)).toBe(true);
    });

    it('subscribes to TOOLTIP_HIDE_REQUESTED (legacy bridge TODO)', () => {
      const src = readSource();
      const subscriptionPattern = /subscribe\(\s*EVENTS\.TOOLTIP_HIDE_REQUESTED\s*,/;
      // The Svelte side has no tooltip bridge yet; the handler is a documented
      // no-op with a TODO comment, matching the estrangler-fig gap pattern.
      const handlerPattern = /subscribe\(\s*EVENTS\.TOOLTIP_HIDE_REQUESTED\s*,/;
      expect(subscriptionPattern.test(src)).toBe(true);
      expect(handlerPattern.test(src)).toBe(true);
    });
  });

  describe('runtime: subscribers are registered when triggers.ts is loaded', () => {
    // We can't re-import triggers.ts in vitest (module cache), so we verify
    // subscriber counts on the events we care about. The App.svelte side-
    // effect import in production loads the module, and the test process
    // should see the same subscriber counts because vitest's environment
    // is fresh per test file (jsdom is re-initialized).
    //
    // Note: this test file runs in isolation; if another test file in
    // tests/unit-active/ imports triggers.ts first, the subscriber count
    // may already be non-zero. We assert >=1 instead of ===1 to be robust
    // against module-cache collisions.
    it('EXPLORATION_FOCUS_SYNC has at least 1 subscriber', () => {
      const count = getSubscriberCount(EVENTS.EXPLORATION_FOCUS_SYNC);
      expect(count).toBeGreaterThanOrEqual(1);
    });

    it('SEARCH_STATE_RESET_REQUESTED has at least 1 subscriber', () => {
      const count = getSubscriberCount(EVENTS.SEARCH_STATE_RESET_REQUESTED);
      expect(count).toBeGreaterThanOrEqual(1);
    });

    it('SUMMARY_CARD_HIDE_REQUESTED has at least 1 subscriber', () => {
      const count = getSubscriberCount(EVENTS.SUMMARY_CARD_HIDE_REQUESTED);
      expect(count).toBeGreaterThanOrEqual(1);
    });

    it('SEMANTIC_GUIDE_BUTTON_STATE_REQUESTED has at least 1 subscriber', () => {
      const count = getSubscriberCount(EVENTS.SEMANTIC_GUIDE_BUTTON_STATE_REQUESTED);
      expect(count).toBeGreaterThanOrEqual(1);
    });

    it('URL_SYNC_REQUESTED has at least 1 subscriber', () => {
      const count = getSubscriberCount(EVENTS.URL_SYNC_REQUESTED);
      expect(count).toBeGreaterThanOrEqual(1);
    });

    it('SEARCH_UI_SYNC_REQUESTED has at least 1 subscriber', () => {
      const count = getSubscriberCount(EVENTS.SEARCH_UI_SYNC_REQUESTED);
      expect(count).toBeGreaterThanOrEqual(1);
    });

    it('SEARCH_STATUS_SYNC_REQUESTED has at least 1 subscriber', () => {
      const count = getSubscriberCount(EVENTS.SEARCH_STATUS_SYNC_REQUESTED);
      expect(count).toBeGreaterThanOrEqual(1);
    });

    it('SEMANTIC_LANE_STATE_REQUESTED has at least 1 subscriber', () => {
      const count = getSubscriberCount(EVENTS.SEMANTIC_LANE_STATE_REQUESTED);
      expect(count).toBeGreaterThanOrEqual(1);
    });

    it('TOOLTIP_HIDE_REQUESTED has at least 1 subscriber', () => {
      const count = getSubscriberCount(EVENTS.TOOLTIP_HIDE_REQUESTED);
      expect(count).toBeGreaterThanOrEqual(1);
    });
  });

  describe('runtime: EXPLORATION_FOCUS_SYNC updates the Svelte navStore', () => {
    it('EXPLORATION_FOCUS_SYNC writes focusedIndex to navStore', () => {
      const initialIndex = navStore().focusedIndex;
      try {
        // The event-bus payload type is `{ index: number }` but the
        // legacy publisher includes `skipHistory: true`; cast through
        // any to mirror the real-world payload without widening the
        // shared event-bus types (the legacy publisher is the source
        // of truth for the extra flag).
        publish(EVENTS.EXPLORATION_FOCUS_SYNC, { index: 4242, skipHistory: true } as any);
        const next = navStore().focusedIndex;
        expect(next).toBe(4242);
      } finally {
        // Restore the prior state so we don't leak focus across tests.
        if (initialIndex !== null) {
          publish(EVENTS.EXPLORATION_FOCUS_SYNC, {
            index: initialIndex as number,
            skipHistory: true
          } as any);
        }
        // When the initial index was null, the leftover focus 4242 will
        // be overwritten by the next test that exercises navStore. The
        // Svelte nav store doesn't have a clear event for this — the
        // test file is short-lived enough that a leftover focus index
        // on the runes store is acceptable.
      }
    });
  });
});
