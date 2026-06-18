# Semantic Demo UI Quality Rubric

Use this rubric for surface reviews, visual QA, and future UI contract tests.

## Surface Types

- Primitive surfaces: individual UI regions such as journey compass, search drawer, bottom info sheet, focus card, thread inspector, controls rail, map trail strip, loading overlay, mode grid, filters.
- Composed state surfaces: full app states where multiple primitives interact, such as mobile idle, search error, focus pocket, field node, map trail, desktop idle.
- Contract surfaces: named test slices that verify a primitive or composed surface, such as `search-chrome`, `global-spacing`, or `info-panel-populated`.

## Senior Design Criteria

- App chrome: Surfaces should feel like deliberate product chrome, not demo overlays or isolated cards.
- Hierarchy: A user should understand status, primary action, secondary action, and content hierarchy within 3 seconds.
- Composition: Top chrome, bottom sheets, drawers, labels, map controls, and scene content must not visually fight each other.
- Fit: No visible text clipping, control clipping, viewport overflow, accidental offscreen edges, or incoherent overlap.
- Touch: Mobile interactive targets should be at least 44px in both dimensions unless intentionally hidden or pointer-disabled.
- Focus: Keyboard focus states should be visible and consistent with the surface style.
- Density: Mobile panels should be dense enough to be useful but not cover the scene without purpose.
- Visual system: Radius, blur, borders, shadows, color accents, and type scale should be consistent across states.
- State truth: A surface's visual state should match its data attributes and action labels.
- Scene harmony: 3D/map content should remain readable; UI atmosphere must not wash out or bury the scene.
- Accessibility: Important controls need labels, state attributes, and predictable interaction behavior.
- Motion: Motion should clarify state change and respect reduced-motion preferences.

## Compass Ownership Trend

The journey-compass contract emits `debtSign` for each primitive:

| debtSign | Meaning |
|---|---|
| `shrinking` | Owner count dropped — consolidation is progressing |
| `stable` | Owner count unchanged — no regression |
| `growing` | Owner count increased — new files adopted the primitive |

To prevent silent ownership drift, run `RATCHET=1 npm run qa:surface-redundancy` in CI. Without the flag, unknown owners are reported but do not fail the contract, preserving the ability to evolve the baseline incrementally.

## Required Evidence For Surface Signoff

- Targeted surface contract passes.
- Rendered visual/luminance QA passes for the relevant state.
- No unresolved severe findings from a designer/adversarial pass.
- Before/after geometry for changed surfaces, including viewport fit and overlap checks.
- Winning owner evidence for CSS/layout fixes: selector, media query, state attribute, late import, transition, or runtime writer.
- Screenshots or DOM evidence saved under `tmp/` when visual judgment is involved.
- Known residual risks and unrelated failures called out explicitly.

## Adversarial Critic Checklist

- Check major surfaces for overlap, clipping, and occlusion, not only viewport overflow.
- Look for hidden or stale state chrome that still takes layout space.
- Verify text and controls fit after transitions settle.
- Confirm the edited rule changes live computed geometry in DevTools before accepting it.
- Escalate repeated fixes on one surface into a layout ownership update.
