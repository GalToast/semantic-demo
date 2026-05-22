/**
 * tests/helpers/mock-semantic-search.js
 *
 * Shared Playwright mock for the semantic search API layer.
 * Uses URLSearchParams-based predicate routing so query string order
 * does not affect route matching.
 *
 * Exported API:
 *   setupMockSearch(page, overrides?)  — mock health + search endpoints
 *   SEMANTIC_HEALTH_STUB               — canonical health response
 *   SEARCH_STUB                        — canonical search response
 *
 * Usage:
 *   import { setupMockSearch } from './helpers/mock-semantic-search.js';
 *   await setupMockSearch(page);
 *
 * To override response shapes per-test:
 *   await setupMockSearch(page, {
 *     healthStub: { ok: true, state: 'healthy' },
 *     searchStub: { ok: true, count: 1, results: [...] }
 *   });
 */

export const SEMANTIC_HEALTH_STUB = {
  ok: true,
  state: 'healthy',
  provenance: { label: 'Search ready', detail: 'Semantic search is ready.' }
};

export const SEARCH_STUB = {
  ok: true,
  count: 3,
  results: [
    { lead_id: 1, score: 0.99, semantic_score: 0.99, public_note: 'Coffee shop on Main St.' },
    { lead_id: 2, score: 0.91, semantic_score: 0.91, public_note: 'Cafe near the park.' },
    { lead_id: 20, score: 0.86, semantic_score: 0.86, public_note: 'Espresso bar downtown.' }
  ]
};

/**
 * Set up mocks for the semantic lane health and search API endpoints.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{ healthStub?: object, searchStub?: object }} [overrides]
 */
export async function setupMockSearch(page, { healthStub = SEMANTIC_HEALTH_STUB, searchStub = SEARCH_STUB } = {}) {
  await page.route(url => {
    try {
      return new URL(url).searchParams.get('action') === 'semantic_lane_health';
    } catch {
      return false;
    }
  }, async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(healthStub)
    });
  });

  await page.route(url => {
    try {
      return new URL(url).searchParams.get('action') === 'semantic_search';
    } catch {
      return false;
    }
  }, async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(searchStub)
    });
  });
}