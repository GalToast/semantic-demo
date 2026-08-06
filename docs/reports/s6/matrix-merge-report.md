# TIER-MATRIX-MERGE Report — Sprint-6 W3

**Worker:** TIER-MATRIX-MERGE  
**Source:** `tmp/model-tier-matrix.json` (215KB, 7 families + capabilityMatrix)  
**Output:** `tmp/v2-overlay-matrix.json` (flat array, normalized schema)  
**Model:** agnes-2.0-flash — **$0.00**  

---

## File Written

| Field | Value |
|-------|-------|
| Output file | `tmp/v2-overlay-matrix.json` |
| Entry count | 8 |
| Schema | v2-failover-overlay flat array |

## Entry Count Breakdown

| Tier | Count |
|------|-------|
| T0 | 3 |
| CONDITIONAL | 4 |
| SEASONAL | 1 |
| DROPPED (WARM_CADAVER) | 11 |

## All T0 Entries (3)

| # | modelId | routeId | carrierType | qualified | status |
|---|---------|---------|-------------|-----------|--------|
| 1 | agnes-2.0-flash | agnes | auto | agnes-2.0-flash | GOLDEN_GOOSE_#1 |
| 2 | north-mini-code:free | openrouter | openrouter | cohere/north-mini-code:free | GOLDEN_GOOSE_#2_FASTEST |
| 3 | minimax-m3 | nvidia | nvidia | minimaxai/minimax-m3 | FREE_WITH_REASONING_AND_CONTENT |

All T0 have: `toolExecutionReliability: "HIGH"`, `streamingSmooth: true`, `contextWindowLimit: 128000`.  
Only `minimax-m3` has vision enabled (`canVision: true`, qualityPerCapability.vision: 1).

## All CONDITIONAL Entries (4)

| # | modelId | routeId | failMode | status | detail |
|---|---------|---------|----------|--------|--------|
| 1 | kilo-step-3.7-flash:free | kilo | content_truncated | CONDITIONAL_LENGTH_LIMITED | HTTP 200 but finish_reason=length; truncated before pong |
| 2 | cloudflare | cloudflare | partial_compatibility | CONDITIONAL | Some CF models reason-only; @cf/kimi-k2.6 is dead |
| 3 | nvidia-minimax-m3 | nvidia | slow_throughput | CONDITIONAL_SLOW_THROUGHPUT | 13.8s RTT; only thinking tokens for trivial prompts |
| 4 | opencode-zen | opencode-zen | rate_limited | CONDITIONAL_RATE_LIMITED | Free model laguna-s-2.1-free consistently 429 |

All CONDITIONAL have: `toolExecutionReliability: "MEDIUM"`, default quality scores `{vision:0, toolUse:1, code:2, default:2}`.

## All SEASONAL Entries (1)

| # | modelId | routeId | seasonalStatus | lastVerified |
|---|---------|---------|----------------|--------------|
| 1 | logfare-kimi-k2.6 | logfare | golden: 2026-07-24, cold: 2026-07-25 | 2026-07-24 |

Note: Carrier-golden-ness appears session-specific rather than stable. Flux-state pending re-verification. Has `seasonalStatus` attached with golden/cold date tracking.

## Verification Checks

| Check | Result |
|-------|--------|
| File exists | ✅ |
| JSON valid | ✅ |
| Entry count = 8 | ✅ |
| All 13 required fields present | ✅ |
| No WARM_CADAVER entries | ✅ |
| T0 count = 3 | ✅ |
| CONDITIONAL count = 4 | ✅ |
| SEASONAL count = 1 | ✅ |

## Normalization Schema Applied

Each entry received these mappings from `capabilityMatrix`:

- **routingTier**: derived from `status` prefix (T0 / CONDITIONAL_*/SEASONAL_*)
- **toolExecutionReliability**: HIGH for T0, MEDIUM for CONDITIONAL/SEASONAL
- **qualityPerCapability**: taken from raw `vision`/`toolUse`/`code` bools when available; defaults to `{vision:0, toolUse:1, code:2, default:2}` for CONDITIONAL/SEASONAL
- **contextWindowLimit**: 128000 from raw (same for all tiers in this matrix)
- **streamingSmooth**: `true` for all entries
- **Auto-derived**: `canVision = qualityPerCapability.vision > 0`, `canToolUse > 0`, `canCode > 0`, `longContext >= 32000`, `streamingSafe = streamingSmooth`
- **failMode**: extracted from CONDITIONAL status strings
- **seasonalStatus**: preserved from raw entry for SEASONAL tier

## Dropped WARM_CADAVER Routes (11)

zydit, zydit-v4, neuralwatt, llm7, openprovider, freemodel, gemini, mistral, cloudflare-kimi-k2.6, modelscope, zenmux

---

TIER-MATRIX-MERGE WORKER — FINAL REPORT
- entries flattened: 19
- entries kept: 8
- entries dropped (WARM_CADAVER): 11
- Time taken / Cost: agnes-2.0-flash = $0
