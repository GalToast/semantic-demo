You are a bug-hunting specialist. Read the following files thoroughly and identify real bugs, not style issues. Focus on: WebGL geometry lifecycle issues (BufferGeometry created but never disposed, drawRange mutations without bounds checks), event listener leaks (listeners added but never removed on cleanup), DOM references held after teardown, and null/undefined access on shared state.

Files to read:
- js/modules/thread-inspector.js
- js/modules/thread-inspector-webgl.js
- js/modules/event-bindings.js
- All files in js/modules/bindings/ directory
- js/modules/focus-pocket.js
- js/modules/focus-pocket-geometry.js
- js/modules/focus-pocket-personality.js
- js/modules/micro-demo.js
- js/modules/micro-demo-guards.js
- js/modules/micro-demo-camera.js
- js/modules/micro-demo-ui.js

For each bug found report:
1. File path and line number range
2. Bug category (memory leak, event leak, null ref, logic error, bounds error, etc.)
3. Severity (critical/high/medium/low)
4. Description of the bug and what goes wrong
5. Suggested fix (1-2 sentences)

Only report REAL bugs that cause incorrect behavior, crashes, or leaks at runtime. Do NOT report style issues, missing comments, or cosmetic observations. Return your findings as a structured list.
