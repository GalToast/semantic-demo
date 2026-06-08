# ThreadInspector.svelte — Complete WebGL Line Integration

## Objective
Complete the `src/components/ThreadInspector.svelte` component by adding WebGL line integration for inspecting connections between nodes. The component currently has a basic overlay UI but lacks the WebGL pulsing, score-reactive lines that connect nodes during thread inspection.

## Source Files (legacy, read for behavior)
1. `js/modules/thread-inspector.js` — Main thread inspector logic, connection pulse, score calculations
2. `js/modules/thread-inspector-webgl.js` — WebGL line geometry and shader setup (ALL WebGL work extracted here)
3. `src/components/ThreadInspector.svelte` — Current partial implementation (port from legacy)

## Key Requirements
1. **WebGL Line Rendering**: Integrate the WebGL line rendering from the legacy module to draw pulsing, score-reactive lines between nodes during thread inspection.
2. **Lifecycle**: Properly dispose of WebGL resources on component unmount. Use the bridge for cleanup.
3. **Stores**: Read thread state from Svelte stores (`@lib/stores/thread` or equivalent). Do NOT write to imperative state directly.
4. **Bridge API**: Use `src/lib/engine/bridge.ts` for any WebGL interaction. Do NOT import Three.js directly. Look at `Canvas.svelte` or `JourneyCanvas.svelte` for the bridge delegation pattern.
5. **Types**: Use only typed stores. No `any`. Add types to `src/lib/types/` if needed.

## Deliverables
- Complete `src/components/ThreadInspector.svelte` with working WebGL line integration
- Ensure `npm run build:svelte` and `npm run check` pass cleanly
- Add/update types in `src/lib/types/` as needed

## Style Notes
- Follow the exact code style of existing Svelte components (see FocusPocket.svelte, JourneyCanvas.svelte for reference)
- Use `var(--z-*)` for z-index. Do NOT hardcode z-index values.
- Keep the existing basic overlay UI and enhance it, don't replace it.
- Clean code, no unnecessary comments, but meaningful names.
