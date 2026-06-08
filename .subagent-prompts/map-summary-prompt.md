# MapSummary.svelte — Create Mini-Map Trail with SVG Rendering

## Objective
Complete the `src/components/MapSummary.svelte` component. It is currently a stub and needs to render a mini-map trail with SVG rendering based on the legacy journey route trace and neighborhood data.

## Source Files (legacy, read for behavior)
1. `js/modules/journey-route-trace.js` — Route trace overlay rendering and frame updates for trail visualization
2. `js/modules/journey-neighborhood.js` — Neighborhood manifest, bounded walk candidates, trail seed, and route index derivation
3. `src/components/MapSummary.svelte` — Current stub (copy existing component for scaffold, then build out)

## Key Requirements
1. **Mini-Map Trail**: Render a mini-map trail showing the current journey/neighborhood trail as an SVG path.
2. **SVG Rendering**: Use SVG `<path>` and related elements. Do NOT use `canvas` or WebGL for this — it's a summary mini-map.
3. **Reactivity**: The trail should update reactively when the journey state (route, trail depth, selected node) changes. Use Svelte 5 runes (`$effect`, `$derived`) or existing stores.
4. **Stores**: Read from `@lib/stores/journey`, `@lib/stores/navigation` or equivalent. Look at `CompassRail.svelte` for store consumption patterns.
5. **Responsive**: The mini-map must be responsive and not cause layout shift. Look at `mobile_premium__*.css` for responsive patterns if CSS is needed in the component.

## Deliverables
- Complete `src/components/MapSummary.svelte` with a working mini-map trail
- Ensure `npm run build:svelte` and `npm run check` pass cleanly
- Add/update types in `src/lib/types/` as needed

## Style Notes
- Follow the exact code style of existing Svelte components (see CompassRail.svelte, MapSummary.svelte current stub)
- Use `var(--z-*)` for z-index. Do NOT hardcode z-index values.
- Keep it clean, efficient, and self-contained.
- Clean code, no unnecessary comments, but meaningful names.
