<!--
  @components/DevToolsMount.svelte — Dev-only runtime tooling mount

  Extracted from App.svelte (W48-T1). Owns the dev-only lazy components
  (DevGui, SpectorInspector, DevTelemetry) and the optional telemetry
  subscriber install. Rendered conditionally by App.svelte on import.meta.env.DEV
  so the chunks stay out of production builds.

  DEV-only: this component's contents are stripped by Vite's tree-shaker
  when MODE !== 'development'. The component file itself still ships as a
  tiny mount point, but its imports are guarded behind the DEV flag at the
  call site (App.svelte wraps it in {#if import.meta.env.DEV}).
-->
<script lang="ts">
  import { createLazyComponent } from '@lib/utils/lazy-component.svelte';

  interface Props {
    /** Whether dev tool chrome should be visible (URL gates: ?debug, ?devtools, ?spector) */
    visible?: boolean;
  }

  let { visible = false }: Props = $props();

  const devGuiLazy = createLazyComponent(
    () => import('@components/DevGui.svelte'),
    { idle: false, logOnError: true }
  );
  const spectorInspectorLazy = createLazyComponent(
    () => import('@components/SpectorInspector.svelte'),
    { idle: false, logOnError: true }
  );
  const devTelemetryLazy = createLazyComponent(
    () => import('@components/DevTelemetry.svelte'),
    { idle: false, logOnError: true }
  );

  // Mount all three dev tool chunks together when visible.
  $effect(() => {
    devGuiLazy.ensure(visible);
    spectorInspectorLazy.ensure(visible);
    devTelemetryLazy.ensure(visible);

    // Phase 9b: install telemetry subscriber only in dev mode. The
    // store stays disabled unless the DevTelemetry overlay enables it,
    // so even with the subscriber attached, no events are recorded in
    // production-like builds (Vite's DEV flag is false there).
    if (import.meta.env.DEV) {
      void import('@lib/telemetry').then((mod) => {
        const handle = mod.installTelemetry();
        // Expose for ad-hoc inspection in DevTools.
        ;(window as unknown as { __telemetry__?: unknown }).__telemetry__ = {
          store: mod.telemetryStore,
          handle
        };
      });
    }
  });
</script>

{#if devGuiLazy.current}
  {@const Cmp = devGuiLazy.current}
  <Cmp visible={visible} />
{/if}
{#if spectorInspectorLazy.current}
  {@const Cmp = spectorInspectorLazy.current}
  <Cmp visible={visible} />
{/if}
{#if devTelemetryLazy.current}
  {@const Cmp = devTelemetryLazy.current}
  <Cmp visible={visible} />
{/if}
