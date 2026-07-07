<!--
  @components/DemoChoreography.svelte — Full-featured 10-phase auto-demo showcase
-->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import {
    demoPhase,
    isDemoActive,
    startDemo,
    cancelDemo,
    transitionDemo,
    cancelAllDemoTimers,
    scheduleDemoTimer,
    findDemoNode,
    shouldRunDemo,
    markDemoCompleted,
    markDemoSessionSkipped,
    DEMO_START_DELAY_MS,
    MAX_START_RETRIES
  } from '@lib/stores/demo.svelte.ts';
  import { DEMO_SCRIPT } from '@lib/demo/demo-script';
  import type { DemoPhase } from '@lib/stores/demo.svelte.ts';
  import { getBusinessRecords } from '@lib/stores/index.svelte.ts';
  import { showToastSpec, dismissToast } from '@lib/stores/toast.svelte';
  import { sceneReady } from '@lib/stores/scene-ready.svelte';
  import { debugWarn } from '@lib/utils/debug';

  interface Props {
    force?: boolean;
    suppress?: boolean;
  }

  let { force = false, suppress = false }: Props = $props();

  let eligible = $state(true);

  const FORCED_START_DELAY_MS = 800;
  const RETRY_START_DELAY_MS = 250;
  /** Delay before the fallback onboarding toast appears after splash dismissal. */
  const FALLBACK_HINT_DELAY_MS = 2500;
  /** Maximum time to wait for the 3D scene to become ready before falling back. */
  const SCENE_READY_TIMEOUT_MS = 10000;

  /**
   * Track whether the user has interacted since mount. If they have, the
   * fallback toast is suppressed — showing a "click any dot to explore"
   * hint on top of someone already exploring is noise, not help.
   * Closes the Phase 2 welcome-sequence pile-up (Scout B Rec #4).
   */
  let userInteractedSinceMount = false;
  let interactionDismissed = false;
  const interactionAbortController = new AbortController();
  function markInteraction(): void {
    userInteractedSinceMount = true;
    // Dismiss the fallback toast on the first user interaction so it
    // doesn't linger over the map (M3).
    if (!interactionDismissed) {
      dismissToast();
      interactionDismissed = true;
    }
    interactionAbortController.abort();
  }

  /**
   * Attach the document-level interaction listeners that mark the user as
   * "already exploring" so the fallback hint can be suppressed. Kept as a
   * helper so the suppressed branch can attach listeners *after* the scene
   * is ready — the splash/placeholder gate click is mandatory navigation,
   * not exploration, and must not silence the onboarding hint.
   */
  function attachInteractionListeners(): void {
    if (interactionAbortController.signal.aborted) return;
    const interactionSignal = interactionAbortController.signal;
    // Capture phase so the canvas/orbit handlers can't stop propagation
    // before we see the interaction (e.g., a click or tap on a 3D dot is still
    // user exploration and should suppress the fallback hint).
    ['pointerdown', 'pointermove', 'mousemove', 'keydown', 'click', 'touchstart'].forEach((evt) =>
      document.addEventListener(evt, markInteraction, { capture: true, passive: true, signal: interactionSignal })
    );
  }

  const phaseLabels: Record<DemoPhase, string> = {
    IDLE: '',
    OVERVIEW: '8,406 businesses across Montgomery County — as a living network.',
    SEARCH: 'Search for any business type…',
    FOCUS: '…and focus on one.',
    THREADS: 'Every connection it has.',
    NEIGHBORS: 'Businesses that do similar things — by role.',
    TRAIL: 'Follow a thread to its source…',
    DIVE: '…or dive inside a whole cluster.',
    FILTER: 'Filter the county to one kind of business.',
    MAP: 'See where they actually are.',
    RETURN: 'Now explore your way.',
    COMPLETE: '',
    CANCELLED: ''
  };

  /** Show a brief onboarding hint when the auto-demo can't run. */
  function showFallbackHint(): void {
    // Phase 2: suppress if the user is already exploring (Scout B Rec #4).
    // A hint on top of active exploration is noise, not guidance.
    if (userInteractedSinceMount) return;
    showToastSpec({
      title: 'Getting started',
      copy: 'Search for a business type above, or click any dot to explore connections.',
      duration: 8000
    });
  }

  function completeDemo() {
    markDemoCompleted();
    markDemoSessionSkipped('completed');
  }

  function dismissDemo() {
    markDemoSessionSkipped('dismissed');
    cancelDemo();
  }

  function runDemoSequence() {
    let i = 0;
    const runNext = () => {
      if (i >= DEMO_SCRIPT.length) {
        completeDemo();
        return;
      }
      const step = DEMO_SCRIPT[i];
      if (!step) {
        completeDemo();
        return;
      }
      transitionDemo(step.phase);
      // Fire the action (may be async — e.g. search() returns a Promise).
      // W49c: previously used `.catch(() => {})` which silently dropped
      // failures — a failed search step would advance to the next phase
      // with no signal that anything went wrong. Now we log so demo-step
      // failures are diagnosable.
      Promise.resolve(step.action()).catch((err) => {
        if (import.meta.env.DEV) {
          console.error(
            `[DemoChoreography] Step "${step.phase}" failed; advancing anyway.`,
            err
          );
        }
      });
      // Schedule the next step after this phase's duration
      scheduleDemoTimer(() => {
        i++;
        runNext();
      }, step.durationMs);
    };
    runNext();
  }

  function attemptStart(remainingAttempts = MAX_START_RETRIES) {
    const nodeIndex = findDemoNode(getBusinessRecords());
    if (nodeIndex === null) {
      if (remainingAttempts <= 0) {
        eligible = false;
        // W6 audit: Demo couldn't find a valid node — show fallback hint.
        scheduleDemoTimer(() => showFallbackHint(), FALLBACK_HINT_DELAY_MS);
        return;
      }
      scheduleDemoTimer(() => attemptStart(remainingAttempts - 1), RETRY_START_DELAY_MS);
      return;
    }

    // Atomic guard: startDemo() returns false if another attempt already
    // claimed the guard (race between retry loop and a parallel start path).
    // If blocked, silently drop — the winning start owns the sequence.
    if (!startDemo()) return;
    runDemoSequence();
  }

  onMount(() => {
    if (suppress || (!force && !shouldRunDemo())) {
      eligible = false;
      // W6 audit: Show a fallback onboarding hint when the demo is suppressed.
      // This catches returning users, reduced-motion users, and software-renderer
      // users who would otherwise land in the 3D scene with zero guidance.
      //
      // Reliability fix: gate the hint on the scene actually being ready and
      // only attach interaction listeners at that point. The splash/placeholder
      // "Enter 3D Scene" click is required navigation, not exploration; if we
      // listen for it, the hint is suppressed for every user who enters normally.
      const startTime = performance.now();
      const offerHintWhenReady = (): void => {
        if (sceneReady.value || sceneReady.error) {
          attachInteractionListeners();
          scheduleDemoTimer(() => showFallbackHint(), FALLBACK_HINT_DELAY_MS);
          return;
        }
        if (performance.now() - startTime > SCENE_READY_TIMEOUT_MS) {
          // Scene never became ready — still better to offer a hint than nothing.
          attachInteractionListeners();
          scheduleDemoTimer(() => showFallbackHint(), FALLBACK_HINT_DELAY_MS);
          return;
        }
        setTimeout(offerHintWhenReady, 200);
      };
      offerHintWhenReady();
      return;
    }

    // Phase 2: listen for user interaction so the fallback toast can be
    // suppressed if the user is already exploring (Scout B Rec #4).
    // A hint on top of active exploration is noise, not guidance.
    attachInteractionListeners();

    // Phase 2b-2 fix: gate the demo phase driver on the 3D scene actually
    // being rendered. Without this, the demo's camera/search/focus/dive/etc.
    // orchestrators fire against an empty canvas (lazy-loaded three.js chunk
    // takes 5-15s to render) and the demo collapses visually — 9/10 phases
    // show blank chrome. Vision QA of commit 28644010 confirmed this FAIL.
    //
    // We read `sceneReady.value` (the Svelte 5 $state-backed cross-component
    // signal in src/lib/stores/scene-ready.svelte.ts) — NOT the
    // appState.s3dSceneReady mirror field, because mirror fields are not in
    // the AppState $state shape and their writes create plain non-reactive
    // properties. The store is signaled by App.svelte on Canvas onSceneReady
    // callbacks, so the poll observes transitions reliably within ~200ms.
    //
    // 10s timeout falls back to running anyway — a few captions flashing on
    // chrome beats no demo at all when the scene is slow to boot.
    const startTime = performance.now();
    const startWhenReady = (): void => {
      if (sceneReady.value) {
        scheduleDemoTimer(() => attemptStart(), force ? FORCED_START_DELAY_MS : DEMO_START_DELAY_MS);
        return;
      }
      if (sceneReady.error) {
        // Canvas errored — skip the demo and show the fallback hint.
        eligible = false;
        scheduleDemoTimer(() => showFallbackHint(), FALLBACK_HINT_DELAY_MS);
        return;
      }
      if (performance.now() - startTime > SCENE_READY_TIMEOUT_MS) {
        // Scene never became ready (slow network, webgl blocked, etc.).
        // W49c: previously ran demo "anyway" on chrome-only, which showed
        // captions without 3D visualizations — silently degraded UX with
        // no signal to the user. Now we log in DEV AND production so the
        // fallback is at least observable. The "run anyway" behavior is
        // preserved here as a deliberate UX call (better captions than
        // nothing) — to switch to the fallback-hint branch instead, see
        // the sceneReady.error handler above for the equivalent path.
        const message = '[DemoChoreography] Canvas did not become ready in 10s; running demo in degraded mode (captions without 3D scene).';
        debugWarn(message);
        scheduleDemoTimer(() => attemptStart(), force ? FORCED_START_DELAY_MS : DEMO_START_DELAY_MS);
        return;
      }
      setTimeout(startWhenReady, 200);
    };
    startWhenReady();
  });

  onDestroy(() => {
    cancelAllDemoTimers();
    interactionAbortController.abort();
    if (isDemoActive()) {
      cancelDemo();
    }
  });
</script>

{#if eligible && isDemoActive()}
  <div
    class="demo-choreography"
    id="demo-choreography"
    aria-live="polite"
    aria-label="Guided demo"
  >
    <button type="button" class="demo-dismiss" onclick={dismissDemo} aria-label="Dismiss demo"></button>
    <p class="demo-status">{phaseLabels[demoPhase()] ?? demoPhase()}</p>
  </div>
{/if}

<style>
  .demo-choreography {
    position: absolute;
    bottom: 3rem;
    left: 50%;
    transform: translateX(-50%);
    z-index: var(--z-journey-block);
    display: flex;
    flex-direction: column-reverse;
    align-items: center;
    gap: 0.55rem;
    pointer-events: none;
  }
  .demo-choreography > * {
    pointer-events: auto;
  }
  .demo-dismiss {
    background: rgba(7, 16, 24, 0.8);
    border: 1px solid rgba(var(--color-primary-alt-rgb), 0.2);
    color: var(--color-text-teal-dark);
    font-size: 1rem;
    width: 44px;
    height: 44px;
    border-radius: 50%;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: color 0.15s, border-color 0.15s;
    padding: 0;
    line-height: 1;
  }
  .demo-dismiss::before {
    content: '\00d7';
    font-size: 1.2rem;
    line-height: 1;
  }
  .demo-dismiss:hover {
    color: var(--color-text-teal-light);
    border-color: rgba(var(--color-primary-alt-rgb), 0.5);
  }
  .demo-dismiss:focus-visible {
    outline: 2px solid rgba(var(--color-primary-alt-rgb), 0.6);
    outline-offset: 2px;
  }
  .demo-status {
    font-size: 0.95rem;
    line-height: 1.25;
    color: rgba(231, 240, 240, 0.92);
    text-align: center;
    padding: 0.55rem 1.1rem;
    background: rgba(7, 16, 24, 0.85);
    border: 1px solid rgba(var(--color-primary-alt-rgb), 0.35);
    border-radius: 999px;
    box-shadow: 0 4px 24px rgba(0, 0, 0, 0.4);
    max-width: min(560px, 80vw);
  }
</style>
