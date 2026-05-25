import { test, expect } from '@playwright/test';

const BASE_URL = process.env.TEST_BASE_URL || 'http://127.0.0.1:8795';

async function waitForAppReady(page) {
  await page.goto(`${BASE_URL}/vector-explorer-polished.html?view=galaxy&nodemo=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(
    document.querySelector('#canvas-container canvas')
      && document.body.dataset.graphicsMode === 'webgl'
      && window.state?.renderer
      && window.state?.scene
      && window.state?.camera
      && window.state?.pointsMesh?.geometry?.attributes?.position?.count
      && window.state?.pointIndexByLeadId?.size
      && window.state?.semanticThreadsStatus === 'ready'
      && window.state?.semanticNeighborMapByLeadId?.get('1')?.neighbors?.length
  ), undefined, { timeout: 25000 });
  await page.waitForTimeout(1000);
}

test.describe('focus semantic Line2 shader ownership', () => {
  test('semantic focus line uses its own runtime shader uniforms', async ({ page }) => {
    test.setTimeout(45000);
    await waitForAppReady(page);

    await page.evaluate(() => {
      window.focusOnNode?.(0, { fromSearchResult: true, skipUrlSync: true });
      window.setTrailDepth?.(1, { skipUrlSync: true });
      window.setTrailFromSeed?.(0);
      window.refreshFocusSemanticOverlay?.();
    });

    await page.waitForFunction(() => {
      const line = window.state?.focusSemanticLines;
      const shader = line?.material?.userData?.shader;
      return Boolean(
        line
          && typeof line.computeLineDistances === 'function'
          && window.state?.navState?.threadSource === 'semantic'
          && shader?.uniforms?.time
          && shader?.uniforms?.semanticScore
          && shader?.uniforms?.reducedMotion
          && window.__semanticFocusCueProbe?.().visible
      );
    }, undefined, { timeout: 15000 });

    const before = await page.evaluate(() => {
      const line = window.state.focusSemanticLines;
      const shader = line.material.userData.shader;
      const probe = window.__semanticFocusCueProbe();
      return {
        threadSource: window.state.navState.threadSource,
        candidateCount: window.state.navState.threadCandidates.length,
        lineType: line.type,
        hasLineDistances: typeof line.computeLineDistances === 'function',
        segmentCount: line.userData?.segmentCount ?? 0,
        focusThreadSegments: probe.focusThreadSegments,
        nextCueSegments: probe.nextCueSegments,
        semanticScore: shader.uniforms.semanticScore.value,
        reducedMotion: shader.uniforms.reducedMotion.value,
        time: shader.uniforms.time.value,
        materialShaderIsOwnObject: shader === line.material.userData.shader,
        pointsShaderIsSeparate: shader !== window.state.pointsMaterial?.userData?.shader,
        uniformNames: Object.keys(shader.uniforms || {})
      };
    });

    expect(before.threadSource, 'focus path must be driven by semantic neighbors, not geometric fallback').toBe('semantic');
    expect(before.candidateCount, 'seed index 0 should publish semantic candidates').toBeGreaterThanOrEqual(1);
    expect(before.hasLineDistances, 'focus semantic line should be a Line2-style object').toBe(true);
    expect(before.segmentCount, 'focus semantic line should publish edge segments').toBeGreaterThan(0);
    expect(before.focusThreadSegments, 'semantic focus cue probe should report rendered line segments').toBeGreaterThan(0);
    expect(before.nextCueSegments, 'semantic focus cue probe should report next-cue segments').toBeGreaterThan(0);
    expect(before.semanticScore, 'semanticScore uniform should be a normalized positive value').toBeGreaterThan(0);
    expect(before.semanticScore, 'semanticScore uniform should stay bounded').toBeLessThanOrEqual(1);
    expect(before.materialShaderIsOwnObject, 'assertion must target focusSemanticLines.material.userData.shader').toBe(true);
    expect(before.pointsShaderIsSeparate, 'focus line shader must not be confused with pointsMaterial shader').toBe(true);
    expect(before.uniformNames, 'focus line shader should expose semantic line uniforms').toEqual(
      expect.arrayContaining(['time', 'semanticScore', 'reducedMotion'])
    );

    await page.evaluate(() => {
      const currentTime = window.state.focusSemanticLines.material.userData.shader.uniforms.time.value;
      window.updateFocusSemanticOverlayPositions?.((currentTime + 1.25) * 1000);
    });

    const after = await page.evaluate(() => {
      const shader = window.state.focusSemanticLines.material.userData.shader;
      return {
        time: shader.uniforms.time.value,
        reducedMotion: shader.uniforms.reducedMotion.value
      };
    });

    if (before.reducedMotion) {
      expect(after.time, 'reduced-motion mode should keep shader time stable').toBe(before.time);
    } else {
      expect(after.time, 'updateFocusSemanticOverlayPositions should advance focus line shader time').toBeGreaterThan(before.time);
    }
    expect(after.reducedMotion, 'reducedMotion uniform should remain numeric').toEqual(expect.any(Number));
  });
});
