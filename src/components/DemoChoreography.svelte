<!--
  @components/DemoChoreography.svelte — Full-featured 10-phase auto-demo showcase
-->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { guardReducedMotion } from '@lib/demo/guards';
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
    isPlaceholderSurface,
    markDemoCompleted,
    markDemoSessionSkipped,
    resetDemo,
    DEMO_START_DELAY_MS,
    MAX_START_RETRIES
  } from '@lib/stores/demo.svelte.ts';
  import { DEMO_SCRIPT } from '@lib/demo/demo-script';
  import type { DemoPhase } from '@lib/stores/demo.svelte.ts';
  import { getBusinessRecords } from '@lib/stores/index.svelte.ts';
  import { showToastSpec, dismissToast } from '@lib/stores/toast.svelte';
  import { sceneReady } from '@lib/stores/scene-ready.svelte';
  import { debugWarn } from '@lib/utils/debug';

  // M12-M15 demo-cleanup: canonical 10-phase is the sole entry now.
  // initMicroDemo() (legacy 6-phase) is deprecated (M12). Keyboard-help's
  // replay dispatches 'demo-replay-requested' consumed here — cancels any
  // active veil, clears session gate, resets guards, re-runs attemptStart
  // after sceneReady so veils don't stack (M15) and guard doesn't latch (M13).

  interface Props {
    force?: boolean;
    suppress?: boolean;
  }

  let { force = false, suppress = false }: Props = $props();

  let eligible = $state(true);

  /**
   * T6 fix: the offerHintWhenReady / startWhenReady poll loops self-recurse via
   * bare setTimeout(..., 200) while waiting for the scene. They are not part of
   * the tracked scheduleDemoTimer list, so an unmount mid-poll could keep firing
   * them (post-mount state writes). Set on destroy and checked at the top of
   * each loop so recursion stops immediately after teardown.
   */
  let unmounted = false;

  const FORCED_START_DELAY_MS = 800;
  const RETRY_START_DELAY_MS = 500;
  /**
   * C fix: below this corpus size the demo's search-dependent phases
   * (SEARCH/FOCUS/THREADS/TRAIL/DIVE/FILTER) no-op — the tour becomes
   * captions-only over an unfiltered scene. Real corpus = 8,406; the mock
   * fallback (backend down) serves ~20. Guard: skip the tour + show the
   * getting-started hint instead.
   */
  const MOCK_CORPUS_MIN = 100;
  /** Delay before the fallback onboarding toast appears after splash dismissal. */
  const FALLBACK_HINT_DELAY_MS = 2500;
  /** Maximum time to wait for the 3D scene to become ready before falling back. */
  const SCENE_READY_TIMEOUT_MS = 10000;

  /**
   * Track whether the user has interacted since mount. If they have, the
   * fallback toast is suppressed — showing a "click any dot to explore"
   * hint on top of someone already exploring is noise, not help.
   * Closes the Phase 2 welcome-sequence pile-up (Scout B Rec #4).
   *
   * W51 fix: also cancel the auto-demo so user exploration interrupts the
   * choreography immediately (timers cleared, phase set to CANCELLED,
   * overlay removed). Without this, clicking a 3D dot during the demo was
   * silently swallowed and the 10-phase tour continued running.
   */
  let userInteractedSinceMount = false;
  let interactionDismissed = false;
  let markInteractionFired = false; // gate: 1st-interaction fires before demo starts
  const interactionAbortController = new AbortController();
  function markInteraction(e: Event): void {
    // Ignore interactions that originate inside an open modal dialog (e.g.
    // the first-visit help dialog). Those events should be consumed by the
    // dialog itself — closing the dialog must not be treated as an
    // exploration interaction that cancels the auto-demo.
    const target = e.target
    if (target instanceof Node) {
      const openDialog = document.querySelector('dialog[open]')
      if (openDialog && openDialog.contains(target)) return
      // The demo's own dismiss button and other chrome handle themselves;
      // don't let the document-level capture listener tear the demo down
      // before the button's onclick can complete the click gesture.
      const demoChrome = document.getElementById('demo-choreography')
      if (demoChrome && demoChrome.contains(target)) return
    }
    userInteractedSinceMount = true;
    // Dismiss the fallback toast on the first user interaction so it
    // doesn't linger over the map (M3).
    if (!interactionDismissed) {
      dismissToast();
      interactionDismissed = true;
    }
    // W51: cancel the auto-demo so user exploration wins.
    // Only cancel on genuine gestures (click/tap/key) — hover/mouse-move
    // events must NOT cancel the demo, because Playwright's click action
    // performs a hover pointermove before the actual click, which would
    // tear down the demo and make the dismiss button target disappear.
    const cancelDemoEventTypes = new Set(['pointerdown', 'click', 'touchstart', 'keydown'])
    if (isDemoActive() && cancelDemoEventTypes.has(e.type)) {
      dismissDemo();
    }
    // First interaction fires BEFORE the demo has started (splash/placeholder
    // CTA). Don't abort the controller on that call — leave it alive so
    // attachInteractionListeners can successfully register capture-phase
    // handlers for post-start exploration clicks.
    if (markInteractionFired) {
      interactionAbortController.abort();
    } else {
      markInteractionFired = true;
    }
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

  const TERMINAL_DEMO_PHASES: ReadonlySet<DemoPhase> = new Set(['IDLE', 'COMPLETE', 'CANCELLED'])

  /**
   * Single source of truth for captions: DEMO_SCRIPT (step.caption). The old
   * component-local phaseLabels map drifted from the script's captions (B fix:
   * "Follow the trail" vs "Follow a thread"). Terminal phases render nothing.
   */
  function captionFor(phase: DemoPhase): string {
    if (TERMINAL_DEMO_PHASES.has(phase)) return ''
    return DEMO_SCRIPT.find((step) => step.phase === phase)?.caption() ?? phase
  }

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
    // Defer cancellation one frame so the real click event that triggered
    // this handler can complete before the #demo-choreography element is
    // removed from the DOM. Without this, Playwright's click action may see
    // the target detach mid-gesture and report a timeout.
    cancelAllDemoTimers();
    requestAnimationFrame(() => cancelDemo());
  }

  function runDemoSequence() {
    let i = 0;
    const runNext = async () => {
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
      // Await the action (bounded) so slow async steps gate the next phase —
      // the captions must not outrun the scene. Previously actions were fired
      // without awaiting, so a search settling in 15-20s (API queued behind
      // static downloads in split-origin test envs) left SEARCH/FOCUS phases
      // showing captions over zero results. Bound = 3x the phase duration so
      // a pathological action can never stall the tour forever.
      const actionP = Promise.resolve(step.action()).catch((err) => {
        if (import.meta.env.DEV) {
          console.error(`[DemoChoreography] Step "${step.phase}" failed; advancing anyway.`, err);
        }
      });
      await Promise.race([actionP, new Promise((resolve) => setTimeout(resolve, step.durationMs * 3))]);
      // Guard (P1, fleet 2 sweep 2026-08-07): cancelDemo/replay can fire DURING
      // the await above — the tracked timer list only covers already-scheduled
      // timers, so without this check a timer registered after cancel would
      // resurrect a CANCELLED demo (or race a replay's independent iterator).
      if (!isDemoActive()) return;
      // Schedule the next step after this phase's duration
      scheduleDemoTimer(() => {
        i++;
        runNext();
      }, step.durationMs);
    };
    runNext();
  }

  function attemptStart(remainingAttempts = MAX_START_RETRIES) {
    // BS-B#5: never drive the 10-phase tour over the static 2D placeholder —
    // the camera/search phases cannot render on the placeholder surface, so
    // the tour would degrade into ~10s of disembodied captions over a static
    // map (no 3D to narrate). This is the pre-start backstop for start paths
    // that bypass shouldRunDemo() (e.g. keyboard-help replay); the onMount
    // eligibility gate already skips the auto path. By the time the scene is
    // ready the attr has flipped to 'webgl' (W46-F1), so a real 3D surface is
    // never blocked. A FORCED demo (?demo=force) bypasses (debug path) —
    // mirroring the MOCK_CORPUS_MIN force bypass below.
    if (!force && isPlaceholderSurface()) {
      eligible = false;
      scheduleDemoTimer(() => showFallbackHint(), FALLBACK_HINT_DELAY_MS);
      return;
    }
    const records = getBusinessRecords();
    const nodeIndex = findDemoNode(records);
    if (nodeIndex === null) {
      // Records may not be hydrated yet (data-worker loads asynchronously).
      // Keep polling without burning a retry while the corpus is empty.
      if (records.length === 0 && remainingAttempts > 0) {
        // W53 fix: decrement even on empty records — previously reused the same
        // remainingAttempts, causing an infinite poll if the data worker never hydrates.
        scheduleDemoTimer(() => attemptStart(remainingAttempts - 1), RETRY_START_DELAY_MS);
        return;
      }
      if (remainingAttempts <= 0) {
        eligible = false;
        // W6 audit: Demo couldn't find a valid node — show fallback hint.
        scheduleDemoTimer(() => showFallbackHint(), FALLBACK_HINT_DELAY_MS);
        return;
      }
      scheduleDemoTimer(() => attemptStart(remainingAttempts - 1), RETRY_START_DELAY_MS);
      return;
    }

    // C fix: a degraded (mock-fallback) corpus cannot drive the
    // search-dependent tour phases — skip the demo + offer the fallback hint.
    // A FORCED demo (?demo=force) bypasses the guard (debug path).
    if (records.length < MOCK_CORPUS_MIN && !force) {
      eligible = false;
      scheduleDemoTimer(() => showFallbackHint(), FALLBACK_HINT_DELAY_MS);
      return;
    }

    // Atomic guard: startDemo() returns false if another attempt already
    // claimed the guard (race between retry loop and a parallel start path).
    // If blocked, silently drop — the winning start owns the sequence.
    if (!startDemo()) return;
    runDemoSequence();
  }

  // Replay helper: canonical path that prevents stacked veils (M15)
  function requestReplay(): void {
    // W58: replay must respect the explicit suppress (?nodemo=1) guard.
    // Without this check, keyboard-help "Replay tour" can start the demo
    // even when the user explicitly opted out via URL param.
    if (suppress) return
    // P2 (fleet wave 3 sweep 2026-08-07): replay must ALSO respect the
    // reduced-motion guard — shouldRunDemo deliberately blocks reduced-motion
    // users (demo.svelte.ts:271-275), but requestReplay bypassed it, giving them
    // exactly the frozen confusing sequence the guard exists to prevent.
    if (!guardReducedMotion()) return
    cancelAllDemoTimers()
    if (isDemoActive()) cancelDemo()
    try { resetDemo() } catch { /* no-op: teardown race */ }
    try { sessionStorage.removeItem('moco_mycelium_demo_session_v1') } catch { /* no-op: storage may be unavailable during teardown */ }
    eligible = true
    unmounted = false
    const replayStart = performance.now()
    const wait = (): void => {
      if (unmounted) return
      if (sceneReady.value) { attemptStart(); return }
      if (performance.now() - replayStart > SCENE_READY_TIMEOUT_MS) { attemptStart(); return }
      // W53 fix: route through scheduleDemoTimer so cancelAllDemoTimers() can
      // cancel the replay poll (previously bare setTimeout IDs were untracked).
      scheduleDemoTimer(() => wait(), 200)
    }
    scheduleDemoTimer(() => wait(), 300)
  }

  let replayListener: ((_e: Event) => void) | null = null

  onMount(() => {
    replayListener = () => {
      requestReplay()
      // W7 F2 fix: ack the canonical replay path so the keyboard-help side
      // knows the replay actually started (avoids the 500ms no-ack fallback
      // toast that previously fired on every demo-cancelled during replay).
      document.dispatchEvent(new CustomEvent('demo-replay-acknowledged'))
    }
    document.addEventListener('demo-replay-requested', replayListener as EventListener)

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
        if (unmounted) return;
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
      if (unmounted) return;
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
    unmounted = true;
    cancelAllDemoTimers();
    interactionAbortController.abort();
    if (replayListener) document.removeEventListener('demo-replay-requested', replayListener as EventListener)
    replayListener = null
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
    <p class="demo-status">{captionFor(demoPhase())}</p>
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
