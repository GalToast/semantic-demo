/**
 * Targeted checks for specific issues found in initial audit:
 * 1. FPS bottleneck analysis
 * 2. Thread lines empty
 * 3. Search returns null
 * 4. Spore texture/shader check  
 * 5. Camera framing
 * 6. Legacy comparison details
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const SVELTE_URL = 'http://localhost:5173/';
const LEGACY_URL = 'http://127.0.0.1:8795/index.html';
const SCREENSHOT_DIR = path.resolve(process.cwd(), 'reports', 'screenshots', 'svelte-targeted');
const REPORT_FILE = path.resolve(process.cwd(), 'reports', 'svelte-targeted-report.md');

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  console.log('=== TARGETED SVELTE 3D CHECKS ===\n');
  await fs.mkdir(SCREENSHOT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: false, args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  const allLogs = [];
  page.on('console', msg => allLogs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', err => allLogs.push(`[PAGE_ERROR] ${err.message}`));

  const results = {};

  try {
    await page.goto(SVELTE_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await sleep(5000);

    // === CHECK 1: FPS Bottleneck ===
    console.log('--- Check 1: FPS & Frame Timing ---');
    const fpsDetails = await page.evaluate(async () => {
      const frameTimings = [];
      let frames = 0;
      const start = performance.now();
      
      return new Promise(resolve => {
        function measure(ts) {
          frames++;
          const elapsed = ts - start;
          if (elapsed >= 3000) {
            resolve({
              avgFps: Math.round(frames / 3 * 10) / 10,
              frameCount: frames,
              duration: Math.round(elapsed),
            });
            return;
          }
          requestAnimationFrame(measure);
        }
        requestAnimationFrame(measure);
      });
    });
    results.fps = fpsDetails;
    console.log(`FPS: ${fpsDetails.avgFps}, Frames: ${fpsDetails.frameCount}, Duration: ${fpsDetails.duration}ms`);

    // Check for render loop / animation IDs
    const renderLoop = await page.evaluate(() => {
      const state = window.__semanticState || window.__TEST_STATE__ || {};
      const renderer = state.renderer;
      
      // Check WebGL calls optimization
      const canvas = document.querySelector('canvas');
      if (!canvas) return { error: 'no canvas' };
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      if (!gl) return { error: 'no gl' };
      
      return {
        rendererExists: !!renderer,
        animationLoop: !!renderer?.setAnimationLoop,
        domElement: !!renderer?.domElement,
        info: renderer?.info ? {
          triangles: renderer.info.render?.triangles,
          calls: renderer.info.render?.calls,
          points: renderer.info.render?.points,
          lines: renderer.info.render?.lines,
          geometries: renderer.info.memory?.geometries,
          textures: renderer.info.memory?.textures,
        } : null,
        glCalls: {
          enabled: gl.isEnabled(gl.DEPTH_TEST),
          depthFunc: gl.getParameter(gl.DEPTH_FUNC),
          blendEnabled: gl.isEnabled(gl.BLEND),
          cullFace: gl.isEnabled(gl.CULL_FACE),
        },
      };
    });
    results.renderLoop = renderLoop;
    console.log(`Render loop: ${JSON.stringify(renderLoop)}`);

    // === CHECK 2: Thread lines investigation ===
    console.log('\n--- Check 2: Thread Lines ---');
    const threadCheck = await page.evaluate(() => {
      const state = window.__semanticState || window.__TEST_STATE__ || {};
      
      // Check multiple possible thread data locations
      const candidates = {
        threads: state.threads,
        semanticThreads: state.semanticThreads,
        threadData: state.threadData,
        threadLines: state.threadLines,
        threadManager: state.threadManager,
        threeThreadManager: state.threeThreadManager,
      };
      
      const found = {};
      for (const [key, val] of Object.entries(candidates)) {
        if (val) {
          found[key] = {
            type: typeof val,
            isArray: Array.isArray(val),
            length: Array.isArray(val) ? val.length : (typeof val === 'object' ? Object.keys(val).length : 'scalar'),
            sample: Array.isArray(val) ? val.slice(0, 3) : 
                    typeof val === 'object' ? Object.keys(val).slice(0, 5) : val,
          };
        }
      }
      
      // Also check scene for line geometry
      const scene = state.scene;
      let lineObjects = [];
      if (scene) {
        scene.traverse(obj => {
          if (obj.isLine || obj.isLineSegments || obj.isLineLoop || 
              obj.type === 'Line' || obj.type === 'LineSegments' || obj.type === 'LineLoop') {
            lineObjects.push({
              name: obj.name,
              type: obj.type,
              visible: obj.visible,
              geometryPoints: obj.geometry?.attributes?.position?.count,
              material: obj.material?.type,
            });
          }
        });
      }
      
      return { found, lineObjects };
    });
    results.threadCheck = threadCheck;
    console.log(`Thread candidates: ${JSON.stringify(threadCheck.found)}`);
    console.log(`Line objects in scene: ${JSON.stringify(threadCheck.lineObjects)}`);

    // === CHECK 3: Search result investigation ===
    console.log('\n--- Check 3: Search Results ---');
    
    // Check the app's search/hydration state
    const searchSetup = await page.evaluate(() => {
      const state = window.__semanticState || window.__TEST_STATE__ || {};
      return {
        hasSearchModule: typeof state.search !== 'undefined',
        searchState: state.search ? {
          query: state.search.query,
          active: state.search.active,
          results: state.search.results?.length,
        } : null,
        searchQuery: state.searchQuery,
        searchResults: state.searchResults,
        filters: state.filters,
        hasSearchEngine: typeof state.searchEngine !== 'undefined',
        dataStoreLoaded: state.businesses?.length || state.records?.length,
      };
    });
    results.searchSetup = searchSetup;
    console.log(`Search setup: ${JSON.stringify(searchSetup)}`);

    // Now try searching via DOM + pressing Enter
    const searchInput = page.locator('input[type="search"], input:not([type])[role="searchbox"], [role="searchbox"] input, input[placeholder*="search" i]');
    const count = await searchInput.count();
    console.log(`Search inputs: ${count}`);
    
    if (count > 0) {
      await searchInput.first().click();
      await sleep(300);
      await searchInput.first().fill('coffee');
      await sleep(300);
      // Press Enter to trigger search
      await page.keyboard.press('Enter');
      await sleep(2000);
      
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'search-after-enter.png') });
      
      const postSearch = await page.evaluate(() => {
        const state = window.__semanticState || window.__TEST_STATE__ || {};
        return {
          searchQuery: state.searchQuery || state.search?.query,
          searchResults: state.searchResults || state.search?.results,
          searchResultCount: state.searchResults?.length || state.search?.results?.length || 0,
          searchActive: state.search?.active,
          searchEngineResults: typeof state.searchEngine?.search === 'function' ? 'function exists' : 'no function',
        };
      });
      results.postSearch = postSearch;
      console.log(`After Enter - search state: ${JSON.stringify(postSearch)}`);
      
      // Also check legacy search behavior for comparison
      const legacySearch = await page.evaluate(() => {
        // Check if search happens via URL params or other mechanism
        const url = window.location.href;
        const input = document.querySelector('input[type="search"], input[placeholder*="search" i], [role="searchbox"] input');
        const resultsContainer = document.querySelector('[data-search-results], .search-results, #search-results');
        return { url, inputExists: !!input, resultsContainerExists: !!resultsContainer };
      });
      results.legacySearch = legacySearch;
      console.log(`Legacy search: ${JSON.stringify(legacySearch)}`);
    }

    // === CHECK 4: Spore texture/shader ===
    console.log('\n--- Check 4: Spore Visual Detail ---');
    const sporeDetail = await page.evaluate(() => {
      const state = window.__semanticState || window.__TEST_STATE__ || {};
      const scene = state.scene;
      let meshInfo = {};
      if (scene) {
        scene.traverse(obj => {
          if (obj.isInstancedMesh || obj.type === 'InstancedMesh') {
            const mat = obj.material;
            meshInfo[obj.name || 'unnamed-instanced'] = {
              count: obj.count,
              geometry: {
                type: obj.geometry?.type,
                radius: obj.geometry?.parameters?.radius,
                widthSegments: obj.geometry?.parameters?.widthSegments,
                heightSegments: obj.geometry?.parameters?.heightSegments,
              },
              material: {
                type: mat?.type,
                color: mat?.color?.getHex?.(),
                emissive: mat?.emissive?.getHex?.(),
                opacity: mat?.opacity,
                transparent: mat?.transparent,
                shininess: mat?.shininess,
                wireframe: mat?.wireframe,
                hasMap: !!mat?.map,
                mapName: mat?.map?.name,
                blending: mat?.blending,
              },
            };
          }
          if (obj.isPoints || obj.type === 'Points') {
            const mat = obj.material;
            meshInfo[obj.name || 'points-field'] = {
              geometry: {
                type: obj.geometry?.type,
                count: obj.geometry?.attributes?.position?.count,
                hasColors: !!obj.geometry?.attributes?.color,
                colorCount: obj.geometry?.attributes?.color?.count,
              },
              material: {
                type: mat?.type,
                size: mat?.size,
                sizeAttenuation: mat?.sizeAttenuation,
                opacity: mat?.opacity,
                transparent: mat?.transparent,
                blending: mat?.blending,
                vertexColors: mat?.vertexColors,
                hasMap: !!mat?.map,
              },
            };
          }
        });
      }
      return meshInfo;
    });
    results.sporeDetail = sporeDetail;
    console.log(`Spore detail: ${JSON.stringify(sporeDetail)}`);

    // === CHECK 5: Camera framing check ===
    console.log('\n--- Check 5: Camera Framing ---');
    const cameraFrame = await page.evaluate(() => {
      const state = window.__semanticState || window.__TEST_STATE__ || {};
      const cam = state.camera;
      if (!cam) return { error: 'no camera' };
      
      return {
        position: [cam.position.x, cam.position.y, cam.position.z],
        target: cam.target ? [cam.target.x, cam.target.y, cam.target.z] : null,
        fov: cam.fov,
        aspect: cam.aspect,
        near: cam.near,
        far: cam.far,
        zoom: cam.zoom,
        up: [cam.up?.x, cam.up?.y, cam.up?.z],
        type: cam.type,
        // projection matrix determinant (positive = right-handed)
        matrix: cam.projectionMatrix?.elements?.slice(0, 4),
      };
    });
    results.cameraFrame = cameraFrame;
    console.log(`Camera framing: ${JSON.stringify(cameraFrame)}`);

    // === CHECK 6: Reduced motion check ===
    console.log('\n--- Check 6: Reduced Motion ---');
    const reducedMotionCheck = await page.evaluate(() => {
      return {
        prefersReducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
        bodyAttrReducedMotion: document.body.dataset.reducedMotion,
        bodyAttrCompact: document.body.dataset.compact,
      };
    });
    results.reducedMotionCheck = reducedMotionCheck;
    console.log(`Reduced motion: ${JSON.stringify(reducedMotionCheck)}`);

    // Test with reduced motion
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await sleep(1000);
    const reducedMotionActive = await page.evaluate(() => {
      return {
        prefersReducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
        bodyAttrReducedMotion: document.body.dataset.reducedMotion,
        bodyAttrCompact: document.body.dataset.compact,
        animationActive: document.body.dataset.animationActive,
      };
    });
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'reduced-motion-active.png') });
    results.reducedMotionActive = reducedMotionActive;
    console.log(`Reduced motion active: ${JSON.stringify(reducedMotionActive)}`);
    await page.emulateMedia({ reducedMotion: 'no-preference' });

    // === CHECK 7: Interactive elements ===
    console.log('\n--- Check 7: Interactive Elements ---');
    const uiElements = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button, [role="button"]')).map(b => ({
        text: b.textContent?.trim().substring(0, 40),
        className: b.className?.substring(0, 40),
        visible: b.offsetParent !== null,
        tagName: b.tagName,
      }));
      
      const radios = Array.from(document.querySelectorAll('[role="radio"]')).map(r => ({
        label: r.textContent?.trim().substring(0, 40),
        checked: r.getAttribute('aria-checked') === 'true',
        visible: r.offsetParent !== null,
      }));
      
      const canvas = document.querySelector('canvas');
      
      return {
        buttons: buttons.length,
        buttonList: buttons,
        radios: radios.length,
        radioList: radios,
        canvasHover: canvas ? canvas.style.cursor : null,
        interactiveElements: {
          searchInput: !!document.querySelector('input[type="search"], [role="searchbox"]'),
          canvas: !!canvas,
        },
      };
    });
    results.uiElements = uiElements;
    console.log(`UI elements: ${uiElements.buttons} buttons, ${uiElements.radios} radios`);
    console.log(`Buttons: ${JSON.stringify(uiElements.buttonList)}`);
    console.log(`Radios: ${JSON.stringify(uiElements.radioList)}`);

    // === CHECK 8: Legacy server detailed comparison ===
    console.log('\n--- Check 8: Legacy Detailed Comparison ---');
    try {
      await page.goto(LEGACY_URL, { waitUntil: 'networkidle', timeout: 15000 });
      await sleep(5000);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'legacy-detailed.png') });

      const legacyDetails = await page.evaluate(() => {
        const state = window.__semanticState || window.__TEST_STATE__ || {};
        const scene = state.scene;
        const renderer = state.renderer;
        const cam = state.camera;
        
        // Scene objects
        let sceneObjs = {};
        if (scene) {
          scene.traverse(obj => {
            const key = obj.name || obj.type || 'unnamed';
            sceneObjs[key] = {
              type: obj.type,
              visible: obj.visible,
            };
          });
        }
        
        // Renderer info
        let renderInfo = null;
        if (renderer?.info) {
          renderInfo = {
            triangles: renderer.info.render?.triangles,
            calls: renderer.info.render?.calls,
            points: renderer.info.render?.points,
            lines: renderer.info.render?.lines,
            geometries: renderer.info.memory?.geometries,
            textures: renderer.info.memory?.textures,
          };
        }
        
        return {
          cameraPos: cam ? [cam.position.x, cam.position.y, cam.position.z] : null,
          renderInfo,
          pointsCount: state.points?.length,
          sceneObjects: sceneObjs,
          bodyAttrs: {
            panelSurface: document.body.dataset.panelSurface,
            journeyPhase: document.body.dataset.journeyPhase,
            demoPhase: document.body.dataset.demoPhase,
            graphicsMode: document.body.dataset.graphicsMode,
          },
        };
      });
      results.legacyDetails = legacyDetails;
      console.log(`Legacy camera: ${JSON.stringify(legacyDetails.cameraPos)}`);
      console.log(`Legacy render info: ${JSON.stringify(legacyDetails.renderInfo)}`);
      console.log(`Legacy scene objects: ${JSON.stringify(legacyDetails.sceneObjects)}`);
      
    } catch (err) {
      console.log(`Legacy check error: ${err.message}`);
      results.legacyDetails = { error: err.message };
    }

    // === CHECK 9: Svelte again for FPS after navigating back ===
    console.log('\n--- Check 9: Svelte FPS Re-check ---');
    await page.goto(SVELTE_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await sleep(5000);
    
    const fpsRecheck = await page.evaluate(async () => {
      return new Promise(resolve => {
        let frames = 0;
        let totalTime = 0;
        let prevTime = performance.now();
        
        function tick(ts) {
          frames++;
          totalTime += ts - prevTime;
          prevTime = ts;
          
          if (totalTime >= 3000) {
            const avg = Math.round(frames / (totalTime / 1000) * 10) / 10;
            resolve({
              avgFps: avg,
              frames,
              totalTime: Math.round(totalTime),
              avgFrameTime: Math.round(totalTime / frames * 100) / 100,
            });
            return;
          }
          requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
      });
    });
    results.fpsRecheck = fpsRecheck;
    console.log(`FPS recheck: ${JSON.stringify(fpsRecheck)}`);

  } catch (err) {
    console.error('Error:', err.message);
    results.fatalError = err.message;
  }

  await browser.close();

  // === WRITE REPORT ===
  console.log('\n\n=== WRITING TARGETED REPORT ===');
  
  function sec(title, data, pre = true) {
    console.log(`\n## ${title}`);
    if (pre) console.log(JSON.stringify(data, null, 2));
    else console.log(data);
  }

  const reportLines = [];
  reportLines.push('# Targeted Svelte 3D Checks');
  reportLines.push('');
  reportLines.push(`Date: ${new Date().toISOString()}`);
  reportLines.push('');
  
  for (const [key, val] of Object.entries(results)) {
    reportLines.push(`## ${key}`);
    reportLines.push('');
    reportLines.push('```json');
    reportLines.push(JSON.stringify(val, null, 2));
    reportLines.push('```');
    reportLines.push('');
  }
  
  // Add console log
  reportLines.push('## Console Log');
  reportLines.push('');
  reportLines.push('```');
  reportLines.push(allLogs.join('\n') || '(empty)');
  reportLines.push('```');

  await fs.writeFile(REPORT_FILE, reportLines.join('\n'), 'utf-8');
  console.log(`\nReport written to ${REPORT_FILE}`);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
