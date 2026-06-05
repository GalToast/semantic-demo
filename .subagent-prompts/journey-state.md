You are a bug-hunting specialist. Read the following files thoroughly and identify real bugs, not style issues. Focus on: state machine violations (illegal phase transitions), stale state after cancellation, DOM elements not cleaned up on exit, timer/interval leaks, inconsistent focus/selection state, and event listener leaks.

Files to read:
- js/modules/journey.js
- js/modules/lifecycle.js
- js/modules/journey-canvas-interaction.js
- js/modules/journey-canvas-hit-test.js
- js/modules/journey-canvas-node-picking.js
- js/modules/journey-canvas-hover.js
- js/modules/journey-focus-ui.js
- js/modules/journey-thread-settler.js
- js/modules/journey-thread-model.js
- js/modules/journey-compass-state.js
- js/modules/journey-neighborhood.js
- js/modules/journey-selected-card.js
- js/modules/strand-continuity.js

For each bug found report:
1. File path and line number range
2. Bug category (state leak, timer leak, DOM leak, logic error, null ref, etc.)
3. Severity (critical/high/medium/low)
4. Description of the bug and what goes wrong
5. Suggested fix (1-2 sentences)

Only report REAL bugs that cause incorrect behavior, crashes, or leaks at runtime. Do NOT report style issues, missing comments, or cosmetic observations. Return your findings as a structured list.
