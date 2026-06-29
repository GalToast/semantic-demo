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
import { debugLog, debugError } from '@lib/utils/debug'

  interface Props {
    visible?: boolean;
  }

  let { visible = false }: Props = $props();

  let autoRotateEnabled = $state(false);
  let focusPersonalityOverride = $state<string>('auto');

  onMount(() => {
    if (!visible) return;

    let guiInstance: import("lil-gui").default | undefined;

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
            debugLog('[dev-gui] cleared local + session storage');
          } catch (err) {
            debugError('[dev-gui] clearStorage failed', err);
          }
        },
        logSemanticState: () => {
          const state = window.__semanticState
          debugLog('[dev-gui] window.__semanticState:', state);
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
          const camera = window.__semanticCamera
          if (camera) {
            camera.autoRotate = v;
            debugLog('[dev-gui] camera.autoRotate =', v);
          } else {
            debugLog('[dev-gui] autoRotate toggle =', v, '(no camera bridge yet)');
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
          const state = window.__semanticState
          if (state) {
            state.focusPersonalityOverride = v === 'auto' ? undefined : v;
            debugLog('[dev-gui] focusPersonalityOverride =', v);
          } else {
            debugLog('[dev-gui] focusPersonalityOverride =', v, '(no state bridge yet)');
          }
        });

      pocketFolder.open();

      // --- Postprocessing folder ---
      // @ts-ignore — window.__semanticPostprocessing is typed in window.d.ts
      let ppEnabled = window.__semanticPostprocessing?.isPremiumMode?.() ?? false;
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
          const pp = window.__semanticPostprocessing
          if (pp?.setPremiumMode) {
            pp.setPremiumMode(v);
            debugLog('[dev-gui] premium mode =', v);
          } else {
            debugLog('[dev-gui] premium mode =', v, '(postprocessing module not ready)');
          }
        });

      ppFolder
        .add({ intensity: bloomIntensity }, 'intensity', 0, 2, 0.05)
        .name('Bloom intensity')
        .onChange((v: number) => {
          bloomIntensity = v;
          const pp = window.__semanticPostprocessing;
          pp?.updateBloomParams?.({ intensity: v });
        });

      ppFolder
        .add({ threshold: bloomThreshold }, 'threshold', 0, 2, 0.05)
        .name('Bloom threshold')
        .onChange((v: number) => {
          bloomThreshold = v;
          const pp = window.__semanticPostprocessing;
          pp?.updateBloomParams?.({ luminanceThreshold: v });
        });

      ppFolder
        .add({ radius: bloomRadius }, 'radius', 0, 1.5, 0.05)
        .name('Bloom radius')
        .onChange((v: number) => {
          bloomRadius = v;
          const pp = window.__semanticPostprocessing;
          pp?.updateBloomParams?.({ radius: v });
        });

      ppFolder
        .add({ dof: dofEnabled }, 'dof')
        .name('Depth-of-field')
        .onChange((v: boolean) => {
          dofEnabled = v;
          const pp = window.__semanticPostprocessing;
          pp?.setDofEnabled?.(v);
          debugLog('[dev-gui] DOF =', v);
        });

      ppFolder.open();
    })();

    return () => {
      // @ts-ignore — guiInstance typed explicitly above
      void guiInstance?.destroy();
    };
  });
</script>

{#if visible}
  <!-- lil-gui injects its own DOM; the visible prop is just a mount gate. -->
  <div role="complementary" aria-label="Developer tools"></div>
{/if}

<style>
  /* No styles — lil-gui styles itself. */
</style>
