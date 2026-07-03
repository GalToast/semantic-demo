/**
 * Deep programmatic analysis of Svelte dev server 3D scene.
 * Measures actual visual state, geometry, shaders, camera.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const SVELTE_URL = 'http://localhost:5173/';
const LEGACY_URL = 'http://127.0.0.1:8795/index.html';
const SCREENSHOT_DIR = path.resolve(process.cwd(), 'reports', 'screenshots', 'svelte-audit-deep');
const REPORT_FILE = path.resolve(process.cwd(), 'reports', 'svelte-deep-analysis-report.md');

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  console.log('=== DEEP SVELTE 3D ANALYSIS ===\n');
  await ensureDir(SCREENSHOT_DIR);

  const browser = await chromium.launch({ headless: false, args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  // Collect all console
  const allLogs = [];
  page.on('console', msg => allLogs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', err => allLogs.push(`[PAGE_ERROR] ${err.message}`));

  const results = {};

  try {
    // === NAVIGATE ===
    console.log('1. Navigating to Svelte dev server...');
    await page.goto(SVELTE_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await sleep(4000);

    // === STAGE 1: Three.js engine deep dive ===
    console.log('\n--- Stage 1: Three.js Engine State ---');
    const engineState = await page.evaluate(() => {
      const state = window.__semanticState || window.__TEST_STATE__ || {};
      const cam = state.camera;
      const renderer = state.renderer;
      const scene = state.scene;
      const points = state.points || [];
      const rawBuf = state.rawPositionsBuffer;

      // WebGL info
      let glInfo = {};
      try {
        const canvas = document.querySelector('canvas');
        if (canvas) {
          const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
          if (gl) {
            glInfo = {
              vendor: gl.getParameter(gl.VENDOR),
              renderer: gl.getParameter(gl.RENDERER),
              maxTexSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
              maxVertexAttribs: gl.getParameter(gl.MAX_VERTEX_ATTRIBS),
              maxVaryingVectors: gl.getParameter(gl.MAX_VARYING_VECTORS),
              maxVertexUniforms: gl.getParameter(gl.MAX_VERTEX_UNIFORM_VECTORS),
              maxFragmentUniforms: gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS),
              aliasing: gl.getParameter(gl.SAMPLES),
              maxAnisotropy: gl.getExtension('EXT_texture_filter_anisotropic')?.MAX_TEXTURE_MAX_ANISOTROPY_EXT 
                ? gl.getParameter(gl.getExtension('EXT_texture_filter_anisotropic').MAX_TEXTURE_MAX_ANISOTROPY_EXT) 
                : 0,
            };
          }
        }
      } catch(e) { glInfo.error = e.message; }

      // Camera state
      const camState = cam ? {
        position: [cam.position.x, cam.position.y, cam.position.z],
        target: cam.target ? [cam.target.x, cam.target.y, cam.target.z] : null,
        fov: cam.fov,
        near: cam.near,
        far: cam.far,
        zoom: cam.zoom,
        type: cam.type,
      } : null;

      // Scene children breakdown
      let sceneChildren = null;
      if (scene) {
        const counts = {};
        scene.children.forEach(c => {
          const t = c.type || c.constructor?.name || 'unknown';
          counts[t] = (counts[t] || 0) + 1;
        });
        sceneChildren = counts;
      }

      // Renderer info
      const rState = renderer ? {
        type: renderer.type,
        pixelRatio: renderer.getPixelRatio(),
        size: renderer.getSize ? (typeof THREE !== 'undefined' && THREE.Vector2 ? renderer.getSize(new THREE.Vector2()) : 'getSize available') : null,
        autoRotate: renderer.autoRotate,
        toneMapping: renderer.toneMapping,
        outputColorSpace: renderer.outputColorSpace,
      } : null;

      // Point buffer info
      let bufInfo = {};
      if (rawBuf) {
        bufInfo = {
          length: rawBuf.length,
          floatsPerPoint: 3, // x,y,z
          pointCount: rawBuf.length / 3,
          min: [Infinity, Infinity, Infinity],
          max: [-Infinity, -Infinity, -Infinity],
          centroid: [0, 0, 0],
        };
        for (let i = 0; i < rawBuf.length; i += 3) {
          bufInfo.min[0] = Math.min(bufInfo.min[0], rawBuf[i]);
          bufInfo.min[1] = Math.min(bufInfo.min[1], rawBuf[i+1]);
          bufInfo.min[2] = Math.min(bufInfo.min[2], rawBuf[i+2]);
          bufInfo.max[0] = Math.max(bufInfo.max[0], rawBuf[i]);
          bufInfo.max[1] = Math.max(bufInfo.max[1], rawBuf[i+1]);
          bufInfo.max[2] = Math.max(bufInfo.max[2], rawBuf[i+2]);
        }
        bufInfo.centroid[0] = (bufInfo.min[0] + bufInfo.max[0]) / 2;
        bufInfo.centroid[1] = (bufInfo.min[1] + bufInfo.max[1]) / 2;
        bufInfo.centroid[2] = (bufInfo.min[2] + bufInfo.max[2]) / 2;
        bufInfo.extent = [
          bufInfo.max[0] - bufInfo.min[0],
          bufInfo.max[1] - bufInfo.min[1],
          bufInfo.max[2] - bufInfo.min[2],
        ];
      }

      // Check for shader errors
      let shaderErrors = [];
      try {
        const canvas = document.querySelector('canvas');
        if (canvas) {
          const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
          if (gl) {
            const shaderCount = gl.getParameter(gl.CURRENT_PROGRAM) ? 1 : 0;
            glInfo.activeProgram = shaderCount;
          }
        }
      } catch(e) { shaderErrors.push(e.message); }

      return {
        camera: camState,
        sceneChildren,
        renderer: rState,
        pointBuffer: bufInfo,
        gl: glInfo,
        stateKeys: Object.keys(state).slice(0, 30),
      };
    });
    results.engineState = engineState;
    console.log(`Camera position: ${JSON.stringify(engineState.camera?.position)}`);
    console.log(`Point buffer: ${engineState.pointBuffer?.pointCount} points`);
    console.log(`Point bounds min: ${JSON.stringify(engineState.pointBuffer?.min)}`);
    console.log(`Point bounds max: ${JSON.stringify(engineState.pointBuffer?.max)}`);
    console.log(`Point centroid: ${JSON.stringify(engineState.pointBuffer?.centroid)}`);
    console.log(`Point extent: ${JSON.stringify(engineState.pointBuffer?.extent)}`);
    console.log(`Scene children: ${JSON.stringify(engineState.sceneChildren)}`);
    console.log(`Renderer: ${JSON.stringify(engineState.renderer)}`);
    console.log(`GL: ${JSON.stringify(engineState.gl)}`);

    // === STAGE 2: Shader compilation check ===
    console.log('\n--- Stage 2: Shader/Program Check ---');
    const shaderState = await page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      if (!canvas) return { error: 'no canvas' };
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      if (!gl) return { error: 'no gl' };
      const info = {
        webglVersion: gl instanceof WebGL2RenderingContext ? '2.0' : '1.0',
        maxCombinedTexImageUnits: gl.getParameter(gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS),
        maxCubeMapTextureSize: gl.getParameter(gl.MAX_CUBE_MAP_TEXTURE_SIZE),
        maxRenderBufferSize: gl.getParameter(gl.MAX_RENDERBUFFER_SIZE),
        maxVertexTextureImageUnits: gl.getParameter(gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS),
        maxFragmentTextureImageUnits: gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS),
        maxVertexAttribs: gl.getParameter(gl.MAX_VERTEX_ATTRIBS),
        maxViewportDims: gl.getParameter(gl.MAX_VIEWPORT_DIMS),
        aliasing: gl.getParameter(gl.SAMPLES),
        redBits: gl.getParameter(gl.RED_BITS),
        greenBits: gl.getParameter(gl.GREEN_BITS),
        blueBits: gl.getParameter(gl.BLUE_BITS),
        alphaBits: gl.getParameter(gl.ALPHA_BITS),
        depthBits: gl.getParameter(gl.DEPTH_BITS),
        stencilBits: gl.getParameter(gl.STENCIL_BITS),
      };
      // Check for any pending shader errors
      const shaderError = gl.getError();
      info.glError = shaderError === gl.NO_ERROR ? 0 : shaderError;
      return info;
    });
    results.shaderState = shaderState;
    console.log(`WebGL version: ${shaderState.webglVersion}`);
    console.log(`GL error: ${shaderState.glError}`);
    console.log(`Depth bits: ${shaderState.depthBits}, Stencil: ${shaderState.stencilBits}`);

    // === STAGE 3: Node/geometry specifics ===
    console.log('\n--- Stage 3: Geometry/Node Details ---');
    const nodeDetails = await page.evaluate(() => {
      const state = window.__semanticState || window.__TEST_STATE__ || {};
      const scene = state.scene;
      if (!scene) return { error: 'no scene' };

      // Check instanced meshes
      let nodeInfo = {};
      scene.traverse(obj => {
        if (obj.isInstancedMesh || (obj.type === 'InstancedMesh')) {
          const key = obj.name || obj.type;
          nodeInfo[key] = {
            type: obj.type,
            count: obj.count,
            instanceMatrix: obj.instanceMatrix?.count || 0,
            geometryType: obj.geometry?.type,
            geometryAttribs: obj.geometry?.attributes ? Object.keys(obj.geometry.attributes) : [],
            materialType: obj.material?.type,
            materialOpacity: obj.material?.opacity,
            materialTransparent: obj.material?.transparent,
            materialWireframe: obj.material?.wireframe,
            visible: obj.visible,
          };
        }
        // Check points
        if (obj.isPoints || obj.type === 'Points') {
          const key = obj.name || 'Points';
          nodeInfo[key] = {
            type: obj.type,
            geometryType: obj.geometry?.type,
            geometryAttribs: obj.geometry?.attributes ? Object.keys(obj.geometry.attributes) : [],
            materialType: obj.material?.type,
            materialSize: obj.material?.size,
            count: obj.geometry?.attributes?.position?.count,
            visible: obj.visible,
          };
        }
        // Check lines
        if (obj.isLine || obj.isLineSegments || obj.isLineLoop || obj.type?.includes('Line')) {
          const key = obj.name || obj.type;
          nodeInfo[key] = {
            type: obj.type,
            geometryType: obj.geometry?.type,
            count: obj.geometry?.attributes?.position?.count,
            materialType: obj.material?.type,
            materialOpacity: obj.material?.opacity,
            materialTransparent: obj.material?.transparent,
            visible: obj.visible,
          };
        }
      });
      return nodeInfo;
    });
    results.nodeDetails = nodeDetails;
    console.log('Scene objects:');
    for (const [name, info] of Object.entries(nodeDetails)) {
      console.log(`  ${name}: ${JSON.stringify(info)}`);
    }

    // === STAGE 4: FPS & throttling ===
    console.log('\n--- Stage 4: Performance ---');
    const fps1 = await page.evaluate(async () => {
      return new Promise(resolve => {
        let frames = 0;
        const start = performance.now();
        function count() {
          frames++;
          if (performance.now() - start >= 2000) {
            resolve(Math.round(frames / 2 * 10) / 10);
            return;
          }
          requestAnimationFrame(count);
        }
        requestAnimationFrame(count);
      });
    });
    console.log(`FPS (2s sample): ${fps1}`);
    
    const fps2 = await page.evaluate(async () => {
      // Try requestVideoFrameCallback if available
      if ('requestVideoFrameCallback' in HTMLVideoElement.prototype) {
        return 'rVFC supported';
      }
      return 'using rAF fallback';
    });
    console.log(`FPS method: ${fps2}`);

    // memory info
    const memoryInfo = await page.evaluate(() => {
      const mem = performance.memory;
      if (!mem) return { error: 'performance.memory not available (not Chrome or no flag)' };
      return {
        jsHeapSizeLimit: mem.jsHeapSizeLimit,
        totalJSHeapSize: mem.totalJSHeapSize,
        usedJSHeapSize: mem.usedJSHeapSize,
      };
    });
    results.memory = memoryInfo;
    console.log(`Memory: ${JSON.stringify(memoryInfo)}`);

    // === STAGE 5: Check for scene reveal / demo state ===
    console.log('\n--- Stage 5: Scene Visibility & Demo ---');
    const visState = await page.evaluate(() => {
      const state = window.__semanticState || window.__TEST_STATE__ || {};
      const canvas = document.querySelector('canvas');
      const styles = canvas ? getComputedStyle(canvas) : null;
      const bodyAttrs = {};
      for (const attr of document.body.attributes) {
        bodyAttrs[attr.name] = attr.value;
      }
      return {
        canvasVisible: styles ? styles.display !== 'none' && styles.visibility !== 'hidden' && styles.opacity !== '0' : null,
        canvasZIndex: styles?.zIndex,
        canvasPosition: styles?.position,
        canvasCSS: styles ? {
          width: styles.width,
          height: styles.height,
          display: styles.display,
          visibility: styles.visibility,
          opacity: styles.opacity,
        } : null,
        bodyAttrs,
        demoStorage: (() => {
          try {
            return {
              localStorage: localStorage.getItem('moco_mycelium_demo_v1'),
              sessionStorage: sessionStorage.getItem('moco_mycelium_demo_session_v1'),
            };
          } catch { return null; }
        })(),
        loadingOverlay: document.querySelector('[data-loading], .loading-overlay, #loading')?.outerHTML?.substring(0, 200) || null,
      };
    });
    results.visState = visState;
    console.log(`Canvas visible: ${visState.canvasVisible}`);
    console.log(`Canvas CSS: ${JSON.stringify(visState.canvasCSS)}`);
    console.log(`Body attrs: ${JSON.stringify(visState.bodyAttrs)}`);
    console.log(`Demo storage: ${JSON.stringify(visState.demoStorage)}`);
    console.log(`Loading overlay: ${visState.loadingOverlay}`);

    // === STAGE 6: Search functionality check ===
    console.log('\n--- Stage 6: Search ---');
    const searchState = await page.evaluate(() => {
      const state = window.__semanticState || window.__TEST_STATE__ || {};
      return {
        searchQuery: state.searchQuery || state.search?.query || null,
        searchResults: state.searchResults || state.search?.results || null,
        searchResultCount: state.searchResults?.length || state.search?.results?.length || 0,
      };
    });
    results.searchState = searchState;
    console.log(`Search state: ${JSON.stringify(searchState)}`);

    // Try search
    const searchInput = page.locator('input[type="search"], input:not([type])[role="searchbox"], [role="searchbox"] input, input[placeholder*="search" i]');
    const inputCount = await searchInput.count();
    console.log(`Search input elements found: ${inputCount}`);
    
    if (inputCount > 0) {
      await searchInput.first().click();
      await sleep(200);
      await searchInput.first().fill('coffee');
      await sleep(1500);
      
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'search-coffee.png') });
      
      const postSearch = await page.evaluate(() => {
        const state = window.__semanticState || window.__TEST_STATE__ || {};
        return {
          searchQuery: state.searchQuery || state.search?.query || null,
          searchResults: state.searchResults || state.search?.results || null,
          searchResultCount: state.searchResults?.length || state.search?.results?.length || 0,
          demoPhase: document.body.dataset.demoPhase,
          panelSurface: document.body.dataset.panelSurface,
        };
      });
      results.postSearch = postSearch;
      console.log(`Post-search state: ${JSON.stringify(postSearch)}`);
    }

    // === STAGE 7: Thread/micelium lines check ===
    console.log('\n--- Stage 7: Thread Lines ---');
    const threadDetails = await page.evaluate(() => {
      const state = window.__semanticState || window.__TEST_STATE__ || {};
      const threads = state.threads || state.semanticThreads || state.threadData;
      let count = 0;
      if (Array.isArray(threads)) count = threads.length;
      else if (typeof threads === 'object' && threads !== null) {
        count = Object.keys(threads).length;
      }
      return {
        threadCount: count,
        threadKeys: threads ? Object.keys(threads).slice(0, 5) : null,
      };
    });
    results.threadDetails = threadDetails;
    console.log(`Threads: ${JSON.stringify(threadDetails)}`);

    // === STAGE 8: Legacy comparison (same process) ===
    console.log('\n--- Stage 8: Legacy Comparison ---');
    try {
      await page.goto(LEGACY_URL, { waitUntil: 'networkidle', timeout: 15000 });
      await sleep(4000);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'legacy-idle.png') });

      const legacyState = await page.evaluate(() => {
        const state = window.__semanticState || window.__TEST_STATE__ || {};
        const cam = state.camera;
        const renderer = state.renderer;
        const rawBuf = state.rawPositionsBuffer;
        
        let camPos = null;
        if (cam) camPos = [cam.position.x, cam.position.y, cam.position.z];

        let bufInfo = {};
        if (rawBuf) {
          bufInfo = {
            pointCount: rawBuf.length / 3,
            min: [rawBuf[0], rawBuf[1], rawBuf[2]],
            centroid: [0, 0, 0],
          };
          let mx = -Infinity, my = -Infinity, mz = -Infinity;
          let nx = Infinity, ny = Infinity, nz = Infinity;
          for (let i = 0; i < rawBuf.length; i += 3) {
            nx = Math.min(nx, rawBuf[i]); mx = Math.max(mx, rawBuf[i]);
            ny = Math.min(ny, rawBuf[i+1]); my = Math.max(my, rawBuf[i+1]);
            nz = Math.min(nz, rawBuf[i+2]); mz = Math.max(mz, rawBuf[i+2]);
          }
          bufInfo.min = [nx, ny, nz];
          bufInfo.max = [mx, my, mz];
          bufInfo.centroid = [(nx+mx)/2, (ny+my)/2, (nz+mz)/2];
          bufInfo.extent = [mx-nx, my-ny, mz-nz];
        }
        return {
          cameraPos: camPos,
          rendererType: renderer?.type,
          pixelRatio: renderer?.getPixelRatio?.(),
          pointBuffer: bufInfo,
          points: state.points?.length,
          panelSurface: document.body.dataset.panelSurface,
          journeyPhase: document.body.dataset.journeyPhase,
          demoPhase: document.body.dataset.demoPhase,
        };
      });
      results.legacy = legacyState;
      console.log(`Legacy camera: ${JSON.stringify(legacyState.cameraPos)}`);
      console.log(`Legacy point buffer: ${JSON.stringify(legacyState.pointBuffer)}`);
      console.log(`Legacy panel surface: ${legacyState.panelSurface}`);

    } catch (err) {
      console.log(`Legacy comparison error: ${err.message}`);
      results.legacy = { error: err.message };
    }

  } catch (err) {
    console.error('Analysis error:', err.message);
    results.error = err.message;
  }

  await browser.close();

  // === WRITE REPORT ===
  console.log('\n\n=== WRITING REPORT ===');
  const report = [];

  function sec(title, body) {
    report.push(`## ${title}`);
    report.push('');
    report.push('```json');
    report.push(JSON.stringify(body, null, 2));
    report.push('```');
    report.push('');
  }

  report.push('# Deep Svelte 3D Scene Analysis');
  report.push('');
  report.push(`Date: ${new Date().toISOString()}`);
  report.push('');
  report.push(`Svelte URL: ${SVELTE_URL}`);
  report.push(`Legacy URL: ${LEGACY_URL}`);
  report.push('');

  sec('Console Log', allLogs);
  sec('Engine State', results.engineState || results.error);
  sec('Shader/WebGL State', results.shaderState);
  sec('Scene Objects & Geometry', results.nodeDetails);
  
  if (results.memory) {
    sec('Memory Usage', results.memory);
  }
  if (results.visState) {
    sec('Visibility & Demo State', results.visState);
  }
  if (results.searchState) {
    sec('Search State', results.searchState);
  }
  if (results.postSearch) {
    sec('Post-Search State', results.postSearch);
  }
  if (results.threadDetails) {
    sec('Thread Details', results.threadDetails);
  }
  if (results.legacy) {
    sec('Legacy Comparison', results.legacy);
  }

  await fs.writeFile(REPORT_FILE, report.join('\n'), 'utf-8');
  console.log(`Report written to ${REPORT_FILE}`);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
