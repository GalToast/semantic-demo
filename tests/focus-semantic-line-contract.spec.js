import { test, expect } from '@playwright/test';
import { inflateSync } from 'node:zlib';

const BASE_URL = process.env.TEST_BASE_URL || 'http://127.0.0.1:8795';

function parsePngRgba(buffer) {
  const signature = buffer.subarray(0, 8).toString('hex');
  if (signature !== '89504e470d0a1a0a') throw new Error('invalid PNG signature');
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idat = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString('ascii');
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length;
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
  }
  if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6)) {
    throw new Error(`unsupported PNG format: bitDepth=${bitDepth} colorType=${colorType}`);
  }

  const sourceBytesPerPixel = colorType === 6 ? 4 : 3;
  const rowBytes = width * sourceBytesPerPixel;
  const inflated = inflateSync(Buffer.concat(idat));
  const raw = Buffer.alloc(width * height * sourceBytesPerPixel);
  let input = 0;
  const paeth = (a, b, c) => {
    const p = a + b - c;
    const pa = Math.abs(p - a);
    const pb = Math.abs(p - b);
    const pc = Math.abs(p - c);
    if (pa <= pb && pa <= pc) return a;
    return pb <= pc ? b : c;
  };
  for (let y = 0; y < height; y += 1) {
    const filter = inflated[input++];
    const row = y * rowBytes;
    const prev = row - rowBytes;
    for (let x = 0; x < rowBytes; x += 1) {
      const left = x >= sourceBytesPerPixel ? raw[row + x - sourceBytesPerPixel] : 0;
      const up = y > 0 ? raw[prev + x] : 0;
      const upLeft = y > 0 && x >= sourceBytesPerPixel ? raw[prev + x - sourceBytesPerPixel] : 0;
      const value = inflated[input + x];
      raw[row + x] = (filter === 0 ? value
        : filter === 1 ? value + left
          : filter === 2 ? value + up
            : filter === 3 ? value + Math.floor((left + up) / 2)
              : value + paeth(left, up, upLeft)) & 255;
    }
    input += rowBytes;
  }
  return { width, height, raw, sourceBytesPerPixel };
}

function compareSceneBand(beforeBuffer, afterBuffer) {
  const before = parsePngRgba(beforeBuffer);
  const after = parsePngRgba(afterBuffer);
  if (before.width !== after.width || before.height !== after.height) {
    throw new Error('screenshot dimensions differ');
  }
  const x0 = Math.floor(before.width * 0.06);
  const x1 = Math.ceil(before.width * 0.94);
  const y0 = Math.floor(before.height * 0.16);
  const y1 = Math.ceil(before.height * 0.64);
  let changedPixels = 0;
  let strongPixels = 0;
  let totalDelta = 0;
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const beforeIndex = (y * before.width + x) * before.sourceBytesPerPixel;
      const afterIndex = (y * after.width + x) * after.sourceBytesPerPixel;
      const delta = Math.abs(before.raw[beforeIndex] - after.raw[afterIndex])
        + Math.abs(before.raw[beforeIndex + 1] - after.raw[afterIndex + 1])
        + Math.abs(before.raw[beforeIndex + 2] - after.raw[afterIndex + 2]);
      if (delta > 18) changedPixels += 1;
      if (delta > 54) strongPixels += 1;
      totalDelta += delta;
    }
  }
  const samples = Math.max(1, (x1 - x0) * (y1 - y0));
  return {
    changedPixels,
    strongPixels,
    meanDelta: Number((totalDelta / samples).toFixed(3)),
    samples
  };
}

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
    const shaderErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error' && /WebGLProgram: Shader Error|VALIDATE_STATUS false|shader is not compiled/i.test(msg.text())) {
        shaderErrors.push(msg.text());
      }
    });
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
        overlayNodeCount: line.userData?.overlayNodeCount ?? 0,
        nextIndex: probe.nextIndex,
        nextCueSegments: probe.nextCueSegments,
        denseBundleMode: line.userData?.denseBundleMode,
        denseBundleUniform: shader.uniforms.denseBundleMode?.value,
        hasMyceliumGroup: Boolean(window.state.myceliumGroup),
        parentKind: line.userData?.parentKind,
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
    expect(before.denseBundleUniform, 'denseBundleMode uniform should match focus line density state').toBe(before.overlayNodeCount >= 6 ? 1 : 0);
    expect(Boolean(before.denseBundleMode), 'focus line should record dense bundle state from overlay count').toBe(before.overlayNodeCount >= 6);
    if (Number.isFinite(before.nextIndex)) {
      expect(before.nextCueSegments, 'semantic focus cue probe should report next-cue segments when a next stop is available').toBeGreaterThan(0);
    } else {
      expect(before.nextCueSegments, 'semantic focus cue probe should not fabricate next-cue segments without an available next stop').toBe(0);
    }
    expect(before.parentKind, 'focus line should record the active parent owner').toBe(before.hasMyceliumGroup ? 'mycelium' : 'scene');
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

    const visibleScreenshot = await page.screenshot({ fullPage: false });
    await page.evaluate(async () => {
      window.state.focusSemanticLines.visible = false;
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });
    const hiddenScreenshot = await page.screenshot({ fullPage: false });
    const visualDelta = compareSceneBand(visibleScreenshot, hiddenScreenshot);

    expect(visualDelta.changedPixels, 'hiding focusSemanticLines should materially change rendered scene pixels').toBeGreaterThan(160);
    expect(visualDelta.strongPixels, 'focusSemanticLines should contribute strong visible pixels, not only invisible state').toBeGreaterThan(24);
    expect(visualDelta.meanDelta, 'focusSemanticLines should have measurable visual contrast in the scene band').toBeGreaterThan(0.08);

    const fallbackParent = await page.evaluate(() => {
      const originalGroup = window.state.myceliumGroup;
      const scene = window.state.scene;
      let result = null;
      try {
        window.state.myceliumGroup = null;
        window.refreshFocusSemanticOverlay?.();
        const line = window.state.focusSemanticLines;
        const builtInScene = Boolean(line && line.parent === scene && scene?.children?.includes(line));
        const parentKind = line?.userData?.parentKind || null;
        window.state.myceliumGroup = originalGroup;
        window.refreshFocusSemanticOverlay?.();
        const restoredLine = window.state.focusSemanticLines;
        result = {
          builtInScene,
          parentKind,
          removedFromScene: Boolean(line && !scene?.children?.includes(line)),
          restoredParentKind: restoredLine?.userData?.parentKind || null,
          expectedRestoredParentKind: originalGroup ? 'mycelium' : 'scene'
        };
      } finally {
        window.state.myceliumGroup = originalGroup;
        window.refreshFocusSemanticOverlay?.();
      }
      return result;
    });

    expect(fallbackParent.builtInScene, 'focus line should fall back to scene ownership while mycelium group is not ready').toBe(true);
    expect(fallbackParent.parentKind, 'fallback focus line should record scene parent ownership').toBe('scene');
    expect(fallbackParent.removedFromScene, 'refreshFocusSemanticOverlay should remove fallback-owned scene lines before rebuilding').toBe(true);
    expect(fallbackParent.restoredParentKind, 'focus line should use the available owner after rebuild').toBe(fallbackParent.expectedRestoredParentKind);
    expect(shaderErrors, 'focus semantic line shader should compile without WebGLProgram errors').toEqual([]);
  });
});
