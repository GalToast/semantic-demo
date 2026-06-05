You are a bug-hunting specialist. Read the following files thoroughly and identify real bugs, not style issues. Focus on: race conditions in rAF loops, competing camera transitions without mutual cancellation, stale closure captures, missing cancel/cleanup paths, and off-by-one or null-reference errors.

Files to read:
- js/modules/camera-controls.js
- js/modules/camera-controls-choreography.js
- js/modules/camera-controls-core.js
- js/modules/camera-controls-restore.js
- js/modules/camera-framing-utils.js
- js/modules/camera-orbit-slack.js

For each bug found report:
1. File path and line number range
2. Bug category (race condition, memory leak, null ref, logic error, etc.)
3. Severity (critical/high/medium/low)
4. Description of the bug and what goes wrong
5. Suggested fix (1-2 sentences)

Only report REAL bugs that cause incorrect behavior, crashes, or leaks at runtime. Do NOT report style issues, missing comments, or cosmetic observations. Return your findings as a structured list.
