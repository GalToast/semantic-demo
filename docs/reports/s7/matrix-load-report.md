# S7-W2 Matrix-Load Report

## Backup / Copy
- Backup created: `src/opencode-key-router.mjs.bak-pre-matrix-load-2026-07-26`
- Backup size: `175029` bytes
- Matrix JSON copied: `src/v2-overlay-matrix.json` (`4725` bytes)

## Before-Patch Excerpts

### Site A (originally declared around line 4577)
```javascript
						// Minimal modelMatrix for Phase-5B validation: agnes-2.0-flash only.
						const v2ModelMatrix = [
							{
								modelId: "agnes-2.0-flash",
								routeId: "agnes",
								carrierType: "auto",
								contextWindowLimit: 128000,
								qualityPerCapability: {
									vision: 0,
									toolUse: 1,
									code: 2,
									default: 2,
								},
								streamingSmooth: true,
								toolExecutionReliability: "HIGH",
								routingTier: "T0",
								// auto-derived via types.ts factory contract:
								canVision: false,
								canToolUse: true,
								canCode: true,
								longContext: true,
								streamingSafe: true,
							},
						];
```

### Site B (originally declared around line 5427)
```javascript
					// Minimal modelMatrix for Phase-5B validation: agnes-2.0-flash only.
					const v2ModelMatrix = [
						{
							modelId: "agnes-2.0-flash",
							routeId: "agnes",
							carrierType: "auto",
							contextWindowLimit: 128000,
							qualityPerCapability: {
								vision: 0,
								toolUse: 1,
								code: 2,
								default: 2,
							},
							streamingSmooth: true,
							toolExecutionReliability: "HIGH",
							routingTier: "T0",
							// auto-derived via types.ts factory contract:
							canVision: false,
							canToolUse: true,
							canCode: true,
							longContext: true,
							streamingSafe: true,
						},
					];
```

## After-Patch Excerpts

### Site A (line 4579)
```javascript
						const v2ModelMatrix = JSON.parse(fs.readFileSync(path.join(__dirname, "v2-overlay-matrix.json"), "utf8"));
```

### Site B (line 5406)
```javascript
					const v2ModelMatrix = JSON.parse(fs.readFileSync(path.join(__dirname, "v2-overlay-matrix.json"), "utf8"));
```

## ESM `__dirname` Resolution
Added at the top of `opencode-key-router.mjs`:
```javascript
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
```
(`node:fs` and `node:path` were already imported; `node:url` was added.)

## Verification

### `node --check`
```
EXIT_CODE=0
```

### `grep -nE 'v2ModelMatrix'`
```
4579:						const v2ModelMatrix = JSON.parse(fs.readFileSync(path.join(__dirname, "v2-overlay-matrix.json"), "utf8"));
4592:								modelMatrix: v2ModelMatrix,
5406:						const v2ModelMatrix = JSON.parse(fs.readFileSync(path.join(__dirname, "v2-overlay-matrix.json"), "utf8"));
5419:							modelMatrix: v2ModelMatrix,
```
Note: 4 hits total — two declarations (Site A / Site B) and two usages passed into `v2FailoverDispatch`. No extra inline arrays remain.

### File sizes
- `src/v2-overlay-matrix.json`: `4725` bytes
- `src/opencode-key-router.mjs.bak-pre-matrix-load-2026-07-26`: `175029` bytes

## Matrix Route Health Notes

The 8-entry matrix covers:
1. `agnes-2.0-flash` (agnes) — GOLDEN_GOOSE_#1
2. `north-mini-code:free` (openrouter) — GOLDEN_GOOSE_#2_FASTEST
3. `minimax-m3` (nvidia) — FREE_WITH_REASONING_AND_CONTENT
4. `kilo-step-3.7-flash:free` (kilo) — CONDITIONAL_LENGTH_LIMITED, `failMode: content_truncated`
5. `cloudflare` (cloudflare) — CONDITIONAL, `failMode: partial_compatibility`
6. `nvidia-minimax-m3` (nvidia) — CONDITIONAL_SLOW_THROUGHPUT, `failMode: slow_throughput`
7. `opencode-zen` (opencode-zen) — CONDITIONAL_RATE_LIMITED, `failMode: rate_limited`
8. `logfare-kimi-k2.6` (logfare) — SEASONAL_HEALTHY, flux-state note

Routes I expect to work end-to-end:
- **`agnes-2.0-flash`** and **`north-mini-code:free`** are marked GOLDEN_GOOSE and are the primary/fallback carriers most likely to deliver the V2 SUCCESS path.
- **`minimax-m3`** on NVIDIA NIM is tagged FREE_WITH_REASONING_AND_CONTEXT and should be viable if NVIDIA routing is healthy.

Routes I expect to fail or require fallback:
- **`kilo-step-3.7-flash:free`** has `failMode: content_truncated` — likely to succeed transport-wise but truncate outputs.
- **`cloudflare`** has `failMode: partial_compatibility` — may hit schema/feature gaps.
- **`nvidia-minimax-m3`** has `failMode: slow_throughput` — may complete but be too slow.
- **`opencode-zen`** has `failMode: rate_limited` — may 429 under load.
- **`logfare-kimi-k2.6`** is SEASONAL and explicitly marked “not re-verified on 7/25” — expect intermittent 4xx/5xx or auth drift.

## Bench-Log Summary
Worker S7-W2 loaded the full 8-entry V2 overlay matrix into both Site A and Site B of `opencode-key-router.mjs`, replacing the minimal 1-entry inline arrays with a `JSON.parse(fs.readFileSync(...))` against the newly copied `src/v2-overlay-matrix.json` (4725 bytes). ESM `__dirname` was derived via `fileURLToPath(import.meta.url)` because the file is pure ESM. `node --check` exits 0, the backup is intact at 175029 bytes, and `grep -nE 'v2ModelMatrix'` shows exactly the two declaration lines plus their two `v2FailoverDispatch` usages with no stray inline matrices. Two golden routes (`agnes-2.0-flash`, `north-mini-code:free`) should provide viable V2 SUCCESS failover; conditional/seasonal routes carry `failMode` flags that main-lane should watch in post-restart smoke tests.
