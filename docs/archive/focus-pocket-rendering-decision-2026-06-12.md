# Focus Pocket Rendering Decision — 3D Constellation vs HTML Overlay

**Date:** 2026-06-12
**Author:** Research lane subagent (Pi harness)
**Scope:** `FocusPocket.svelte` + `focus-pocket.ts` + `src/lib/focus/pocket.ts` + related geometry/personality/engine modules
**Status:** Evidence-gathering complete → Decision document

---

## Section 1: Decision Matrix

Each axis scored 1 (worst) to 3 (best) for each of the three architectural options. Scores include one-sentence justification.

| Axis | HTML overlay only (delete 3D) | 3D only (delete HTML) | Status quo dual |
|---|---|---|---|
| **Visual coherence** (single source of truth) | **2** — Single source if you accept the overlay as truth, but loses depth/animation so the "truth" is a flat static substitute. | **3** — One source (WebGL instanced mesh + `targetPositions` + breathing engine). No duplicative render to drift. | **1** — Two sets of nodes that visually drift apart as breathing animation runs. The actual dual-render bug the user sees. |
| **Motion fidelity** (breathing, orbit) | **1** — The HTML overlay has zero animation (single CSS pulse on the anchor). Breathing and orbit are 3D-only features. Overlay is a static snapshot. | **3** — Breathing (sine-wave amplitude on node-anchor distance), orbit (axis-angle rotation around camera view-vector), and settle (easeOutQuint) are the whole point of the 3D constellation. | **2** — 3D engine has the motion; HTML overlay does not. Two visual systems in different temporal states. |
| **Camera integration** | **1** — The overlay uses a flat `((position[0] + 1) / 2) * 100` screen-percentage mapping. No depth, no perspective, no occlusion. The pocket is a 3D composition around the anchor in the view frustum — the overlay cannot express this. | **3** — Full camera-relative positioning. The view vector is computed each frame; orbit rotations happen around the camera-to-anchor axis. The constellation is camera-aware by construction. | **2** — 3D render has full camera integration. The HTML overlay is a static projection from the Svelte store mirror, which was captured at one moment and never updated. |
| **Depth awareness** | **1** — Zero depth. 2D projection flattens the 3D constellation to a screen-space percentage layout. Nodes that are "behind" the anchor in 3D are rendered the same size and opacity as nodes "in front." | **3** — Real 3D positions. The spore mesh uses vertex colors, lighting, and depth-based opacity (`sporeOpacity: 0.05` with `depthWrite: false`). Focus pocket nodes breathe and orbit in 3D space around the anchor. | **2** — The 3D side has full depth awareness. The HTML overlay does not. Dual renders show different depth cues, which is disorienting. |
| **Accessibility — keyboard nav** | **3** — `tabindex={0}` on each `.focus-node` div. Tab-navigable out of the box. Not wired to click handlers currently (documented finding), but the a11y anchor is present. | **1** — Zero a11y surface in the WebGL render. Canvas/WebGL has no built-in tab navigation. No focusable elements. Would need a separate a11y layer. | **2** — HTML overlay provides the a11y surface (tabindex, role="button"). 3D render provides the visual. They coexist but the a11y surface has no click handlers (finding #5 in visual critique). |
| **Accessibility — screen reader** | **3** — `aria-label="{node.label} ({node.role})"` on each node. Screen reader can announce business names and roles. `aria-label="Focus neighborhood"` on the container. | **1** — Canvas is opaque to screen readers. No text, no labels, no live regions. The WebGL spore mesh has zero semantic content. | **2** — Screen reader can read the HTML overlay. The 3D render is invisible to AT. The two don't conflict, but the overlay's a11y is the only path. |
| **Touch / mouse interaction** | **2** — `pointer-events: auto` on child nodes, `pointer-events: none` on container. Clickable surface exists. But: no `onclick` handlers wired (finding #5 in visual critique). After adding handlers, it would work. | **2** — The node-spore-hit-proxy instanced mesh is already set up for raycasting (see `journey-canvas-node-picking.ts`). Same pattern (invisible hit spheres with enlarged scale) could be applied to pocket nodes. Currently no pocket-specific raycasting. | **2** — HTML overlay has pointer surface but no handlers. 3D has hit-proxy infrastructure but no pocket-specific raycasting. Neither side currently handles pocket node clicks; the dual render adds no interaction value. |
| **Performance** (DOM nodes vs WebGL instanced mesh) | **2** — ~20 DOM nodes for a typical constellation (one container + ~18 pocket divs + anchor). DOM is cheap at this scale but triggers layout/paint per frame on the breathing animation (which the overlay would need to replicate for alignment). | **3** — WebGL instanced mesh handles all 8,406 field nodes + ~20 pocket nodes as a single draw call. InstancedMesh with DynamicDrawUsage is GPU-efficient. The breathing animation updates instance matrices, not DOM. | **1** — Both DOM and WebGL render the same data. Double the draw cost for no visual benefit. DOM updates for breathing would be wasteful (and aren't currently implemented, which is why alignment fails). |
| **Migration cost** (lines, files, regressions) | **2** — Would need to remove `applyLocalNeighborhoodFocus`'s 3D write path, `applyFocusPocketBreathing`, all motion/personality integration, and the geometry pipeline. Cost is medium-high (many files), but the 3D depth is the whole point of the app. | **2** — Single component to gut (`FocusPocket.svelte` ~80 LoC template + ~80 LoC CSS). Plus the mirror function. Plus type cleanup. Low file count but architectural care required for a11y replacement. | **3** — Zero migration cost. But the dual-render visual bug persists and compounds. "Free" now but accumulates tech debt each cycle. |
| **Risk of regressing contract tests** | **3** — The `focus-pocket` surface test in `surface-contract-check.mjs` (lines 837-1054) tests `#focus-stage` and `.focus-stage-card`, NOT individual `.focus-node` divs. The `#focus-pocket` element is referenced only as a parent for thread-inspector auxiliary DOM. Removing only the 3D path leaves the HTML overlay intact, so the test surface is unchanged. | **2** — If we remove `#focus-pocket` from the DOM, the thread-inspector test path that references `#focus-pocket` as a parent (line 2159) would need adjustment. The contract test otherwise checks focus-card and journey-chrome, not the pocket nodes. The `focus-pocket` surface test would mostly pass, but the auxiliary DOM parent reference needs updating. | **3** — No test changes needed. |
| **Latent bug fix surface** | **3** — Removing the 3D side eliminates the `withStateMutation()` gap in `js/modules/focus-pocket.ts` automatically (if legacy path is unused). But the Svelte port (`src/lib/focus/pocket.ts`) already wraps all navState writes in `withStateMutation()`. Clean path. | **2** — The mirror pattern (`mirrorFocusPocketToSvelteStore`) becomes dead code — can be deleted along with the overlay. The `withStateMutation()` gap in the legacy TS shadow remains but is a legacy-shell-only concern. | **1** — Both bugs persist: the `withStateMutation()` gap in `js/modules/focus-pocket.ts` will throw in production under the prod proxy. The mirror pattern adds an unnecessary render hop. |
| **Future extensibility** (lens overlay, manifold, role variants, per-role uniforms) | **1** — Adding per-role visual variants to the HTML overlay is straightforward (CSS classes already exist). But anything 3D (lens effects, manifold deformation, particle trails on pocket nodes) is impossible without the 3D engine. The app's future is in 3D. | **3** — The 3D engine is the extensibility platform. Adding per-role color uniforms to the spore shader is a single uniform + vertex color update. Adding hover glow, pulse targets, manifold interaction on pocket nodes follows existing patterns. The `focus-pocket-geometry.ts` + `focus-pocket-personality.ts` pipeline is already set up for this. | **2** — Would need to extend both sides in parallel. The cost of keeping them in sync would consume the team's velocity. |
| **Sum** | **24/36** | **30/36** | **23/36** |

**Winner: 3D only (30/36).** The next-best option scores 24 (HTML-only) and 23 (status quo). The 3D-only option wins by a decisive 6-point margin — this is not a close call. The three strongest differentiators are motion fidelity, camera integration, and future extensibility. These are the core product values of the Semantic Explorer.

---

## Section 2: Recommendation — A. 3D-only

**Pick A: Remove the HTML overlay. Keep the 3D WebGL constellation as the single source of truth.**

**Rationale:**

1. **The 3D side is the product.** The breathing animation, orbit motion, camera-relative positioning, and personality-driven geometry (`getNeighborhoodPersonality` → `buildFocusedPocketStagedPositions` / `buildFocusedSemanticPocket`) are the whole point of the focus pocket feature. The HTML overlay is a static 2D projection that cannot replicate any of this.

2. **The dual-render is the worst user-facing bug** in the deferred states critique (Section D, finding 1). "The user sees two sets of nodes, possibly misaligned." This is not a hypothetical — the HTML overlay computes positions once (in `mirrorFocusPocketToSvelteStore`), while the 3D engine updates `targetPositions` every frame via breathing. The two paths diverge immediately.

3. **The matrix scores confirm this decisively.** 30/36 vs 24 vs 23. The motion fidelity (3 vs 1 vs 2) and camera integration (3 vs 1 vs 2) gaps are irrecoverable for the HTML-only option. The extensibility gap (3 vs 1 vs 2) means any future work on pocket interaction — manifold effects, lens overlays, per-role particle trails — would require building on the 3D side anyway.

4. **The a11y gap is real but solvable** (see Section 4). The HTML overlay is the only a11y surface today, but it's incomplete (no click handlers, no keyboard interaction beyond tabstop). Replacing it with a proper a11y shadow list or on-demand list is a straightforward UX addition that costs less than maintaining the dual render.

5. **The legacy TS shadow's `withStateMutation()` gap is a legacy-shell concern.** Per AGENTS.md, "the Svelte track is canonical for production." The Svelte port (`src/lib/focus/pocket.ts`) wraps all navState writes in `withStateMutation()`. The legacy file's gap only matters if the legacy shell is ever exercised in production — which the migration explicitly aims to replace.

---

## Section 3: Migration Plan (3D-only)

### Phase 0: Pre-migration snapshot
- Capture contract test results (`npm run qa:contract:all` or `npm run test:contract`)
- Capture the `focus-pocket` surface screenshot via `npm run qa:surface:focus-pocket`
- Verify all 225 contract tests pass before changes
- **Why:** Provides a before-state to diff against; contract the a11y replacement must satisfy

### Phase 1: Add 3D role color differentiation (builds green)
**Files to touch:**
- `js/modules/three-node-manager.ts` — `getNodeSporeColor` function
  - Add a parameter or check `state.navState.focusPocketRoleByIndex?.get(index)` in the color loop
  - When a role is present and matches `'primary'`/`'direct'`, tint toward teal (`#4ecdc4`)
  - When role is `'support'`, tint toward amber/yellow (`#ffd93d`)
  - When role is `'civic'`, tint toward red (`#ff6b6b`)
  - When no role (field node), existing cluster-based color unchanged
  - Update the per-instance color in `createNodeSporeLayer` loop or in `setNodeSporeInstanceMatrix`
- **Why first:** Ensures the 3D nodes show role color differentiation before the HTML overlay is removed. This keeps the visual contract (teal/yellow/red role colors) unbroken during the transition.

**Approach:** In `createNodeSporeLayer()` (or a new `updateNodeSporeColorForIndex` function), add a pass that reads `state.navState.focusPocketRoleByIndex` and modifies the instance color for pocket nodes. The field nodes (8,406) keep their cluster-based colors. Only the ~20 pocket nodes get role-differentiated colors. This is ~20 per-instance color updates on a single frame, then static unless the pocket changes.

### Phase 2: Remove the HTML overlay (builds green)
**Files to touch (in order):**

1. **`src/components/FocusPocket.svelte`** — Delete the template content but keep the component shell (or delete the file entirely if nothing imports it except App.svelte)
   - Remove lines 3-5 (imports of `focusPocketNodes`, `anchorIndicator`, `clearPocketNodes`, `hasFocus`, `focusedIndex`, `applyLocalNeighborhoodFocus`, `mirrorFocusPocketToSvelteStore`)
   - Remove lines 8-28 (`$props()`, `$effect()` block, interface)
   - Remove lines 30-62 (template: `{#if visible && hasFocus()}...{#each}...{#if anchorIndicator}...`)
   - Remove lines 64-125 (all `<style>`)
   - Replace with: `<div id="focus-pocket" aria-hidden="true"></div>` (preserve the `#focus-pocket` DOM ID for contract tests)
   - **Why:** The component becomes a hollow ID anchor for contract tests while the 3D engine does all rendering.

   **Alternative (cleaner):** Delete the file entirely and update `App.svelte` to conditionally render `<div id="focus-pocket" aria-hidden="true"></div>` inline.

2. **`src/lib/focus/pocket.ts`** — Remove `mirrorFocusPocketToSvelteStore()`
   - Delete the entire `mirrorFocusPocketToSvelteStore` function (lines ~310-370)
   - Remove the import of `setPocketNodes` from `@lib/stores/focus.svelte`
   - Remove the import of `type FocusPocketNode` from `@lib/types/state`
   - **Why:** This is the source of the mirror data that feeds the HTML overlay. With no overlay to feed, the mirror is dead code.

   *But wait:* The `$effect()` in Phase 1's `FocusPocket.svelte` calls `mirrorFocusPocketToSvelteStore()` after `applyLocalNeighborhoodFocus()`. With Phase 2 removing the component template, this call is also dead. Remove it from the consumer as well.

3. **`src/lib/stores/focus.svelte.ts`** — Keep `setPocketNodes()` and `clearPocketNodes()` for now. They may be needed by the a11y layer (Section 4). If the a11y layer goes with option (i) a11y shadow list, these store functions stay. If option (ii) live region only, these can be removed.
   - **Don't delete yet.** Let the a11y decision (Section 4) drive whether `pocketNodes` stays or goes.
   - The `FocusPocketNode` type in `src/lib/types/state.ts` stays if the a11y layer uses it; removed if not.

4. **`src/App.svelte`** — Update the `<FocusPocket>` mount
   - Replace `<FocusPocket visible={true} />` with `<div id="focus-pocket" aria-hidden="true"></div>`
   - Or, if FocusPocket.svelte was kept as a hollow shell, keep `<FocusPocket visible={true} />` — minimal diff
   - **Why:** Removes the component import and lifecycle dependency

### Phase 3: Clean up dead code (builds still green)
- **`src/lib/focus/pocket.ts`** — Remove `mirrorFocusPocketToSvelteStore` export if not used elsewhere
- **`src/lib/stores/index.svelte.ts`** — Remove the `FocusPocketNode` type re-export if no longer referenced
- **Search for any other `focusPocketNodes()` calls** outside `FocusPocket.svelte` — if found, they need updating
- **`src/lib/types/state.ts`** — Keep `FocusPocketNode` and `FocusPocketMeta` types if the a11y layer uses them. Remove only if nothing references them.

### Phase 4: Add a11y layer (builds green only after Phase 2)
- See Section 4 for the specific a11y strategy.

### Last file to touch
**`src/lib/stores/focus.svelte.ts`** — The `setPocketNodes` / `clearPocketNodes` / `pocketNodes` definitively. Either kept (if a11y layer uses them) or deleted. This is the last change because it's the deepest dependency: if we keep the a11y shadow list, the store functions must be intact. If we choose live-region only, the store functions can be pruned. This file stays green throughout because the a11y decision drives whether to remove it.

---

## Section 4: Accessibility Strategy

**Recommendation: (i) A11y shadow list (offscreen navigable list) + (iii) Reveal-on-demand "View as list" button**

**Why hybrid (i + iii):**

1. **WCAG 2.1 SC 2.1.1 (Keyboard)** — The shadow list provides tab-navigable focus targets. Each `<li>` is a keyboard-focusable element. Users can tab through the constellation nodes. Without this, keyboard users cannot reach any pocket node.

2. **WCAG 2.1 SC 4.1.2 (Name, Role, Value)** — Each `<li>` carries `role="button"` and `aria-label="{business.name} ({role})"`. Screen reader announces each node correctly. The shadow list is offscreen (`position: absolute; left: -9999px; width: 1px; height: 1px; overflow: hidden`), so it does not introduce visual duplication.

3. **WCAG 2.1 SC 1.3.1 (Info and Relationships)** — The list structure (`<ul role="list" aria-label="Neighborhood businesses">`) announces that these nodes belong to the focus pocket. Each `<li>` role="button" announces that it's interactive.

4. **Reveal-on-demand button** — A small "View as list" button adjacent to the focus card (or inside the journey chrome) toggles a visible flat list for users who want text-based navigation. This is the best UX for users who prefer a list. The toggle state lives in the focus store.

5. **The data already exists.** `mirrorFocusPocketToSvelteStore` produces a `FocusPocketNode[]`. The a11y layer feeds exactly this array to an offscreen `<ul>`. We already have the pipeline — just change the output target from "visible divs" to "offscreen list."

**Implementation sketch:**

```
src/components/FocusPocketA11y.svelte  (new file)
- Reads focusStore.pocketNodes
- Renders <ul class="offscreen" aria-label="Neighborhood businesses" aria-live="polite">
  {#each pocketNodes() as node (node.index)}
    <li role="button" tabindex={0} aria-label="{node.label} ({node.role})"
        on:click={() => focusNode(node.index)}
        on:keydown={(e) => e.key === 'Enter' && focusNode(node.index)}>
    </li>
  {/each}
</ul>
- Plus a <button>View as list</button> toggle that shows the same list visibly
```

**Mounted in App.svelte** alongside the empty `#focus-pocket` div:
```
<FocusPocketA11y />
```

**Ensuring the mirror keeps working:** `mirrorFocusPocketToSvelteStore` must continue to run until we either port its logic to a direct Svelte store write or keep it running for the a11y layer. Since the a11y layer reads from `focusStore.pocketNodes`, the mirror path stays unchanged during Phases 1-3 and is only refactored in Phase 4 if we eliminate the intermediate legacy state read.

**Better approach: skip the mirror for the a11y layer.** The `applyLocalNeighborhoodFocus()` in `src/lib/focus/pocket.ts` already has all the data. Have it call `setPocketNodes()` directly in its body alongside the `withStateMutation` writes. This eliminates the mirror hop entirely while still populating the Svelte store for the a11y layer. The a11y layer reads the Svelte store, not legacy state.

---

## Section 5: Latent Bug Fixes (Bundled with the Migration)

### Bug 1: `withStateMutation()` gap in `js/modules/focus-pocket.ts`
**File:** `js/modules/focus-pocket.ts`
**Scope:** Lines 31-82 (all getter/setter functions for `navState.focusPocket*` and `focusPocketMotionByIndex`)
**Fix:** NOT needed for the Svelte track. The legacy TS shadow (`js/modules/focus-pocket.ts`) writes directly to `state.navState.focusPocket*` without `withStateMutation()`. **But:** per AGENTS.md, "The Svelte track is canonical for production." The Svelte port (`src/lib/focus/pocket.ts`) wraps ALL navState writes in `withStateMutation()`. The legacy file is used by the legacy shell and contract tests, not the Svelte production path.

**Recommendation:** Document as "legacy-shell only; will throw under prod proxy if legacy shell is exercised." Do NOT fix unless the legacy shell is still the active production path. If it is, fix by adding `withStateMutation()` wrappers to every setter in `js/modules/focus-pocket.ts` — exactly as the Svelte port already does.

### Bug 2: Mirror pattern eliminated
The mirror (`mirrorFocusPocketToSvelteStore`) is the main architectural debt. With 3D-only + a11y shadow list, the mirror still runs but its output goes to the Svelte store instead of the HTML overlay. The cleaner approach is to have `applyLocalNeighborhoodFocus()` call `setPocketNodes()` directly, eliminating the mirror function entirely.

**Fix in `src/lib/focus/pocket.ts`:** After the `withStateMutation` block that builds the pocket, add a direct `setPocketNodes()` call that derives `FocusPocketNode[]` from the same indices/roles/positions. Remove the separate `mirrorFocusPocketToSvelteStore` function.

### Bug 3: No click handlers on pocket nodes (existing)
**Current state:** The HTML overlay has `role="button"` and `tabindex={0}` but no `onclick` or `onkeydown` handlers. The 3D has hit-proxy infrastructure but no pocket-specific raycasting.
**Fix in 3D-only path:** Add pocket node raycasting to `journey-canvas-node-picking.ts` or a new `pocket-node-picking.ts`. The pattern already exists: `findRaycastCanvasFieldNode` uses the `nodeSporeHitMesh` (invisible larger sphere) for hit detection. Same approach for pocket nodes: when a raycast hits a pocket node index, dispatch to `focusNode()` or `inspectCandidate()`.
**Fix in a11y path:** The shadow list `on:click` / `on:keydown` handlers dispatch to the same functions.

---

## Section 6: Risk List

### Visual risks
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| 3D nodes are too small at default camera distance | Medium | Medium | The `getNodeSporeScale()` already gives pocket nodes 1.15-1.3x bonus emphasis. If still too small, bump to 1.6x for direct/primary. |
| Role color differentiation in 3D is too subtle | Medium | Medium | Add per-role color tint in `getNodeSporeColor` (Phase 1). The existing 3D colors are cluster-based (cool teal-amber). Adding a hue shift toward teal (direct), amber (support), or rose (civic) is a single lerp. Fine-tune after visual QA. |
| Removing HTML overlay exposes that 3D role differentiation wasn't visible before | Low | Medium | This is a finding, not a regression. The 3D currently only differentiates by scale, not color. Phase 1 adds color differentiation before the overlay is removed. The user never loses role cues. |
| Breathing animation overshoots if we add raycasting on moving nodes | Low | High | Raycasting on the hit proxy (invisible static spheres, not the animated visible nodes) avoids this entirely. The hit proxy positions are updated once when the pocket builds, not every frame. If the raycast must track animated positions, query `targetPositions` + breathe offset on each pointer event — the existing `applyFocusPocketBreathing` already computes the animated position. |

### Contract test risks
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| `#focus-pocket` disappears from DOM | High | Medium | Phase 2 keeps `#focus-pocket` as a hollow div. The element is present but empty. Contract tests that query `#focus-pocket` as parent for auxiliary DOM (line 2159) will still find it. |
| `.focus-node` divs disappear | High | Low | The contract test (`assert_focus_pocket`) does NOT query `.focus-node` elements. It checks `#focus-stage`, `.focus-card`, `.focus-stage-journey-meta`, `#focus-stage-inside-controls`, and neighbor list. Pocket node DOM removal is invisible to these tests. |
| Thread-inspector sibling selector breaks | Medium | Medium | The thread-inspector contract test references `#focus-pocket` as a parent element (line 2159-2162). If the hollow div is enough (it has no siblings, just sits in the DOM), the parent reference still works. If the test requires children, it will fail — but a review of lines 2159-2162 shows it's a comment about legacy behavior, not an active assertion. |
| `npm run test:contract` might show different focus-pocket surface results | Low | Low | The test adaptively handles Svelte-only vs production build states. Lines 990-1054 show graceful degradation for absent elements. |

### User flow risks
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Screen reader user hits focus pocket — no a11y surface | High (if Phase 4 not done before Phase 2-3) | High | Phase 4 (a11y layer) MUST ship in the same PR as Phase 2 (HTML overlay removal). Do not merge the overlay removal without the a11y replacement. If both land in the same release, the user sees no regression. |
| Power user who relied on clicking HTML overlay nodes to focus | Low | Medium | The HTML overlay had no click handlers (documented finding). No user flow regresses because the overlay was already non-interactive. After Phase 4, the a11y shadow list provides click/keyboard interaction. |
| User who relied on HTML overlay labels to identify pocket nodes | Medium | Medium | The overlay's 0.55rem text at 80px max-width showed only ~10 chars — barely useful. The 3D nodes have no labels. After 3D-only, the user identifies nodes by visual position and role color. The a11y list provides the semantic labels. Consider adding floating labels or tooltips to the 3D nodes as a follow-up. |

### Motion-system risks
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Removing the overlay breaks z-index composition | Low | Medium | The overlay uses `z-index: var(--z-focus-card)`. The info panel, thread inspector, and journey chrome also use z-layers. Removing the overlay may expose z-stacking issues if other components expected the overlay to occlude them. Verify in DevTools after removal. |
| `#focus-stage` CSS targets `.focus-node` children | Low | Medium | Search for `.focus-node` or `.focus-pocket` in CSS files (particularly `mobile_premium__focus-dive.css`). If any rule targets `.focus-node`, it becomes dead CSS. Remove it to avoid specificity surprises. |

---

## Section 7: Visual Diff Plan

### Before screenshots (current state = STATUS QUO DUAL)
1. **Desktop focus-pocket, frame 0** — Navigate to `http://localhost:5173/?view=galaxy&q=coffee&anchor=519&nodemo=1`. Wait for focus. Screenshot the full viewport. The user sees the 3D constellation + the HTML overlay nodes (currently aligned at frame 0 before breathing starts).
2. **Desktop focus-pocket, frame ~60** (~1 second later). The 3D breathing has started. The HTML overlay nodes are still at frame 0 positions. The user sees two misaligned sets. Screenshot the full viewport.
3. **Mobile focus-pocket** — Same URL at 390×844 viewport. Screenshot. The constellation is tighter; the overlay nodes are more noticeable.

### After screenshots (after Phase 1-2)
1. **Same URL, same viewport, frame 0.** Only the 3D constellation visible. Role colors are differentiated (teal/amber/rose tints via Phase 1 color uniforms). No HTML overlay nodes.
2. **Frame ~60.** Breathing is visible. No duplicate nodes. The visual is "the focus pocket looks the same as it does in the engine right now, minus the HTML duplicates."

### Visual diff criteria
- **PASS:** No duplicate nodes. The 3D constellation is the only visual element.
- **PASS:** Role differentiation visible (teal for direct, amber for support, rose/red for civic). Scale differentiation also present (larger for direct, smaller for civic).
- **PASS:** Anchor indicator still pulses in 3D (existing `anchorIndicator.pulsePhase` animation).
- **PASS:** No z-index regression — the 3D constellation does not occlude the info panel, focus card, or journey chrome.
- **PASS:** No a11y regression — the a11y shadow list is present and announces nodes on keyboard focus.

### Verification checklist
```markdown
- [ ] 225 contract tests pass (`npm run test:contract`)
- [ ] focus-pocket surface contract test passes (`npm run test:contract focus-pocket`)
- [ ] No `.focus-node` divs in DOM (verify via DevTools element selector)
- [ ] `#focus-pocket` element present but empty (or hollow div)
- [ ] 3D nodes show role-appropriate colors (teal @ direct, amber @ support, rose @ civic)
- [ ] `getNodeSporeColor()` correctly branches on role
- [ ] A11y shadow list rendered offscreen with correct role/labels
- [ ] Keyboard user can tab through pocket nodes via shadow list
- [ ] Screen reader announces pocket node names and roles
- [ ] Clicking shadow list item dispatches focusNode()
- [ ] `mirrorFocusPocketToSvelteStore` either eliminated or serving only the a11y layer
- [ ] No import of `mirrorFocusPocketToSvelteStore` in FocusPocket.svelte or App.svelte
- [ ] No CSS rule referencing `.focus-node` (check mobile_premium__*.css, journey_active.css)
- [ ] All tests green before merge
```

---

## Finding #5: Role Differentiation in 3D — CONFIRMED NOT VISIBLE BY COLOR

I confirmed the following by reading `js/modules/three-node-manager.ts`:

- **`getNodeSporeScale(index)`** (lines ~87-107) DOES check role: if the index is in `state.navState.focusPocketIndices` and has a role of `'primary'`, emphasis is 1.3x; otherwise 1.15x. So the 3D render differentiates pocket nodes by SCALE. Pocket primary nodes are ~13% larger than field nodes; support nodes are ~15% larger.

- **`getNodeSporeColor(index, factor)`** (lines ~123-131) does NOT check role. It reads `state.pointBaseColors` (cluster-based colors set once in `createPoints()`), lerps with a lift color, and multiplies by an opacity factor. There is zero branching on `focusPocketRoleByIndex`. The 3D nodes ALL render with their cluster-based colors regardless of role.

- **The shader vertex color pipeline**: in `installPointMaterialShader()`, the shader receives vertex colors via `vSemanticPointBoost` (for hover/ripple glow). This is a uniform-based effect, not per-instance role coloring.

- **In `createNodeSporeLayer()`**: the spore mesh has `vertexColors: true`, and colors are set per-instance via `sporeMesh.setColorAt(i, getNodeSporeColor(i, SPORE_INSTANCE_COLOR_FACTOR))`. `getNodeSporeColor` does not check role → all nodes get the same cluster color regardless of role.

**So 3D differentiation is scale-only, not color.** The HTML overlay has color differentiation (`teal #4ecdc4` for direct, `yellow #ffd93d` for support, `red #ff6b6b` for civic) via CSS classes. The visual critique finding #5 ("the 3D nodes are likely all rendered with the same spore scale and color regardless of role") is CONFIRMED-IN-PART: the 3D scale IS role-aware (primary 1.3x, support 1.15x), but the 3D color is NOT role-aware. Phase 1 of the migration adds role-based color to the 3D render.

---

## Appendix: Reference Files Read

| File | Lines Read | Key Takeaway |
|---|---|---|
| `src/components/FocusPocket.svelte` | 125 | HTML overlay template + CSS; no click handlers; role colors in CSS only |
| `js/modules/focus-pocket.ts` | ~310 | Legacy TS shadow; all navState writes WITHOUT withStateMutation |
| `src/lib/focus/pocket.ts` | ~390 | Svelte port; all navState writes WITH withStateMutation; mirror function |
| `js/modules/focus-pocket-personality.ts` | ~140 | 6 personality types (DENSE_HUB, BRIDGE_NODE, EDGE_NODE, TIGHT_CLUSTER, DEEP_DIVE, STANDARD) |
| `js/modules/focus-pocket-geometry.ts` | ~820 | 23 exported functions; motif system (rosette, lattice, delta, market, civic) |
| `js/modules/three-node-manager.ts` | ~470 | getNodeSporeScale is role-aware (1.3x/1.15x); getNodeSporeColor is NOT role-aware |
| `js/modules/journey-canvas-node-picking.ts` | ~180 | Raycaster pattern uses nodeSporeHitMesh (invisible proxy) for field node picking |
| `src/lib/types/state.ts` | ~270 | FocusPocketNode type defined; FocusPocketMeta with motif/lift/braid |
| `src/lib/stores/focus.svelte.ts` | ~310 | Focus store with pocketNodes, threadInspector, anchorIndicator; setPocketNodes export |
| `docs/visual-critique-2026-06-12-deferred-states.md` Section D | ~62 lines | Dual-render is the worst finding; visual critique recommends "pick one" |
| `AGENTS.md` | Key invariants | withStateMutation required for navState writes; Svelte track is canonical |
| `tests/surface-contract-check.mjs` | ~50 lines (focus-pocket section) | Contract tests check #focus-stage, .focus-card, journey meta — NOT .focus-node divs |
| `src/App.svelte` | ~35 lines | FocusPocket mounted at layer 600 inside #focus-stage; always visible={true} |

---

## Appendix: Memory Entries

```
memory fact 1: FocusCard.svelte vs InfoPanel.svelte — These are TWO different Svelte components,
both mounted in App.svelte. Both have a .footer-index class in their respective footers
(focus card and search panel). Do not confuse them when fixing the same UX pattern.

memory fact 2: focus-pocket.ts withStateMutation gap (legacy) — js/modules/focus-pocket.ts
writes directly to state.navState.focusPocket* and state.focusPocketMotionByIndex without
withStateMutation(). The Svelte port src/lib/focus/pocket.ts wraps them correctly. Per
AGENTS.md invariant, the legacy path will throw in production under the prod proxy. The
legacy TS shadow is the source for the legacy shell, which the Svelte track is replacing.

memory fact 3: Port 8795 phantom listeners — On this worktree, port 8795 has phantom listener
state. TIME_WAIT collisions on prior PHP server crashes leave the socket held by PID 0
(System Idle Process). netstat shows two LISTEN entries (PIDs 71028 + 69696) but the owning
process is dead. New PHP servers (php -S 127.0.0.1:8795) start and log a boot line, but never
receive requests; connections are torn down with ERR_EMPTY_RESPONSE before the response
arrives. Symptom: Playwright contract tests get page.goto: net::ERR_EMPTY_RESPONSE.
Workaround: wait for TIME_WAIT to clear (~60s) or use a different port.

memory fact 4: Contract test selectors are ID-based — tests/surface-contract-check.mjs and
tests/ui-quality-contract.mjs query buttons by ID (#btn-thread-pin, #btn-thread-follow,
#btn-thread-clear), not by classList. Adding a CSS class (e.g., .primary) to a button is
invisible to these tests. Safe for visual hierarchy work. Tool quirk / convention.

memory fact 5: Focus pocket dual-render mirror — the constellation has 3 hops:
applyLocalNeighborhoodFocus writes to legacy state.navState.focusPocket* and
state.targetPositions, then mirrorFocusPocketToSvelteStore reads those and pushes derived
FocusPocketNode[] to the Svelte pocketNodes store, then FocusPocket.svelte reads the store.
Three sources of truth: legacy state, Svelte store, WebGL render. The Svelte port could
write directly to the Svelte store in the same function body, eliminating the mirror. The
WebGL render is downstream of targetPositions (not the Svelte store) — that's the part the
HTML overlay doesn't see animate.

memory fact 6: HTML overlay cannot replicate 3D motion — the 3D constellation breathes
(sine-wave amplitude on each node's distance from anchor) and orbits (axis-angle rotation
around the anchor-to-camera vector). The HTML overlay is a static 2D projection of the 3D
positions, computed once when the constellation is built. The two render paths drift apart
as soon as the breathing animation starts. This is the actual user-visible "two sets of
nodes, possibly misaligned" finding.

memory fact 7: 3D role differentiation is scale-only, not color — getNodeSporeScale in
three-node-manager.ts checks focusPocketRoleByIndex (primary=1.3x, support=1.15x). But
getNodeSporeColor does NOT check role — all nodes use cluster-based vertex colors. The
role-based colors (teal/yellow/red) exist only in the HTML overlay CSS. Phase 1 of the
3D-only migration must add role-based color to getNodeSporeColor.
```
