<!--
  @components/DevGui.svelte — Dev-only lil-gui runtime parameter panel.

  Mounted only when import.meta.env.DEV is true (see App.svelte).
  Tree-shaken out of production builds.

  lil-gui is lazy-imported on mount so its ~10KB cost is paid only in dev.
  The GUI instance is created once on mount and destroyed on unmount.

  To add a control: call `gui.add(target, property)` with a Svelte store
  field, an imperative bridge handle, or a plain function. For typed
  bindings, prefer the plain-object params shape (see `params` below).
-->
<script lang="ts">
  import { onMount } from 'svelte';

  interface Props {
    visible?: boolean;
  }

  let { visible = false }: Props = $props();

  let autoRotateEnabled = $state(false);
  let focusPersonalityOverride = $state<string>('auto');

  onMount(() => {
    if (!visible) return;

    let guiInstance: any;

    void (async () => {
      // Lazy import — keeps the lil-gui bundle out of the main chunk and
      // out of production entirely (this onMount never runs in prod).
      const { default: GUI } = await import('lil-gui');

      const gui = new GUI({ title: 'Dev Controls', width: 280 });
      guiInstance = gui;

      // --- Quick actions ---
      const actions = {
        triggerDemo: () => {
          const url = new URL(window.location.href);
          url.searchParams.set('demo', 'force');
          window.location.href = url.toString();
        },
        clearStorage: () => {
          try {
            localStorage.clear();
            sessionStorage.clear();
            console.log('[dev-gui] cleared local + session storage');
          } catch (err) {
            console.error('[dev-gui] clearStorage failed', err);
          }
        },
        logSemanticState: () => {
          const state = (window as unknown as { __semanticState?: unknown }).__semanticState;
          console.log('[dev-gui] window.__semanticState:', state);
        },
      };
      gui.add(actions, 'triggerDemo').name('▶ Trigger demo');
      gui.add(actions, 'clearStorage').name('🗑 Clear storage');
      gui.add(actions, 'logSemanticState').name('🔍 Log state');

      // --- Scene folder ---
      const sceneFolder = gui.addFolder('Scene');
      sceneFolder
        .add({ autoRotate: autoRotateEnabled }, 'autoRotate')
        .name('Auto-rotate')
        .onChange((v: boolean) => {
          autoRotateEnabled = v;
          // Bridge to legacy camera-controls when running in coexistence mode.
          const camera = (window as unknown as {
            __semanticCamera?: { autoRotate?: boolean; userAutoRotateSpeed?: number };
          }).__semanticCamera;
          if (camera) {
            camera.autoRotate = v;
            console.log('[dev-gui] camera.autoRotate =', v);
          } else {
            console.log('[dev-gui] autoRotate toggle =', v, '(no camera bridge yet)');
          }
        });

      // --- Focus pocket folder ---
      const pocketFolder = gui.addFolder('Focus Pocket');
      pocketFolder
        .add(
          { personality: focusPersonalityOverride },
          'personality',
          ['auto', 'STANDARD', 'DEEP_DIVE', 'DENSE_HUB', 'BRIDGE_NODE', 'EDGE_NODE', 'TIGHT_CLUSTER'],
        )
        .name('Force personality')
        .onChange((v: string) => {
          focusPersonalityOverride = v;
          const state = (window as unknown as {
            __semanticState?: { focusPersonalityOverride?: string };
          }).__semanticState;
          if (state) {
            state.focusPersonalityOverride = v === 'auto' ? undefined : v;
            console.log('[dev-gui] focusPersonalityOverride =', v);
          } else {
            console.log('[dev-gui] focusPersonalityOverride =', v, '(no state bridge yet)');
          }
        });

      pocketFolder.open();

      // --- Postprocessing folder ---
      let ppEnabled = document.body.dataset.premiumMode === 'true';
      let bloomIntensity = 0.5;
      let bloomThreshold = 0.6;
      let bloomRadius = 0.6;
      let dofEnabled = false;

      const ppFolder = gui.addFolder('Postprocessing');
      ppFolder
        .add({ premiumMode: ppEnabled }, 'premiumMode')
        .name('Premium mode')
        .onChange((v: boolean) => {
          ppEnabled = v;
          // Bridge to three-postprocessing module
          const pp = (window as unknown as {
            __semanticPostprocessing?: { setPremiumMode?: (v: boolean) => void };
          }).__semanticPostprocessing;
          if (pp?.setPremiumMode) {
            pp.setPremiumMode(v);
            console.log('[dev-gui] premium mode =', v);
          } else {
            // Fallback: set body attribute directly
            if (v) {
              document.body.dataset.premiumMode = 'true';
            } else {
              delete document.body.dataset.premiumMode;
            }
            console.log('[dev-gui] premium mode =', v, '(body attr only)');
          }
        });

      ppFolder
        .add({ intensity: bloomIntensity }, 'intensity', 0, 2, 0.05)
        .name('Bloom intensity')
        .onChange((v: number) => {
          bloomIntensity = v;
          const pp = (window as unknown as {
            __semanticPostprocessing?: { updateBloomParams?: (p: Record<string, number>) => void };
          }).__semanticPostprocessing;
          pp?.updateBloomParams?.({ intensity: v });
        });

      ppFolder
        .add({ threshold: bloomThreshold }, 'threshold', 0, 2, 0.05)
        .name('Bloom threshold')
        .onChange((v: number) => {
          bloomThreshold = v;
          const pp = (window as unknown as {
            __semanticPostprocessing?: { updateBloomParams?: (p: Record<string, number>) => void };
          }).__semanticPostprocessing;
          pp?.updateBloomParams?.({ luminanceThreshold: v });
        });

      ppFolder
        .add({ radius: bloomRadius }, 'radius', 0, 1.5, 0.05)
        .name('Bloom radius')
        .onChange((v: number) => {
          bloomRadius = v;
          const pp = (window as unknown as {
            __semanticPostprocessing?: { updateBloomParams?: (p: Record<string, number>) => void };
          }).__semanticPostprocessing;
          pp?.updateBloomParams?.({ radius: v });
        });

      ppFolder
        .add({ dof: dofEnabled }, 'dof')
        .name('Depth-of-field')
        .onChange((v: boolean) => {
          dofEnabled = v;
          const pp = (window as unknown as {
            __semanticPostprocessing?: { setDofEnabled?: (v: boolean) => void };
          }).__semanticPostprocessing;
          pp?.setDofEnabled?.(v);
          console.log('[dev-gui] DOF =', v);
        });

      ppFolder.open();
    })();

    return () => {
      void guiInstance?.destroy();
    };
  });
</script>

{#if visible}
  <!-- lil-gui injects its own DOM; the visible prop is just a mount gate. -->
{/if}

<style>
  /* No styles — lil-gui styles itself. */
</style>
