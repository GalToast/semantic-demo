# Mimo-v2.5 Deep Bug Sweep Report - Wave 3 (2026-06-07)

## Overview
The third diagnostic wave focused on infrastructure, mobile polish, worker safety, and test coverage. 5 parallel `mimo-v2.5` workers identified significant technical debt and stability risks, including critical resource leaks.

---

## 1. Resource Leaks & Worker Safety
**Worker:** `bugsweep-worker-data-integrity` (ocw_04196e41-...)

| Finding | Severity | File | Description |
|---|---|---|---|
| **Zombie Worker Multiplication** | 🔴 **CRITICAL** | `data-loader.js`, `semantic-threads.js` | No `.terminate()` calls exist. Error paths and retries create multiple orphaned worker threads that consume CPU/RAM indefinitely. |
| **OOM Vulnerability** | **HIGH** | `data-worker.js:49` | No `MAX_RECORDS` guard. Corrupted `.dat` file can trigger 100MB+ allocations and crash the tab. |
| **Clone Overhead** | MEDIUM | `data-worker.js:26` | Thread artifacts use large structured clones instead of Transferables, adding latency. |
| **Zombie Fetches** | MEDIUM | `data-worker.js` | Missing `AbortController` in worker; stale fetches run to completion even after request ID invalidation. |

---

## 2. Mobile Interaction & Performance
**Worker:** `bugsweep-mobile-touch-interaction` (ocw_398d2c01-...)

| Finding | Severity | File | Description |
|---|---|---|---|
| **Passive Listener Gap** | **HIGH** | `micro-demo-ui.js:44`, `audio-scape.js:27` | `touchstart` listeners on `document` lack `{ passive: true }`, blocking the browser scroll pipeline on mobile. |
| **Layout Flip Jank** | **HIGH** | `composition-state.js:90` | Synchronous snapping of `position`/`display` during mobile state transitions causes visible layout jumps. |
| **Touch Action Gap** | MEDIUM | `mobile_premium__state.css` | `#canvas-container` missing `touch-action: none`, allowing browser interference with Three.js controls. |

---

## 3. Build Infrastructure & Security
**Worker:** `bugsweep-build-infra-deep` & `bugsweep-api-security-sessions`

| Finding | Severity | File | Description |
|---|---|---|---|
| **Broken Lint Script** | **HIGH** | `package.json` | `--ext .js` flag is incompatible with ESLint v10 flat config; triggers warnings/failures. |
| **Log Overflow Risk** | MEDIUM | `supervisor.php` | Indefinite log appending without rotation; dashboard reads load the entire file into RAM. |
| **Target Mismatch** | MEDIUM | `vite.config.ts`, `build-app.mjs` | Vite targets ES2022, legacy esbuild targets ES2020. Risks silent runtime divergence. |
| **Manual Globals** | MEDIUM | `eslint.config.js` | 65+ manually declared browser globals; should use `globals` npm package. |

---

## 4. Test Coverage & Contracts
**Worker:** `bugsweep-test-coverage-contracts` (ocw_c39e86c1-...)

| Finding | Severity | File | Description |
|---|---|---|---|
| **Strand Logic Untested** | **HIGH** | `src/lib/utils/strand-continuity.ts` | The bug-fixed TS port has 0% unit test coverage. |
| **Parity Gap** | MEDIUM | `tests/unit/search-tokenizer-parity.test.js` | Only tests 1 of 3 core tokenizer functions across implementations. |
| **Store Gap** | MEDIUM | `src/lib/stores/search.ts` | New TS search store actions and derived logic are completely untested. |

---

## Synthesis & Next Steps
1. **Critical:** Implement `worker.terminate()` and `AbortController` in the data worker pipeline.
2. **Performance:** Add `{ passive: true }` to global mobile touch listeners.
3. **Stability:** Fix the ESLint flat config flag and align build targets.
4. **Coverage:** Add unit tests for `strand-continuity.ts` to prevent regression of the timer-ID bug.