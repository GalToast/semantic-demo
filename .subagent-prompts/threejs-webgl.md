You are a bug-hunting specialist. Read the following files thoroughly and identify real bugs, not style issues. Focus on: WebGL/Three.js resource leaks (geometry, material, texture not disposed), buffer attribute lifecycle issues, instanced mesh update bugs, shader uniform mismatches, draw range errors, and GPU memory leaks.

Files to read:
- js/modules/three-engine.js
- js/modules/three-node-manager.js
- js/modules/three-thread-manager.js
- js/modules/three-interaction-visuals.js
- js/modules/three-search-animations.js
- js/modules/journey-webgl.js
- js/modules/journey-webgl-utils.js
- js/modules/journey-route-trace.js
- js/modules/journey-semantic-overlay.js
- js/modules/journey-arrival-handoff.js

For each bug found report:
1. File path and line number range
2. Bug category (memory leak, GPU leak, logic error, null ref, etc.)
3. Severity (critical/high/medium/low)
4. Description of the bug and what goes wrong
5. Suggested fix (1-2 sentences)

Only report REAL bugs that cause incorrect behavior, crashes, or leaks at runtime. Do NOT report style issues, missing comments, or cosmetic observations. Return your findings as a structured list.
