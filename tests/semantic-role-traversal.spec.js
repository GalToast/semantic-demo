/**
 * semantic-role-traversal.spec.js
 *
 * Interaction proof for Focus Constellation role traversal:
 * the user can follow visible role-labeled rail connections and the next
 * neighborhood preserves semantic role context instead of falling back to
 * generic geometric traversal.
 *
 * Requires the static dev server on port 8795:
 *   npm run serve
 *   npx playwright test tests/semantic-role-traversal.spec.js --browser=chromium --workers=1 --headed
 */

import { test, expect } from '@playwright/test';
import { openApp } from './helpers/3d-interaction-helpers.js';

const ROLE_CASES = [
  { role: 'upstream', label: 'Support', reasonPattern: /support provider/i },
  { role: 'downstream', label: 'Market', reasonPattern: /served market/i },
  { role: 'bridge', label: 'Bridge', reasonPattern: /cross-market bridge/i },
];

const MOBILE_VISIBLE_RAIL_LIMIT = 4;

const VALID_ROLES = new Set([
  'core_peer',
  'upstream',
  'downstream',
  'complement',
  'same_market',
  'geo_echo',
  'bridge',
]);

async function waitForSemanticThreads(page) {
  await page.waitForFunction(() => {
    const state = window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {};
    return state.semanticNeighborMapByLeadId instanceof Map &&
      state.semanticNeighborMapByLeadId.size > 0 &&
      state.pointIndexByLeadId instanceof Map &&
      state.pointIndexByLeadId.size > 0;
  }, { timeout: 20000 });
}

async function findSeedCandidatesForRole(page, relationshipRole) {
  return page.evaluate(({ role, visibleRailLimit }) => {
    const state = window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {};
    const leadToIndex = state.pointIndexByLeadId;
    const neighborMap = state.semanticNeighborMapByLeadId;
    const points = state.points || [];
    const paths = [];
    const lookupIndex = (leadId) => (
      leadToIndex.get(String(leadId)) ??
      leadToIndex.get(Number(leadId)) ??
      leadToIndex.get(leadId)
    );

    for (let seedIndex = 0; seedIndex < points.length; seedIndex += 1) {
      const point = points[seedIndex];
      const leadId = String(point?.lead_id ?? point?.leadId ?? '');
      if (!leadId) continue;
      const node = neighborMap.get(leadId) || neighborMap.get(Number(leadId));
      const neighbors = (node?.neighbors || []).slice(0, visibleRailLimit);
      const match = neighbors.find((candidate) => {
        const targetIndex = lookupIndex(candidate.leadId);
        return candidate.relationshipRole === role &&
          Number.isFinite(targetIndex) &&
          targetIndex !== seedIndex;
      });
      if (!match) continue;
      const targetIndex = lookupIndex(match.leadId);
      paths.push({
        seedIndex,
        seedLeadId: leadId,
        seedName: point?.name || '',
        targetIndex,
        targetLeadId: String(match.leadId),
        role: match.relationshipRole,
        axis: match.relationshipAxis || '',
        reason: match.roleReason || match.reason || '',
      });
      if (paths.length >= 80) break;
    }
    return paths;
  }, { role: relationshipRole, visibleRailLimit: MOBILE_VISIBLE_RAIL_LIMIT });
}

async function findAndEnterVisibleRolePath(page, relationshipRole) {
  const seedCandidates = await findSeedCandidatesForRole(page, relationshipRole);
  expect(seedCandidates.length, `expected candidate seeds for ${relationshipRole}`).toBeGreaterThan(0);

  const path = await page.evaluate(({ seeds, role, visibleRailLimit }) => {
    const state = window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {};
    const focusOnNode = window.__APP_ACTIONS__?.focusOnNode;
    const setTrailDepth = window.__APP_ACTIONS__?.setTrailDepth;
    const refreshCompositionState = window.__APP_ACTIONS__?.refreshCompositionState;
    if (typeof focusOnNode !== 'function') return null;

    for (const seed of seeds.slice(0, 80)) {
      focusOnNode(seed.seedIndex, { fromSearchResult: true, skipUrlSync: true });
      setTrailDepth?.(1, { skipUrlSync: true });
      refreshCompositionState?.();

      const visibleCandidates = (state.navState?.threadCandidates || [])
        .filter((candidate) => candidate && candidate.index !== state.navState?.focusedIndex)
        .slice(0, visibleRailLimit);
      const match = visibleCandidates.find((candidate) =>
        candidate.relationshipRole === role &&
        Number.isFinite(candidate.index)
      );
      if (!match) continue;

      return {
        ...seed,
        targetIndex: match.index,
        targetLeadId: String(match.leadId || seed.targetLeadId || ''),
        role: match.relationshipRole,
        axis: match.relationshipAxis || seed.axis || '',
        reason: match.roleReason || match.reason || seed.reason || '',
      };
    }

    return null;
  }, {
    seeds: seedCandidates,
    role: relationshipRole,
    visibleRailLimit: MOBILE_VISIBLE_RAIL_LIMIT,
  });

  if (!path) return null;

  await page.waitForFunction(({ seedIndex, targetIndex, role }) => {
    const state = window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {};
    return state.navState?.focusedIndex === seedIndex &&
      state.navState?.threadSource === 'semantic' &&
      document.querySelector(`.focus-stage-neighbor-pill[data-index="${targetIndex}"][data-relationship-role="${role}"]`);
  }, path, { timeout: 5000 });

  return path;
}

async function snapshotRoleTraversalState(page, role, targetIndex) {
  return page.evaluate(({ role: expectedRole, targetIndex: expectedTarget }) => {
    const state = window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {};
    const focusedIndex = state.navState?.focusedIndex ?? null;
    const focusedPoint = Number.isFinite(focusedIndex) ? state.points?.[focusedIndex] : null;
    const threadCandidates = state.navState?.threadCandidates || [];
    const roleCounts = {};
    for (const candidate of threadCandidates) {
      if (!candidate?.relationshipRole) continue;
      roleCounts[candidate.relationshipRole] = (roleCounts[candidate.relationshipRole] || 0) + 1;
    }
    const railPills = [...document.querySelectorAll('.focus-stage-neighbor-pill[data-relationship-role]')].map((pill) => ({
      index: Number(pill.dataset.index),
      relationshipRole: pill.dataset.relationshipRole || '',
      label: pill.querySelector('.focus-stage-neighbor-role')?.textContent?.trim() || '',
      inspected: pill.classList.contains('is-inspected'),
      pinned: pill.classList.contains('is-pinned'),
      exploring: pill.classList.contains('is-exploring'),
    }));
    const targetRail = railPills.find((pill) => pill.index === expectedTarget && pill.relationshipRole === expectedRole) || null;
    const inspector = document.querySelector('#focus-thread-inspector');
    return {
      focusedIndex,
      focusedName: focusedPoint?.name || '',
      navMode: state.navState?.mode || '',
      panelSurface: document.body.dataset.panelSurface || '',
      strandPhase: state.strandContinuityState?.phase || '',
      strandTarget: state.strandContinuityState?.targetIndex ?? null,
      strandFrom: state.strandContinuityState?.fromIndex ?? null,
      walkHistory: [...(state.navState?.walkHistoryIndices || [])],
      lastTraversalReason: state.navState?.lastTraversalReason || '',
      threadSource: state.navState?.threadSource || '',
      candidateCount: threadCandidates.length,
      roleCounts,
      activeRoleCount: Object.keys(roleCounts).length,
      railPills,
      targetRail,
      inspectorActive: inspector?.classList.contains('active') || false,
      inspectorRole: inspector?.dataset.relationshipRole || '',
      inspectorText: inspector?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 240) || '',
    };
  }, { role, targetIndex });
}

test.describe('semantic role traversal', () => {
  for (const roleCase of ROLE_CASES) {
    test(`following a visible ${roleCase.label} role preserves role context`, async ({ page }) => {
      test.setTimeout(90000);
      await openApp(page, { width: 390, height: 844 });
      await waitForSemanticThreads(page);

      const path = await findAndEnterVisibleRolePath(page, roleCase.role);
      expect(path, `expected a visible ${roleCase.role} path in the semantic thread payload`).not.toBeNull();

      const before = await snapshotRoleTraversalState(page, roleCase.role, path.targetIndex);
      expect(before.targetRail, `${roleCase.role} rail pill should be visible before traversal`).not.toBeNull();
      expect(before.targetRail.label, `${roleCase.role} rail pill should display human role label`).toContain(roleCase.label);

      const targetPill = page.locator(`.focus-stage-neighbor-pill[data-index="${path.targetIndex}"][data-relationship-role="${roleCase.role}"]`).first();
      await expect(targetPill, `${roleCase.role} role pill should be clickable`).toBeVisible({ timeout: 5000 });
      await targetPill.scrollIntoViewIfNeeded();
      await targetPill.click({ position: { x: 24, y: 24 } });

      await page.waitForFunction((targetIndex) => {
        const state = window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {};
        return state.navState?.focusedIndex === targetIndex &&
          state.focusedNode === targetIndex &&
          (state.navState?.threadCandidates || []).length > 0;
      }, path.targetIndex, { timeout: 15000 });

      const after = await snapshotRoleTraversalState(page, roleCase.role, path.targetIndex);
      expect(after.focusedIndex, 'focused index should become clicked role target').toBe(path.targetIndex);
      expect(after.navMode, 'walking a role connection should enter trail mode').toBe('trail');
      expect(after.walkHistory, 'walk history should keep seed and target').toEqual(expect.arrayContaining([path.seedIndex, path.targetIndex]));
      expect(after.lastTraversalReason, 'traversal reason should retain human role context').toMatch(roleCase.reasonPattern);
      expect(after.candidateCount, 'next neighborhood should expose fresh candidates').toBeGreaterThan(0);
      expect(after.threadSource, 'next neighborhood should stay semantic-backed').toBe('semantic');
      expect(after.activeRoleCount, 'next neighborhood should retain role diversity').toBeGreaterThanOrEqual(2);
      expect(Object.keys(after.roleCounts).every((nextRole) => VALID_ROLES.has(nextRole)), 'next roles should stay inside taxonomy').toBe(true);
    });
  }
});
