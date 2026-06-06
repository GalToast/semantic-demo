const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

  page.on('console', msg => console.log(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', err => console.log(`[PAGEERROR] ${err.message}`));

  // 1. Load page
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle', timeout: 15000 });

  // 2. Wait for data store + engine init
  await page.waitForFunction(() => {
    return !!window.__APP_STATE__ && (window.__APP_STATE__.points?.length > 0);
  }, { timeout: 15000 });

  // 3. Wait a bit for the first animation frames
  await page.waitForTimeout(2000);

  // 4. Take full screenshot
  await page.screenshot({ path: 'reports/screenshots/engine-visual-check.png', fullPage: false });

  // 5. Probe the scene deeply
  const report = await page.evaluate(() => {
    const st = window.__APP_STATE__;
    const scene = st?.scene;

    return {
      // Camera
      cameraPosition: st?.camera?.position ? { x: st.camera.position.x, y: st.camera.position.y, z: st.camera.position.z } : null,
      cameraLookAt: st?.controls?.target ? { x: st.controls.target.x, y: st.controls.target.y, z: st.controls.target.z } : null,

      // Scene basics
      sceneChildrenCount: scene?.children?.length ?? 0,
      sceneChildrenTypes: scene?.children?.map(c => c.type) ?? [],

      // Background / fog
      background: scene?.background ? (scene.background.isColor ? `Color(${scene.background.r},${scene.background.g},${scene.background.b})` : String(scene.background)) : null,
      fog: scene?.fog ? { type: scene.fog.type, color: scene.fog.color?.getHexString?.() } : null,

      // Points / Nodes
      pointsMeshExists: !!st?.pointsMesh,
      pointsMeshVisible: st?.pointsMesh?.visible,
      pointsMeshCount: st?.pointsMesh?.geometry?.attributes?.position?.count ?? 0,
      pointsMeshMaterial: st?.pointsMesh?.material?.type,
      pointsMeshScale: st?.pointsMesh?.scale ? { x: st.pointsMesh.scale.x, y: st.pointsMesh.scale.y, z: st.pointsMesh.scale.z } : null,

      // Lights
      lights: scene?.children?.filter(c => c.type.includes('Light')).map(l => ({
        type: l.type,
        intensity: l.intensity,
        color: l.color?.getHexString?.(),
        position: { x: l.position?.x, y: l.position?.y, z: l.position?.z }
      })),

      // Renderer
      rendererWidth: st?.renderer?.domElement?.width,
      rendererHeight: st?.renderer?.domElement?.height,
      pixelRatio: st?.renderer?.pixelRatio ?? st?.renderer?.getPixelRatio?.(),
      clearColor: st?.renderer?.getClearColor ? (() => {
        const c = new (window.THREE || {}).Color();
        if (st.renderer.getClearColor) {
          st.renderer.getClearColor(c);
          return c.getHexString();
        }
        return null;
      })() : null,

      // DOM info
      body: {
        graphicsMode: document.body.dataset.graphicsmode,
        currentView: document.body.dataset.currentview,
      },
    };
  });

  console.log(JSON.stringify(report, null, 2));

  await browser.close();
})();
