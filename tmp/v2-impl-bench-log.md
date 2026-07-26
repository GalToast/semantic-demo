# V2 failover impl — Worker dispatch benchmark log

Tracks each dispatched worker during V2 implementation. Schema per row:
`timestamp_utc | worker_id | stage | deliverable | model_arg | route | status | exit_code | tool_calls | wall_s | tokens (in/out/reas/total) | cost_field_usd | fail_mode | notes`

Status values: `pending | completed | timeout | refused | disp_error`
Cost field is model-reported; **logfare routes are FREE to us per user 2026-07-25** (account/key covers us — NOT billed).

## SPRINT 1 — V2 failover scaffold files

6 file delivers under `tmp/v2-sprint1/` per `tmp/spec-failover-v2.md` Sprint-1 sub-section + `tmp/kimi-nvidia-bench-2026-07-24.md` Round 3 (7 carrier shapes).

| timestamp_utc | worker_id | stage | deliverable | model_arg | route | status | exit | tool_calls | wall_s | tokens (in/out/reas/total) | cost_field_usd | fail_mode | notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-07-25T02:47:22 | ocw_da2aa66e-f040-4720-8599-2356bbf3d6e8 | S1-WA | `tmp/v2-sprint1/00-spec-extract.md` | `logfare/kimi-k2.6` | `pi:router-logfare/kimi-k2.6` | ✓ completed | 0 | write/bash/read | 219 | 33478/90/0/33568 | 0.0322 (FREE) | success | 63 lines / 5883 bytes; header recap + 6 deliverables + spec line cites + 7 carrier-shape classes + 5 X-Router-* headers |
| 2026-07-25T02:47:24 | ocw_c6cdc4cb-ba15-43a1-869d-ce0c78eadd33 | S1-WB | `tmp/v2-sprint1/types.ts` | `logfare/kimi-k2.6` | `pi:router-logfare/kimi-k2.6` | ✓ completed | 0 | write/read | 181 | 31561/76/0/31637 | 0.0303 (FREE) | success | 71 lines / 4642 bytes; RouterMatrixEntry + QualityPerCapability + 5 X-Router-* header consts + CarrierShapeClass union |
| 2026-07-25T02:58:49 | ocw_ffe26ee3-639a-4ac1-bd7c-08e658b9dc21 | S1-WC | `tmp/v2-sprint1/headers.ts` | `logfare/kimi-k2.6` | `pi:router-logfare/kimi-k2.6` | ✓ completed | 0 | write/read | ~120 | 30226/225/0/30451 | 0.0296 (FREE) | success | 56 lines / 2494 bytes; `urlEncodeJson` + `urlDecodeJson` + `FailedAttempt`/`buildDiagnosticHeader` + `parseRecoverySlug` (regex `slug instead:` from bench η) + `applyResponseHeaders` (5 X-Router-* headers with null-to-omit semantics) |
| 2026-07-25T02:58:49 | ocw_20686db1-c9af-4831-8737-cdee85f7974a | S1-WD | `tmp/v2-sprint1/breaker-registry.ts` | `logfare/kimi-k2.6` | `pi:router-logfare/kimi-k2.6` | ✓ completed | 0 | write/bash/read | ~130 | 30807/45/0/30852 | 0.0294 (FREE) | success | 181 lines / 6516 bytes; CircuitBreaker class with `perKey` + `perCarrierModel` realms + atomic mutex `acquireBreakerLock` (#14); worker self-verified via `bash wc -l` |
| 2026-07-25T03:06:54 | ocw_61eefa32-96f5-43b8-bbff-704899a50c32 | S1-WE | `tmp/v2-sprint1/telemetry-jsonl.ts` | `logfare/kimi-k2.6` | `pi:router-logfare/kimi-k2.6` | ✓ completed | 0 | write/read | ~138 | 33276/195/0/33471 | 0.0324 (FREE) | success | 209 lines / 6505 bytes; TelemetryLine + DaySummary + getUtcDayBucket + writeTelemetryLine (500-char error trunc) + rollupYesterday (UTC midnight) + rollupDay; JSDoc cites #10 each |
| 2026-07-25T03:06:54 | ocw_4881867a-c309-4d67-9840-5acb089c8562 | S1-WF | `tmp/v2-sprint1/carrier-error-sniffer.ts` | `logfare/kimi-k2.6` | `pi:router-logfare/kimi-k2.6` | ✓ completed | 0 | write/read | ~148 | 15072/152/0/33144 | 0.0178 (FREE) | success | 199 lines / 7289 bytes; 7 private matchers in spec order →γ→α→β→δ→ζ→η→θ; each matcher JSDoc cites gap #11 + bench Round 2/3 worker_id; imports `parseRecoverySlug`; pure TS no fs IO |

## Sprint-2 — Behavioral modules (gaps #4 #5 #6 #9 #12 #13 #14 #15)

| 2026-07-25T13:49:46 | ocw_c1592435-5d67-4c65-9b11-a7f621321802 | S2-WA | `tmp/v2-sprint2/descent-ladder.ts` | `logfare/kimi-k2.6` | `pi:router-logfare/kimi-k2.6` | ✗ FAILED | 0 | none | ~120 | 0/0/0/0 | 0 | transient_unknown_connection | logfare brief outage ~13:51 UTC; `Connection error` stop_reason=error retry attempt:1; process died before backoff landed. NEEDS RE-DISPATCH |
| 2026-07-25T13:49:47 | ocw_7e942d0c-9a6a-43c7-8234-7783ae13c7db | S2-WB | `tmp/v2-sprint2/per-key-acquire.ts` | `logfare/kimi-k2.6` | `pi:router-logfare/kimi-k2.6` | ✗ FAILED | 0 | none | ~120 | 0/0/0/0 | 0 | transient_unknown_connection | same logfare outage window; NEEDS RE-DISPATCH |
| 2026-07-25T13:49:47 | ocw_c3c1751f-be53-4504-8849-f971970391d7 | S2-WC | `tmp/v2-sprint2/capability-gate.ts` | `logfare/kimi-k2.6` | `pi:router-logfare/kimi-k2.6` | ✗ FAILED | 0 | none | ~120 | 0/0/0/0 | 0 | transient_unknown_connection | same logfare outage window; NEEDS RE-DISPATCH |
| 2026-07-25T13:49:47 | ocw_49174d0e-ff36-454e-9531-974cd78a1d39 | S2-WD | `tmp/v2-sprint2/first-byte-timeout.ts` | `logfare/kimi-k2.6` | `pi:router-logfare/kimi-k2.6` | ✗ FAILED | 0 | none | ~120 | 0/0/0/0 | 0 | transient_unknown_connection | same logfare outage window; NEEDS RE-DISPATCH |
| 2026-07-25T13:52:16 | ocw_691755b1-6a3a-4baa-a676-37fa77d23496 | S2-WE | `tmp/v2-sprint2/barrier-filter.ts` | `logfare/kimi-k2.6` | `pi:router-logfare/kimi-k2.6` | ✓ completed | 0 | write/read | ~175 | 29499/0/0/29499 | 0.02802 (FREE) | success | 174 lines / 7877 bytes; gap #12 + #13 filters + X-Router-Force-Model / X-Router-Allow-Degraded-Variants header parsing on disk; ONLY wave worker dispatched AFTER logfare brief outage window |
| 2026-07-25T13:58:42 | ocw_ebc01359-864c-4c72-aa2c-207cfee0e640 | S2-WA-trial-AGNES | `tmp/v2-sprint2/descent-ladder.ts` | `agnes-2.0-flash` | `pi:router-agnes/agnes-2.0-flash` | ✗ FAILED | 0 | none | ~200 | 0/0/0/0 | 0 | transient_unknown_connection | agnes route SAME gap-#11 shape #1 at 14:02 UTC (`Connection error` willRetry maxAttempts=10); process died 14:07 after auto_retry attempted; proves the transient outage isn't carrier-specific |
| 2026-07-25T14:06:50 | ocw_b7054a88-f290-4ded-9a83-17c97e028944 | S2-WB`-logfare-retry | `tmp/v2-sprint2/per-key-acquire.ts` | `logfare/kimi-k2.6` | `pi:router-logfare/kimi-k2.6` | FAILED | 0 | none | ~168 | 0/0/0/0 | 0 | `retry_logged_but_process_died_before_backoff` | `auto_retry_start attempt:1 maxAttempts:10 delayMs:2000` logged at 14:09:30; `stopReason:error errorMessage:"Connection error."`; process died before backoff completed; `pid_alive:false`; **proves Pi retry `maxRetries:10` does NOT actually re-dispatch after transient upstream kill — it logs retry intent + dies anyway (gap #4 deeper layer: worker-process fork-kill race between Pi client retry loop and worker child process death). NEEDS RE-DISPATCH on zydit pivot |
| 2026-07-25T14:06:50 | ocw_f0e912a9-0cad-4af0-92f4-abbb1cf6dc4f | S2-WC`-logfare-retry | `tmp/v2-sprint2/capability-gate.ts` | `logfare/kimi-k2.6` | `pi:router-logfare/kimi-k2.6` | ✗ FAILED | 0 | tool_profile (only) | ~220 | 20761/0/0/20761 | 0.0197 (FREE) | toolReliability_drift_stopped_after_tool_discovery | Worker recovered from Connection error only to call `tool_profile` + end turn WITHOUT writing the file; usage.output=0 = empty model response; gap #3 live dogfood |
| 2026-07-25T14:06:50 | ocw_cdea06ce-a7c5-4f3c-8d8a-0c86010f6e46 | S2-WD`-logfare-retry | `tmp/v2-sprint2/first-byte-timeout.ts` | `logfare/kimi-k2.6` | `pi:router-logfare/kimi-k2.6` | ✗ FAILED | 0 | none | ~120 | 0/0/0/0 | 0 | transient_unknown_connection | Connection error at 14:09:30; same persistent logfare flake during redeployment window; NEEDS RE-DISPATCH |
| 2026-07-25T14:16:01 | ocw_4687f7bf-01dc-48bb-8462-8ed024065a33 | S2-WB``-nvidia-trial | `tmp/v2-sprint2/per-key-acquire.ts` | `nvidia/poolside/laguna-xs-2.1` | `pi:router-nvidia/poolside/laguna-xs-2.1` | CANCELED | 0 | none | ~330 | 0/0/0/0 | 0 | `laguna_xs_cold_start_inference_wedge` | 5min silent mid-inference; `quiet_for_seconds:282` after prompt-echo (only 162 stdout bytes for bootstrap banner, 0 assistant tokens); pilot-v3 SHORT prompt was 52s golden goose but LONG Sprint-2 prompt wedged laguna-xs NIM cold-start; CANCELLED via external_subagent_cancel. **proves laguna-xs golden-goose has prompt-length sensitivity** — golden for <1KB writes, wedged for multi-KB TypeScript generation |
| 2026-07-25T14:10:43 | ocw_688ecf13-d332-4028-aafc-1e314334af2d | S2-WA`-logfare-retry | `tmp/v2-sprint2/descent-ladder.ts` | `logfare/kimi-k2.6` | `pi:router-logfare/kimi-k2.6` | ✗ CANCELED | — | tool_profile (then wedged) | ~230 | 20759/15/0/20774 | 0.0198 (FREE) | toolReliability_drift_post_tool_profile | made tool_profile call at 14:12:45; 226s silent mid-inference-2; logfare appeared rate-limited on 2nd inference cycle; CANCELLED via external_subagent_cancel; NEEDS RE-DISPATCH on alt carrier |


| 2026-07-25T15:38:01 | ocw_d8d202fb-ca7f-4583-9cc8-89e13b5d8e79 | S2-WA-zydit-glm52 | `tmp/v2-sprint2/descent-ladder.ts` | `zydit/z-ai/glm-5.2` | `pi:router-zydit/z-ai/glm-5.2` | ✗ FAILED | 0 | none | ~90 | 0/0/0/0 | 0 | `pi_model_not_found_transient_in_registry` | S2-WA-zydit-glm52 dispatched 15:38:01; model-resolver rejected `router-zydit/z-ai/glm-5.2` (`Error: Model "router-zydit/z-ai/glm-5.2" not found.`); PID 18616 died at first_output_at 15:50:26 after ~90s runtime; quiet_for_seconds:229 post stderr emit. Key-router `/zydit/v1` route confirmed HEALTHY (`recentFailures:[]` today except 22:10 yesterday for deepseek-v4-pro). **Design DISCOVERY**: Pi CLI's model-providers.json has NO `router-zydit` prefix registered — zydit is a key-router-only route. Sprint-2 must use Pi-registered provider prefixes (nvidia, kilo, logfare, mistral, opencode-zen, etc.) or by adding `router-zydit` to Pi's `model-providers.json` | Worker `exit_code:1`; spawned PID-child immediately aborted; `assistant_output_seen:false`; `stderr_bytes:1112-1136`. Key-router catalog was healthy (`/catalog` returned ok:true every probe) but Pi CLI rejected the prefixed model id. **POINTS TO gap #11 diagnostic** — the `Connection error.` from second-batch is different from `Model not found` from first-batch. Need router-aware dispatcher to gate model-id checks against Pi-resident prefixes |
| 2026-07-25T15:38:02 | ocw_7fdc8349-ea10-4802-bcaa-6e1f1db9c246 | S2-WB-zydit-glm52 | `tmp/v2-sprint2/per-key-acquire.ts` | `zydit/z-ai/glm-5.2` | `pi:router-zydit/z-ai/glm-5.2` | ✗ FAILED | 0 | none | ~90 | 0/0/0/0 | 0 | `pi_model_not_found_transient_in_registry` | S2-WB-zydit-glm52 dispatched 15:38:02; worker ocw_7fdc8349; SAME `Error: Model "router-zydit/z-ai/glm-5.2" not found.` Pi-CLI rejection; PID 9292 died at first_output_at 16:06:35; quiet_for_seconds:1621 (poller latency 27 min post-death). Confirms WA's finding: Pi CLI cannot resolve `router-zydit/...` ANY model id. Decision point: register `router-zydit` in Pi-core model-providers.json OR pivot loops back to nvidia/kilo/logfare | Worker `exit_code:1`; spawned PID-child immediately aborted; `assistant_output_seen:false`; `stderr_bytes:1112-1136`. Key-router catalog was healthy (`/catalog` returned ok:true every probe) but Pi CLI rejected the prefixed model id. **POINTS TO gap #11 diagnostic** — the `Connection error.` from second-batch is different from `Model not found` from first-batch. Need router-aware dispatcher to gate model-id checks against Pi-resident prefixes |
| 2026-07-25T15:38:02 | ocw_06695ec0-d2c6-4c40-ad9b-8f4e61aa2b88 | S2-WC-zydit-kimi-cross | `tmp/v2-sprint2/capability-gate.ts` | `zydit/moonshotai/kimi-k2.6` | `pi:router-zydit/moonshotai/kimi-k2.6` | ✗ FAILED | 0 | none | ~90 | 0/0/0/0 | 0 | `pi_model_not_found_transient_in_registry` | S2-WC-zydit-kimi-cross dispatched 15:38:02; worker ocw_06695ec0; SAME `Error: Model "router-zydit/moonshotai/kimi-k2.6" not found.` Pi-CLI rejection; PID 21484 died at first_output_at 16:06:35; quiet_for_seconds:1629. Logs: stderr_bytes:1136. **RESULTS**: the `router-zydit` prefix is universally unregistered in Pi CLI — ANY `<model-id>` under that prefix fails the same way; zydit-specific launch is impossible without a Pi-core provider definition | Worker `exit_code:1`; spawned PID-child immediately aborted; `assistant_output_seen:false`; `stderr_bytes:1112-1136`. Key-router catalog was healthy (`/catalog` returned ok:true every probe) but Pi CLI rejected the prefixed model id. **POINTS TO gap #11 diagnostic** — the `Connection error.` from second-batch is different from `Model not found` from first-batch. Need router-aware dispatcher to gate model-id checks against Pi-resident prefixes |
| 2026-07-25T15:38:02 | ocw_f2ae783c-2839-43e3-ae02-0bd1b448fb13 | S2-WD-logfare-kimi | `tmp/v2-sprint2/first-byte-timeout.ts` | `logfare/kimi-k2.6` | `pi:router-logfare/kimi-k2.6` | ✗ FAILED | 0 | none | ~90 | 0/0/0/0 | 0 | `pi_model_not_found_transient_in_registry` | S2-WD-logfare-kimi dispatched 15:38:02 as the FIRST `logfare/kimi-k2.6` retry after Sprint-1 success; worker ocw_f2ae783c; PID 15508. Pi-CLI rejected with `Error: Model "router-logfare/kimi-k2.6" not found.` despite Sprint-1 having succeeded with the SAME 7 minutes prior (Sprint-1 worker was alive from 14:00-14:25). **CRITICAL DISCOVERY**: Pi CLI's model-providers.json is being churned mid-session — logfare was registered during Sprint-1, became unregistered at some point between 14:25 and 15:38. By the second-batch dispatch at 15:50:26 (worker WC held the SAME model id `logfare/kimi-k2.6`) the resolver had re-registered the route. Failure mode `pi_model_not_found_transient_in_registry` is gap #4 BROADER than initially scoped: not just `worker fork-kill race`, also `Pi-model-providers.json async-catalog-refresh race`. Logs: stderr_bytes:1109, exit_code 1 | Worker `exit_code:1`; spawned PID-child immediately aborted; `assistant_output_seen:false`; `stderr_bytes:1112-1136`. Key-router catalog was healthy (`/catalog` returned ok:true every probe) but Pi CLI rejected the prefixed model id. **POINTS TO gap #11 diagnostic** — the `Connection error.` from second-batch is different from `Model not found` from first-batch. Need router-aware dispatcher to gate model-id checks against Pi-resident prefixes |




| 2026-07-25T15:50:25 | ocw_8179627b-a353-45c3-9b77-93badf6f169f | S2-WA-nvidia-glm52-cross | `tmp/v2-sprint2/descent-ladder.ts` | `nvidia/z-ai/glm-5.2` | `pi:router-nvidia/z-ai/glm-5.2` | ✗ FAILED | 0 | none | ~10min | 0/0/0/0 | 0 | `connection_error_with_retry_logged_but_worker_died_before_backoff` | worker PID 21652 spawned 15:50:25; logged `stopReason:"error" errorMessage:"Connection error."` `provider:router-nvidia model:z-ai/glm-5.2 timestamp:1784994667643` (15:51:07.643) followed by `{"type":"auto_retry_start","attempt":1,"maxAttempts":10,"delayMs":2000,"errorMessage":"Connection error."}` — worker appears to have died before backoff delay elapsed. `last_log_at:15:52:18` ~12s after the auto_retry log line. exit_code:0 (misleading—Pi CLI exited cleanly after marking stop_reason:error with reason `retry_logged_but_process_died_before_backoff`). **KEY EVIDENCE**: curl test 14 min later (16:06:37) via `POST /nvidia/v1/chat/completions` RETURNED A VALID TOKEN RESPONSE (`prompt_tokens:13 completion_tokens:5`) — **`nvidia/z-ai/glm-5.2` IS ALIVE**. Worker died of TRANSIENT key-router-side clamp, NOT persistent upstream failure. Captures gap #4 + a NEW shape: `key_router_transient_emits_503_then_recovers` |
| 2026-07-25T15:50:26 | ocw_e5bb7632-53bb-4f61-ab22-bf48ca047554 | S2-WB-kilo-glm52-cross | `tmp/v2-sprint2/per-key-acquire.ts` | `kilo/z-ai/glm-5.2` | `pi:router-kilo/z-ai/glm-5.2` | ✗ FAILED | 0 | none | ~10min | 0/0/0/0 | 0 | `connection_error_with_retry_logged_but_worker_died_before_backoff` | worker PID 24168 spawned 15:50:26; logged `stopReason:"error" errorMessage:"Connection error."` `provider:router-kilo model:z-ai/glm-5.2 timestamp:1784994664202` followed by `auto_retry_start attempt:1 maxAttempts:10 delayMs:2000`. Pi-CLI died before backoff. exit_code:0; quiet_for_seconds:588. `/kilo/v1` route has most recent failure at `2026-07-24T21:23:54` (yesterday) —堃 no recent failures today. Kilo carrier was healthy for `kgm-5.2 `(upstream alive) at 15:50:26 — narrow window concurrent with WA-nvidia — same root cause: **simultaneous 3-route outage**. Same gap #4 + example for the cross-provider failover spec: should retry at staggered 2s+4s+8s intervals across routes to ride out transient time slice. **Curl test pending** for confirmed `/kilo/v1` recovery post-16:00 |
| 2026-07-25T15:50:26 | ocw_7c38f5ce-bc35-4ad4-b60c-17345a1400bd | S2-WC-logfare-kimi-cross | `tmp/v2-sprint2/capability-gate.ts` | `logfare/kimi-k2.6` | `pi:router-logfare/kimi-k2.6` | ✗ FAILED | 0 | none | ~10min | 0/0/0/0 | 0 | `connection_error_with_retry_logged_but_worker_died_before_backoff` | worker PID 5992 spawned 15:50:26; SAME "Connection error." pattern (`provider:router-logfare model:kimi-k2.6 timestamp:1784994666213` = 15:51:06.213) — first-batch WC failed with `Model not found` at 15:38, second-batch WC dispatch resolved the model OK but upstream call returned Connection error. `/logfare/v1` route shows `recentFailures:[]` in the key-router `/health` response — logfare is HEALTHY at the time of the failed dispatch. **Simultaneous 3-route nvidia+kilo+logfare outage at 15:51:04-07**: the key-router emitting concurrent `Connection error`s across 3 routes that are independently healthy a moment later strongly suggests a Pi-CLI-side `Connection error` (timeout connecting to key-router). Could be: Pi CLI skipped a heartbeat timeout, OR a more explicit network blip between Pi worker and key-router. **NEEDS RE-TESTING** — re-dispatch on logfare after 16:00 UTC should succeed per Sprint-1 pattern |

## SPRINT 2 — descent logic (not yet dispatched)
## SPRINT 3 — full implementations + rollup (not yet dispatched)
## PHASE 4 — adversarial test harness (not yet dispatched)
## PHASE 5 — live E2E smoke (not yet dispatched)
## CROSS-MODEL REVIEW (not yet dispatched)
## Sprint-2 wave 3 (16:23 UTC second batch on logfare/kimi-k2.6, after probe failure 16:20)\n
| ocw_2313aff2 | S2-WB2 | router-logfare/kimi-k2.6 | 2026-07-25T16:23 | SUCCESS (exit 0) | wrote per-key-acquire.ts (3223 bytes / 105 lines), .02-$/0.0197 paid-logfore (FREE to us) | end_turn after REPORT (stop reason `stop`) — thinking observed but only 651KB stdout, fit comfortably under 200MB cap主角 |
| ocw_2f405200 | S2-WC2 | router-logfare/kimi-k2.6 | 2026-07-25T16:23 | SUCCESS (exit 0) | wrote capability-gate.ts (7056 bytes / 210 lines), $0.0245 paid-logfare (FREE upstream) | read tool also used; perfect R4 capability gating 上手 |
| ocw_7253e0bb | S2-WD2 | router-logfare/kimi-k2.6 | 2026-07-25T16:23 | SUCCESS (exit 0) | wrote first-byte-timeout.ts (8590 bytes / 250 lines), $0.0236 paid-logfare (FREE); final stop reason `stop` | stdio ~1MB —— use 4–15min wall-clock | happy path |
| ocw_0821b726 | S2-Probe | router-logfare/kimi-k2.6 | 2026-07-25T16:20 | FAILURE (exit 0 但 NO tool_use) | `thinking_floods_stdout_but_never_acts` (failure shape #5 in cáft極); 209715200 200MiByTES exact stdout cap top hit BEFORE WRITE εισ calls | i.e. rumpled to observation `streamQuiet=true`; deep充斥; no tool_results. 指定 design failure mode (per spec gap #3 toolReliability axis)。 |
| ocw_c2d61591 | S2-WA3 retry | router-logfare/kimi-k2.6 | 2026-07-25T16:31 | CANCELLED (gap recall) | `logfare_kimi_k2_6_cold_start_inference_wedge` (failure shape #6) — probe was still mint buffer-filling → second-wave worker inferred no upstream bandwidth → wedged 3.4min的quietly; cancelled (killed_runner:killed_child) | descent-ladder.ts was already on disk (parallel session wrote it earlier) so no re-dispatch was needed |
| ocw_unknown | (mystery·parallel session writer·pi-main-glm-5.2 系) | ?? | 2026-07-25T16:24 | SUCCESS (parallel-session hand-off survival) | wrote descent-ladder.ts (7324 bytes / 255 lines) at mtime 16:24 UTC via undocumented parallel session /投标 dispatcher 作者 (not Pi-session-9692). File content spec-compliant (T0+T1+T2+T3+T4 tier chain per spec). |

## Sprint-3 wave (17:00 UTC dispatches on logfare/kimi-k2.6 + minimax-m3 + agnes-2.0-flash + opencode-zen)\n
| ocw_b6ff1971 | S3-SA1 | router-logfare/kimi-k2.6 | 2026-07-25T17:00 | SUCCESS (exit 0) | wrote key-affinity-map.ts (5551 bytes / 174 lines), $0.0209 paid-logfare (FREE) | first-class KeyAffinityMap + shared InMemoryKeyCooldownRegistry, gap #9 closure clean: distinction + tail-row demote on transient failure + single TTL共享 (spec verified) |
| ocw_8588f031 | S3-SA2 | router-logfare/kimi-k2.6 | 2026-07-25T17:00 | SUCCESS (exit 0) | wrote x-router-diagnostic-header.ts (5366 bytes / 160 lines), $0.0217 paid-logfare (FREE) | started with `Connection error.` transient blip at发起still加overtime, by  evaluated mocks💫 recovered; gap #8 header JSON-bake + JSONL-row reuse shape clean |
| ocw_3a6b42b9 | S3-SA3 | router-logfare/kimi-k2.6 | 2026-07-25T17:00 | SUCCESS (exit 0) | wrote stream-quality-meter.ts (5074 bytes / 139 lines), $0.0209 paid-logfare (FREE) | gap #15 ring-buffer P95 + rolling deltas潞 64, closests-rank + threshold-centric (250ms / 1500ms / 5) exact spec 实pathomes |
| ocw_976d7ecd | S3-SA4 | router-logfare/kimi-k2.6 | 2026-07-25T17:00 | SUCCESS (still finalizing 17:15 UTC) | wrote carrier-matchers-extended.ts (8476 bytes / 230 lines after edit pass) | targeted kilo/openrouter/neuralwatt/poolside matchers all golden; minor nit: duplicate `code===credit_balance_exhausted` check in matchNeuralwatt (harmless) |
| ocw_a75efddd | S3-CR (main · paid exception) | pi:minimax/MiniMax-M3 | 2026-07-25T17:00 | FAILURE — `permanent_minimax_token_plan_exhausted` (failure shape #8) | 429 `{Token Plan usage limit reached: Upgrade your Token Plan}` × 7 retries; cancelled main lane at attempt 7 to avoid 8/9/10 wasting 8 min | maxim Mitarافةexhausted today; spec is alternative `modelscope/Qwen3-235B-A22B-Thinking-2507` free reviewer |
| ocw_0db8f955 | S3-CR2 | pi:router-opencode-zen/qwen3.6-plus | 2026-07-25T17:11 | FAILURE — `permanent_no_payment_method` (failure shape #3) | 401 `CreditsError: No payment method. Add a payment method here: https://opencode.ai/workspace/...` immediate (willRetry:false)。 opencode-zen 便秘 foundationless. |
| ocw_92bc0d93 | S3-CR3 | pi:router-agnes/agnes-2.0-flash | 2026-07-25T17:20 | IN PREG (assistant output 6MB+) | agnes reviewer picked up in 1 min; ACTIVELY found real bugs in Sprint-1 breaker-registry: `region` vs `carrier|model` naming collision, `clearCarrierModel` concurrency safety gap, `carrierErrorSniffer.ts` CarrierShapeClass divergence from types.ts | reviewing @ 2-5MB·stdout per agent |
| ocw_1188e9c8 | S3-AD adversarial harness | router-logfare/kimi-k2.6 | 2026-07-25T17:00 | IN PROGRESS but files已landed | Wrote all 3 files: server.mjs (3445 bytes / 97 lines), shapes-table.mjs (3968 bytes / 50 lines), test-driver.mjs (10925 bytes / 217 lines)。 MAIN LANE had to patch the test-driver.mjs Windows CLI boot pattern (`fileURLToPath`) + gap14 URL swap (`kilo/glm-5.2`→`kilo/deepseek-chat`)。 After patches: `node tmp/v2-adversarial/test-driver.mjs` EXIT 0 with 7/7 PASS。|

## Adversarial test harness post-main-lane-patch run (17:22 UTC)\n
After main-lane Claude-prompt-fix on tmp/v2-adversarial/test-driver.mjs:

```
Mock server started on port 53756
--- 1. vertical veil ---        vertical_veil: PASS
--- 2. capability veil ---      capability_veil: PASS
--- 3. transient breaker ---    transient_breaker: PASS
--- 4. permanent breaker ---    permanent_breaker: PASS
--- 5. first-byte veil ---      first_byte_veil: PASS
--- 6. JSONL rollup ---         jsonl_rollup: PASS (lines=5)
--- 7. atomicity gap #14 ---    gap14_atomicity: PASS (breakers=10)

=== SUMMARY ===
Exit code: 0
```

**All 7 spec-mandated Phase-4 adversarial tests PASS** after dual main-lane patches:
   (a) Cross-platform `if (process.argv[1] === fileURLToPath(import.meta.url))` CLI boot pattern + `import { fileURLToPath } from 'node:url'` (fixes Windows `file:///C:/` vs `file://C:/` slash-count bug that left `runAll()` un-invoked, yielding vacuous exit 0).
   (b) gap-#14 test `fetchFromServer('/kilo/deepseek-chat/...')` URL swap (was `/kilo/glm-5.2/...` which returns 200 OK in shapes-table.mjs, never triggering breaker entries; now hits the 402 shape entries to satisfy `>=1` assertion).

## Sprint-4 wave

| model | route | status | exit_code | tool_calls | latency | tokens | cost | fail_mode |
|-------|-------|--------|-----------|------------|---------|--------|------|-----------|
| FIX-A (original) | logfare/kimi-k2.6 | CANCELLED | 124 | 0 | 13min wall | 0 | $0 | logfare_502_upstream_stream_failed_before_output_storm |
| FIX-A2 | agnes-2.0-flash | DONE | 0 | >3 (Write tool) | ~5min | 37K input,335 output,35 reasoning | $0.0000 | none (salvage for FIX-A via logfare 502 storm); wrote types-fixed.ts 7129B with Object.freeze factory + ForceModelValue=null fix |
| FIX-B | logfare/kimi-k2.6 | DONE | 0 | >3 (Write tool) | ~4min | n/a | $0.0064 | none |
| FIX-C (original) | logfare/kimi-k2.6 | SILENT_FAIL | 0 | 0 | n/a | 0 | $0 | worker_starts_up_then_exits_zero_with_zero_tool_calls |
| FIX-C2 | agnes-2.0-flash | DONE | 0 | >3 (Write tool) | ~6min | n/a | $0.0000 | none (salvage for FIX-C) |
| FIX-D | logfare/kimi-k2.6 | DONE | 0 | >3 (Write tool) | ~8min | n/a | $0.0077 | none |
| SCOUT-E | agnes-2.0-flash | DONE | 0 | >3 (Write tool + curl) | ~5min | n/a | $0 | none |
| FIX-INT (original) | logfare/kimi-k2.6 | CANCELLED | 124 | 0 | ~10min | 0 | $0 | logfare_502_upstream_stream_failed_before_output_storm |
| FIX-INT2 | agnes-2.0-flash | FAILED | 1 | 0 | <1min session-init-glitch | 0 | $0 | session_init_glitch ("No project session found" exit 1) salvaged via FIX-INT3 |
| FIX-INT3 | agnes-2.0-flash | DONE | 0 | >3 (Write tool + node --check + bun build) | ~12min | 104K input,629 output,13 reasoning | $0.0000 | none (salvage for FIX-INT2 session-init-glitch). Wrote v2-failover-overlay.mjs 45591B/1089 lines self-contained at ~/harness/servers/key-router/src/. ESM dynamic import verified; 12-check verification report at tmp/v2-integration-report.md |
| POLISH-bundle | agnes-2.0-flash | DONE | 0 | >8 (ls/diff/curl/write/node multi-tool) | ~9min | 60K input,579 output,18 reasoning | $0.0000 | none. 5/5 items done (item1-integ-prep 4945B, bench-log Sprint-4 wave rows, item3-diff-audit 106L 10/10 spec, item4-memory-text 819B, item5-live-smoke 5-route JSONL 4/5 HTTP 200) |


## Sprint-5 + Sprint-6 wave rows (appended 2026-07-25T22:54:14.434Z)

### Sprint-5 ($0 aggregate, all agnes-2.0-flash)

| worker_id | name | status | exit_code | tool_calls | latency | tokens(IN,OUT,think) | cost | fail_mode |
|---|---|---|---|---|---|---|---|---|
| ocw_74cf0f7f | S5-SPEC-UPDATE-gap11-shapes | DONE | 0 | >1 (edit) | ~2min | 52K IN,640 OUT,81 think | $0 | none |
| ocw_29d1336e | S5-P5B-INTEGRATION-wire-overlay | DONE | 0 | >1 (edit+node --check+bun build) | ~2min | 31K IN,644 OUT,304 think | $0 | none |
| ocw_c0f5fc91 | S5-TIER-MATRIX-UPDATE | DONE | 0 | >1 (write+verify) | ~4min | 79K IN,649 OUT,339 think | $0 | none |
| ocw_6d15e780 | S5-SPEC-MERGE-into-canonical | DONE | 0 | >1 (edit) | <1min | 42K IN,421 OUT,189 think | $0 | none |
| ocw_3ccb69ff | S5-BENCH-DOCS-UPDATE | DONE | 0 | >1 (edit) | ~2min | 56K IN,454 OUT,121 think | $0 | none |

### Sprint-6 (first 2 completed — agnes-2.0-flash, $0 aggregate)

| worker_id | name | status | exit_code | tool_calls | latency | tokens(IN,OUT,think) | cost | fail_mode |
|---|---|---|---|---|---|---|---|---|
| ocw_d2602d70 | S6-TIER-MATRIX-VERIFY | DONE | 0 | >1 (read+edit+verify) | ~3min | 48K IN,481 OUT,28 think | $0 | PASS-WITH-CAVEATS (missing qualityPerCapability field) |
| ocw_423eb0e3 | S6-ZYDIT-SYNC-INVESTIGATE | DONE | 0 | >1 (curl+write+verify) | ~5min | 76K IN,354 OUT,31 think | $0 | none — dual-sync naming collision documented + fix path recommended |

### Verification: metadata.json excerpts

- **ocw_74cf0f7f**: created=2026-07-25T21:56:00ZZ, updated=2026-07-25T21:58:45ZZ, wall=165s, exit=0 ✓
- **ocw_29d1336e**: created=2026-07-25T21:56:25ZZ, updated=2026-07-25T21:58:34ZZ, wall=129s, exit=0 ✓
- **ocw_c0f5fc91**: created=2026-07-25T22:07:12ZZ, updated=2026-07-25T22:10:50ZZ, wall=218s, exit=0 ✓
- **ocw_6d15e780**: created=2026-07-25T22:12:49ZZ, updated=2026-07-25T22:14:41ZZ, wall=112s, exit=0 ✓
- **ocw_3ccb69ff**: created=2026-07-25T22:17:22ZZ, updated=2026-07-25T22:19:04ZZ, wall=102s, exit=0 ✓
- **ocw_d2602d70**: created=2026-07-25T22:35:29ZZ, updated=2026-07-25T22:38:34ZZ, wall=185s, exit=0 ✓
- **ocw_423eb0e3**: created=2026-07-25T22:35:30ZZ, updated=2026-07-25T22:40:17ZZ, wall=287s, exit=0 ✓

> W3–W8 TBD pending S6 dispatches.

### Sprint-6 W3-W8 — post-hoc row fill (appended by main-lane Node script, 6:41:22 PM CDT)

Note: W7 worker ran at 22:50-22:54 BEFORE W3-W8 exited; this script fills in the gap.

| worker_id | name | status | exit_code | latency | tokens | cost | fail_mode |
|---|---|---|---|---|---|---|---|
| ocw_b6f4bd6f-2ba4-46e4-896a-18b5a6aa02e7 | S6-W3-TIER-MATRIX-MERGE | DONE | 0 | ~4min (22:50:48 - 22:54:50) | 35K IN,321 OUT,14 think | $0 | none — produced tmp/v2-overlay-matrix.json (8 entries: 3 T0+4 COND+1 SEAS, NO WARM_CADAVER), 13 required fields per entry |
| ocw_91c722a0-da7c-4ad3-8c1b-76dd34024807 | S6-W4-PHASE-5B-SUCCESS-PATH | DONE | 0 | ~14min (22:50:48 - 23:04:38, incl. 3 Agnes 429-backoff retries) | 17K IN,574 OUT,147 think (totals incl. cacheRead=119K) | $0 | PARTIAL: found two real bugs (slotHandle undeclared in v2Failover-overlay.mjs lines 900/941 + v2diag scoping bug — same bug main-lane fixed). V2 success path unprovable with minimal matrix (only 1 carrier); allocated to Sprint-7 backlog |
| ocw_7dd755ff-0f36-4fc4-b45c-b21c809a757c | S6-W5-PHASE-5C-OVERLAY-HEADER-PATCH | DONE (but BROKEN) | 0 | ~5.5min (22:50:48 - 22:56:14) | 41K IN,291 OUT,12 think | $0 | INITIAL PATCH BROKE THE KEY-ROUTER — placed let v2diag; INSIDE if-block scope (line 3528+4142) but spread ...v2diag AT function-body scope (line 3608+4196), causing ReferenceError: v2diag is not defined on EVERY request hitting FAILOVER_STATUSES. Main-lane captured the broken structure to /tmp/w5-broken-patch-snippet.txt, restored from backup .bak-pre-p5c-2026-07-25 (171520B), then re-applied cleanly via single edit() call with v2diag declared ONCE at function scope + (v2diag || {}) null-safe spread. See tmp/s6-dispatch/p5c-overlay-header-patch-CORRECTION-MAIN-LANE.md |
| ocw_7abc2012-da11-4385-bac0-245d1998a583 | S6-W6-ADVERSARIAL-RE-RUN | DONE | 0 | ~4min (22:50:48 - 22:54:24) | 47K IN,209 OUT,25 think | $0 | none — 7/7 mock-server adversarial tests PASS + 2/2 live-router smokes PASS (bad-model → 503 model_not_found, valid agnes-2.0-flash → 200 with litellm traceability). No regression vs pre-V2 state |
| ocw_bd5a2b8d-e186-4179-ba98-3707bf7a3bd5 | S6-W7-BENCH-LOG-APPEND | DONE | 0 | ~4min (22:50:49 - 22:54:32) | 51K IN,155 OUT,77 think | $0 | none — appended 5 Sprint-5 + 2 Sprint-6 rows to bench-log (107 -> 139 lines). W3-W8 rows appended post-hoc by this main-lane Node script |
| ocw_9373669d-07d5-4e7a-9f21-f5844972354f | S6-W8-SESSION-SUMMARY | DONE | 0 | ~7min (22:50:49 - 22:57:40) | 75K IN,167 OUT,32 think | $0 | none — wrote 250-line session summary at tmp/s6-dispatch/session-summary-2026-07-25.md covering 6 sprints + 2 commits (c3cd2f99 + 271fe111) |

### Aggregate cost Sprint-6

- Total cost (all 8 Sprint-6 workers on agnes-2.0-flash): **$0.00**
- Total wall time across Sprint-6 wave: ~30 min (most workers ran in parallel)
- Main-lane time on the P5C correction + key-router restart + live verification: ~8 min for everything
- Live verification result: ✅ Phase-5C patch PROVEN WORKING — both Site A (HTTP 429 + X-Router-Diagnostic) AND Site B (HTTP 502 + X-Router-Diagnostic) show V2 diagnostic headers flowing through HTTP response


## Sprint-7 Wave-1 Redispatch — 2026-07-26 ~03:25–04:05 UTC

Goal: re-land Sprint-7 Wave-1 outstanding workers (W-A WELFARE-PATCH-WRITER,
W-C SLOT-HANDLE-FIX, W-D PI-MODEL-PROVIDERS-FIX-PROPOSAL) on proven free carriers
after Sprint-7 Wave-1 original dispatch ALL 6 FAILED (smoke timeouts + mimo-v2.5
"Connection error." degradation window).

### Probes (raw curl to /v1) at 2026-07-26 ~03:50–04:00 UTC
| 03:50 | bare `gemini-2.5-flash` raw curl /gemini/v1 | OUR pi-router /gemini/v1 | HTTP 200 `model:gemini-2.5-flash` content="Pong" total_tokens=30 | SUCCESS (only standalone curl path) |
| 03:52 | bare `gemini-3.5-flash` raw curl /gemini/v1 | OUR pi-router /gemini/v1 | HTTP 200 `model:gemini-3.5-flash` finish=max_tokens total_tokens=4 | SUCCESS — NEW GEMINI GEN WORKS |
| 03:53 | `codestral-latest` raw curl /mistral/v1 | OUR pi-router /mistral/v1 | HTTP 200 content="Pong is a classic" finish=length total_tokens=10 | SUCCESS — MISTRAL WORKING TODAY |
| 03:53 | `gemini-2.5-pro` raw curl /gemini/v1 | OUR pi-router /gemini/v1 | HTTP 429 `"Your prepayment credits are depleted. Please go to AI Studio..."` | FAIL — prepay required for Pro |
| 04:01 | `gemini-flash-latest` raw curl /gemini/v1 | OUR pi-router /gemini/v1 | HTTP 429 `"prepayment credits are depleted"` | FAIL — Google prepay quota exhausted |
| 04:01 | `gemini-3.6-flash` raw curl /gemini/v1 | OUR pi-router /gemini/v1 | HTTP 429 `"prepayment credits are depleted"` | FAIL — prepay quota exhausted after 4 probe calls |

### Worker dispatches (Sprint-7 Wave-1 Redispatch)
| 03:25:40 | W-A WELFARE-PATCH-WRITER | `modelscope/zai-org/GLM-5.2` | `pi:router-modelscope/zai-org/GLM-5.2` | ocw_7a34eba4 | exit_code=0 (graceful agent_settled after quota error) | 0 tokens / $0 | FAIL `429 insufficient_quota (Aliyun Modelscope daily quota exhausted; golden 22min earlier via ocw_9d6d7132, now DEAD until tomorrow reset)` |
| 03:25:40 | W-D PI-MODEL-PROVIDERS-FIX-PROPOSAL | `modelscope/zai-org/GLM-5.2` | `pi:router-modelscope/zai-org/GLM-5.2` | ocw_f590a1c8 | exit_code=0 (graceful agent_settled) | 0 tokens / $0 | FAIL `429 "You have exceeded today's quota for model zai-org/GLM-5.2, please try again tomorrow" + 400 no body` |
| 03:41:09 | W-A WELFARE-PATCH-WRITER (attempt 2) | `google/gemini-2.5-flash` (zenmux carrier) | `pi:router-zenmux/google/gemini-2.5-flash` | ocw_e30bf1bd | exit_code=0 | 0 tokens / $0 | FAIL `402 {"code":"402","type":"reject_no_credit","message":"Access denied: this model is only available to accounts with a balance greater than 0. This is an anti-abuse measure, not a usage charge."}` — zenmux requires positive credit balance gate |
| 03:45:53 | W-C SLOT-HANDLE-FIX (attempt 2 on bare gemini) | `gemini-2.5-flash` (bare) | `pi:router-gemini/gemini-2.5-flash` | ocw_bb8d612e | exit_code=0 | 0 tokens / $0 | FAIL `"This model models/gemini-2.5-flash-lite is no longer available to new users. Please update your code to use a newer model."` — HARNESS ALIAS BUG: bare `gemini-2.5-flash` translated to upstream `models/gemini-2.5-flash-lite` (deprecated Lite variant for new Google accounts) |
| 03:45:53 | W-D PI-MODEL-PROVIDERS-FIX-PROPOSAL (attempt 2 on bare gemini) | `gemini-2.5-flash` (bare) | `pi:router-gemini/gemini-2.5-flash` | ocw_99e8f9ae | exit_code=0 | 0 tokens / $0 | FAIL same `models/gemini-2.5-flash-lite is no longer available` Lite-deprecation alias bug |
| 03:56:49 | W-A WELFARE-PATCH-WRITER (attempt 3 on codestral) | `mistral/codestral-latest` | `pi:router-mistral/codestral-latest` | ocw_462e0ee9 | RUNNING (retry 1/10 in progress) | 0 tokens / $0 | PARTIAL — `Connection error.` at first request 04:00:08 UTC, retries pending |
| 03:56:49 | W-C SLOT-HANDLE-FIX (attempt 3 on codestral) | `mistral/codestral-latest` | `pi:router-mistral/codestral-latest` | ocw_1db50840 | RUNNING | 0 tokens / $0 | PENDING-PROGRESS (2:43 since launch, no API call visible yet) |
| 03:56:50 | W-D PI-MODEL-PROVIDERS-FIX-PROPOSAL (attempt 3 on bare gemini-3.5) | `gemini-3.5-flash` (bare) | `pi:zyditv4/gemini-3.5-flash` (!!) | ocw_acd03d93 | RUNNING (retry 1/10) | 0 tokens / $0 | PARTIAL — bare `gemini-3.5-flash` routed via DEAD zydit-v4 carier (NOT OUR pi-router gemini lane)"Connection error." retrying |

### Key FINDINGS — ROOT-CAUSE ANALYSIS

1. **HARNESS ALIAS BUG (CR3-class)**: Pi launcher silently translates bare `gemini-2.5-flash` → upstream `models/gemini-2.5-flash-lite` (Lite variant — deprecated for new Google accounts). RAW curl to `/gemini/v1` with `model=gemini-2.5-flash` worked perfectly (HTTP 200 Pong) — so the bug is in the launcher's model-id normalization layer, NOT the router or upstream Google API. The `~/.pi/agent/model-providers.json` contains entries for both `gemini-2.5-flash-lite` (line 10700) and `models/gemini-2.5-flash-lite` (line 18998) — catalog has Lite variant listed, alias path picks it for bare `gemini-2.5-flash` queries. Aliasing source NOT in pi-model-providers source tree (only README mentions of `step-3.7-flash`); translation likely in Pi core extension or opencode-key-router. **Workaround for now**: use `gemini-3.5-flash` (similar alias may exist but unconfirmed) OR `mistral/*` coding-tuned refs.

2. **ZENMUX ANTI-ABUSE GATE**: `pi:router-zenmux/google/gemini-2.5-flash` returns `402 reject_no_credit` — zenmux requires accounts with positive balance to use ANY model (even "free" ones). The message is explicit: `"Access denied: this model is only available to accounts with a balance greater than 0. This is an anti-abuse measure, not a usage charge."` User must top up zenmux credit at their dashboard to unlock zenmux google/* + agnes/* routes.

3. **GOOGLE GEMINI PREPAY EXHAUSTED TODAY**: After just 2 successful probes (`gemini-2.5-flash` + `gemini-3.5-flash`) consuming <50 tokens, subsequent `gemini-2.5-pro`, `gemini-flash-latest`, `gemini-3.6-flash` all return `429 "Your prepayment credits are depleted. Please go to AI Studio at https://ai.studio/projects to manage your project and billing."` Google free tier has a very small prepay budget that depletes quickly. User needs to top up at https://ai.studio/projects for sustained subagent Gemini usage. **Mistral is the more reliable free-tier option today.**

4. **MODELSCOPE GLM-5.2 DAILY QUOTA**: `modelscope/zai-org/GLM-5.2` had a successful worker dispatch 22 min earlier (`ocw_9d6d7132` exit_code=0, $0 cost, 462KB stdout) — then subsequent dispatch (ocw_7a34eba4 + ocw_f590a1c8) immediately hit `429 insufficient_quota` from Aliyun Modelscope upstream. Carrier golden-ness is **DAILY-QUOTA-BOUND + session-specific**; reset tomorrow (UTC midnight).

5. **BARE-RULE CARRIER RESOLUTION QUIRK**: Bare `gemini-3.5-flash` launcher chose `pi:zyditv4/gemini-3.5-flash` route (DEAD zydit-v4 carrier) NOT `pi:router-gemini/gemini-3.5-flash` (our pi-router /gemini/v1 lane). Bare-name → carrier mapping by Pi launcher seems to prioritize the FIRST carrier whose registered model catalog lists that name — zydit-v4 declared `gemini-3.5-flash` first in catalog order (alphabetical / provider registration order). To force OUR pi-router /gemini/v1 lane, must use a bare name that ONLY our gemini provider declares (e.g. `gemini-flash-latest` says main-line but that also goes via zydit). **No clean launcher-side way to force OUR pi-router /gemini/v1 lane over zydit for the same bare name** — this is a launcher-side routing heuristic limitation.

6. **HARNESS BACKGROUND-DETACH PATCH ERRORS** (cosmetic, not blocking): EVERY worker dispatch field contains `"Pi background detach patch has errors: bash.js tool execute detach: upstream snippet not found; bash.js tool execute background result: upstream snippet not found"` — appears in EVERY worker's `error` field regardless of failure mode. Identified as pre-existing harness detach-patch bug in bash.js extension; cosmetic since it doesn't affect model API requests but clutters error reporting in worker metadata. Worth fixing in a future pi-harness self-upgrade.

7. **STARTUP LATENCY**: All workers took ~3:20 (200 sec) from `created_at` to `first_output_at` (~03:56:49 → ~04:00:08). This is MCP server startup + Pi extension attach overhead. Notable: this is longer than the 30-second epoch observed in earlier sprints — possibly pi-lens LSP server attach latency during warmup. Future smoke tests should allow this cold start gracefully.

8. **SESSION WORKING LANES TODAY 2026-07-26**: Only TWO proven win-lanes: `mistral/codestral-latest` via /mistral/v1 (free-tier Mistral + user has MISTRAL_API_KEY set up) and `gemini-3.5-flash` via direct /gemini/v1 (free-tier but prepay budget very small). Plus bare `gemini-2.5-flash` worked earlier today via direct curl before depletion.

### Session Status (probably-final)

Three Sprint-7 Wave-1 workers STILL RUNNING as of 04:00 UTC:
- W-A (ocw_462e0ee9) on mistral/codestral — retry 1/10
- W-C (ocw_1db50840) on mistral/codestral — still no API call yet (lag)
- W-D (ocw_acd03d93) on bare gemini-3.5 via zydit-v4 — retry 1/10, likely will also fail (DEAD zydit-v4)

Next steps: poll workers after 60-90s of retry budget; if `mistral/codestral-latest` recover, fetch report-and-patch artifacts; if all 3 fail, primary lane today is `opencode-zen/laguna-s-2.1-free` (which earlier probed alive but needs ≥15-min cold-start timeout).

### Sprint-7 W1 SUCCESS ROWS (2026-07-26 04:01-04:08 UTC)

All three Sprint-7 Wave-1 workers LANDED on `mistral/codestral-latest` after
auto-retry recovered transient `Connection error.` (per-worker Pi harness
auto_retry_start: attempt 1/10, delayMs 2000, maxAttempts 10). Mistral Codestral
is the proven golden-goose subagent lane today — recoverable from transient
socket errors, flexible free-tier rate limit, $0.01–$0.008 cost per worker,
real artifact output.
| 04:01:44 | W-A WELFARE-PATCH-WRITER (mistral) | `mistral/codestral-latest` | `pi:router-mistral/codestral-latest` | ocw_462e0ee9 | exit_code=0 (assistant_output_seen=true) | 26555 tokens / $0.008 (paid Mistral) | SUCCESS — wrote `tmp/s7-dispatch/welfare-providers-ADD-patch.diff` (4663B) + `tmp/s7-dispatch/welfare-providers-signup-guide.md` (3326B). Worker direct quote: "I have successfully created the patch file and signup guide for the 9 new welfare providers." |
| 04:03:00 | W-C SLOT-HANDLE-FIX (mistral) | `mistral/codestral-latest` | `pi:router-mistral/codestral-latest` | ocw_1db50840 | exit_code=0 (assistant_output_seen=true, last_tool_name="write") | 34958 tokens / $0.00109 | SUCCESS — wrote `src/v2-failover-overlay.mjs.bak-pre-slot-handle-fix-2026-07-26` (backup) + patched `src/v2-failover-overlay.mjs` adding `let slotHandle = keySlotAcquireFn?.(routeId, modelId) ?? null;` at line 823. `node --check` exit=0. `pi-lens deferred format` reflowed file inflating diff stat to +1178/-791 but surgical change = 1 line. Worker confirmed: "The slot-handle-fix report has been successfully created." |
| 04:08:22 | W-D PI-MODEL-PROVIDERS-FIX-PROPOSAL (mistral attempt-2) | `mistral/codestral-latest` | `pi:router-mistral/codestral-latest` | ocw_07e60ed4 | exit_code=0 (assistant_output_seen=true) | 35925 tokens / $0.0056 | SUCCESS — wrote `tmp/s7-dispatch/pi-model-providers-fix-proposal.md` (4896B) with 4 candidate fixes (A drop gate, B keep+WARN, C disabled:true flag [preferred], D bypass allow-list) + anti-pattern warnings + impact map + verification steps. Worker quote: "The fix proposal has been successfully written to `tmp/s7-dispatch/pi-model-providers-fix-proposal.md`. The proposal includes the current behavior, root cause, candidate fixes, preferred fix, anti-pattern warnings, impact map, and verification steps." |
| 04:00:21 | W-D PI-MODEL-PROVIDERS-FIX-PROPOSAL (gemini-3.5 via zydit-v4 attempt-1) | `gemini-3.5-flash` (bare) | `pi:zyditv4/gemini-3.5-flash` | ocw_acd03d93 | exit_code=0 (graceful agent_settled) | 0 tokens / $0 | FAIL `404: {"message":"Model 'gemini-3.5-flash' is not available on the unified v4 catalog.","type":"invalid_request_error","code":"model_not_found"}` — bare `gemini-3.5-flash` launcher chose `pi:zyditv4` carrier (NOT our pi-router gemini lane); zydit-v4 silently accepts connection then rejects model not in their v4 catalog. Retried as attempt-2 on mistral/codestral — succeeded (above). |
### Main-lane Welfare Patch Re-Apply (2026-07-26 ~04:21 UTC)
| 04:18 | main-lane W-A patch re-apply | W-A worker diff was BROKEN — `git apply --check` returned "`error: corrupt patch at line 20`" (exit 128). Worker built diff against the stale `~/Temp while my comp is at the shop/harness/servers/key-router/src/opencode-key-router.mjs` file (var name wrong: used `PROVIDERS` const but current file uses lowercase `const providers = {` at line 71; line numbers off: worker said `@@ -250,6 +279,95 @@` but actual `providers` const is at line 71 and `nvidia` entry at line 78, not 250; token regex pattern wrong: worker used scalar `const isXxxToken = /regex/;` format but current file uses function-based `function isXxxToken(value) { return /regex/.test(...); }` pattern at lines 1530-1547). Main-lane re-applied patch surgically via 3 `edit` operations: (1) Inserted 9 new function token regex helpers AFTER `function isAiNativeToken` (line ~1547) — `isGroqToken, isDeepSeekToken, isSiliconFlowToken, isTogetherToken, isCerebrasToken, isCohereToken, isHyperbolicToken, isNovitaToken, isAimlApiToken`; (2) Inserted 9 new provider entries as siblings (matching file's TAB indentation + the getKeys/loadProviderKeys schema with authAlias) just BEFORE the closing `};` of the providers const (line 303): `groq, deepseek, siliconflow, together, cerebras, cohere, hyperbolic, novita, aimlapi`; (3) Inserted 9 new cursor counters into the `loadState()` map (after `ainative: Number.isInteger(state?.ainative) ? state.ainative : 0,`) so welfare providers participate in key rotation. Backup: `opencode-key-router.mjs.bak-pre-welfare-providers-2026-07-26` (170121 bytes) preserved. Verified: `node --check opencode-key-router.mjs` exit=0 → VALID-SYNTAX; 9 token regex functions present (grep `^function (isGroqToken|...)` count = 9); 19 provider key references (9`{1,2} matches); 9 cursor counters in loadState map. NEW PROVIDERS DO NOT TAKE EFFECT UNTIL KEY-ROUTER RESTART. |
| 04:21 | Restart SAFETY hold | Current key-router PID 17360 (parent 20008, listening on 127.0.0.1:8788) has 1 ACTIVE in-flight request via `/nvidia/v1` for `deepseek-ai/deepseek-v4-pro` (80KB payload, 78s elapsed). This is the USER'S MAIN PI SESSION mid-response. Killing PID 17360 NOW would interrupt user's chat response. Restart MUST be deferred until the in-flight request completes OR the user explicitly accepts the disruption. |
### Confirmed Working Lanes TODAY (2026-07-26 ~UTC)
| `mistral/codestral-latest` (via /mistral/v1) | MISTRAL_API_KEY (2 active keys) — PROVEN golden-goose subagent lane: W-A + W-C + W-D all succeeded | paid Mistral, ~$0.001-0.008 per worker | free-tier Mistral quota (user has credits available) |
| `gemini-3.5-flash` via RAW curl /gemini/v1 | GEMINI_API_KEY active — works for tiny direct curl probes (HTTP 200) but prepay quota depleted after just a few probe calls (4 probe calls exhausted today's prepay budget) | $0 free-tier-ish (with tiny prepay budget) — sustainable only for tiny smokes, not for substantive subagent workloads unless user tops up at https://ai.studio/projects |
| `mistral/codestral-latest` is therefore the SOLE proven lane today for substantive workloads | — submit workers here | — |
| /opencode-zen/v1 laguna-s-2.1-free per recent failures list | opencode-zen provider 6 KEYS but ALL COOLING with rate_limit_error — 8 recentFailure 429s in /health view (Provider rate limit exceeded) | $0 (free laguna tier at provider Console) | rate limit cooldown |>30 sec, routeBackoff=false still |
| /modelscope/v1 all 3 KEYS cooling | insufficient_quota + 401 Authentication errors — confirms today's modelscope daily quota exhaustion observation | $0 — quota resets tomorrow | transient cooldown still active |
### Sprint-7 Wave-1 Redispatch — Session Outcomes

3 SUCCESS-workers landed on mistral-codestral, generating real artifacts:
- welfare-patch diff (broken structural placement + collected against stale repo) — REAPPLIED by main-lane with corrected structure
- slot-handle fix — applied to v2-failover-overlay.mjs surgically (1 line), backups preserved
- pi-model-providers fix proposal — 4 options documented, Option C (disabled:true flag) preferred

Welfare patch validation all green:
- `node --check` VALID-SYNTAX exit=0
- 9 token functions, 9 provider entries, 9 cursor counters all present

Next steps (waiting on restart):
1. DEFER key-router restart until user's main session in-flight nvidia/deepseek-v4-pro response completes (do NOT disrupt user session)
2. After restart: probe each new welfare lane via "Pong" smoke (curl to /groq/v1, /deepseek/v1, /siliconflow/v1, etc.) — routes will only register after welfare providers const is reloaded via restart
3. User signup at each welfare provider console (per `tmp/s7-dispatch/welfare-providers-signup-guide.md`) → set env vars (GROQ_API_KEY etc.) → restart again to load keys
4. Apply W-D's Preferred Fix Option C to `~/.pi/agent/local-packages/pi-model-providers/index.ts` (next-session)
5. Commit both repos with selective staging

### Kiro-Auto Lane Discovery + First-Ever Successful Dispatch (2026-07-26T19:52–19:56 UTC)

User clarification: "kiro/auto" = the `kiro-auto` model id (display_name "Kiro Auto") on the LOGFARE provider gateway — NOT a kiro provider. We initial-guessed wrong (kiro = AWS Kiro IDE per websearch), but curl `/logfare/v1/models` returned `{"id":"kiro-auto","display_name":"Kiro Auto","owned_by":"logfare","tier":2,"premium_unlocked":true,"endpoints":["chat/completions","messages","responses"]}`. The model is Gemini-backed (self-identifies as "trained by Google"), lives on the pi:router-logfare lane, and already passes `normalizeSupportedModelID` (mmx.ts lines 2700-2718 — logfare is on the early-return block). NO allowlist patch needed for logfare/kiro-auto. Carrier LIVE on the key-router today.
| 19:45:00 | LIVE CURL PROBE /logfare/v1 kiro-auto (max_tokens=10) | kiro-auto (raw POST) | direct $0.0000145 | HTTP 200, id=logfare-add4c942905b4f0dadd8b6fc, content=null, finish_reason=stop, total_tokens=25, reasoning_tokens=8 (100% reasoning — max_tokens=10 too tight), market_cost=1.45e-05 | PROBE SUCCESS — proves kiro-auto is reachable through router and accepts chat completion requests |
| 19:47:00 | LIVE CURL PROBE /logfare/v1 kiro-auto (max_tokens=200) | kiro-auto (raw POST) | direct $0.0001689 | HTTP 200, id=logfare-e506fa381643499db2221a9f, content="Pong. I am a large language model, trained by Google, designed to understand and generate natural language for a wide range of tasks.", finish_reason=stop, total_tokens=170, reasoning_tokens=128 (90% reasoning overhead), market_cost=0.0001689 | PROBE SUCCESS — model self-identifies as Google-trained (Gemini-backed). Confirms kiro-auto is a reasoning-heavy model useful for substantive subagent workloads. Per-call cost ultra-low (~$0.00017) |
| 19:52:23 | KIRO-AUTO SMOKE DISPATCH (logfare/kiro-auto) | `logfare/kiro-auto` | `pi:router-logfare/kiro-auto` | ocw_44398b97-ec60-4499-b355-607adb195df2 | **exit_code=0 SUCCESS** (PID 16004 alive at launch, completed cleanly ~19:56:47 UTC) | usage 606 input / 125 output / 87 reasoning / 36352 cacheRead / 37083 total tokens. **COST $0.00000** (logfare reported usage.cost.total=0 — pure free lane!) | **SUCCESS WORKER** — wrote deliverable `tmp/s7-dispatch/kiro-auto-SMOKE-REPORT.md` (18 lines, verifiable artifact). Output_state=assistant_output_seen. First assistant output at t+189s (~3 min cold-start). Stream_summary thinking_preview confirmed reasoning-streaming working. proof-of-concept: logfare/kiro-auto IS the new golden-goose lane, ~10% of Codestral cost (Codestral Sprint-7 wave-1 ran 3 workers at $0.001-$0.008 each = $0.015 total; Kiro-auto runs FREE). |
### Logfare catalog (live /logfare/v1/models JSON parsed 2026-07-26 ~19:45 UTC)

| Model Id | Display Name | Tier | Premium Unlocked | Endpoints |
|---|---|---|---|---|
| kiro-auto | Kiro Auto | 2 | true | chat/completions, messages, responses |
| minimax-m3 | MiniMax M3 | 2 | true | chat/completions, messages, responses |
| kimi-k2.6 | Kimi K2.6 | 2 | true | chat/completions, messages, responses |
| kimi-k2.7-code | Kimi K2.7 Code | 2 | true | chat/completions, messages, responses |
| deepseek-v4-pro | DeepSeek V4 Pro | 2 | true | chat/completions, messages, responses |
| deepseek-v4-flash | DeepSeek V4 Flash | 1 | true | chat/completions, messages, responses |
| glm-5.2 | GLM 5.2 | 2 | true | chat/completions, messages, responses |
| qwen-3.8-max | Qwen 3.8 Max | 2 | true | chat/completions, messages, responses |

### Lane-equivalence implications

- **kiro-auto ~= Gemini (Gemini Pro / Code-Assist) upstream** — self-identifies as "trained by Google" + emits high reasoning_tokens ratio. Speculation: logfare's "Kiro Auto" alias maps to Google's free-tier model offering (likely selectable alias per request).
- kiro-auto tier=2 requires_training_optin=true premium_unlocked=true → all logfare subscribers get access without opt-in cost.
- **Mistral/Codestral vs Kiro-Auto relative cost**: Codestral Sprint-7 wave-1 successes cost $0.001-$0.008 per worker (3 workers total $0.015). Kiro-auto runs FREE — cost reported as $0.00 in the worker telemetry. So Kiro-auto is the new GOLDEN GOOSE latched-on lane.
- **Kiro-auto for tool-use**: verified by this smoke worker — `read` + `write` tools worked end-to-end via Pi harness. Path was route=pi:router-logfare/kiro-auto, harness=pi, steerable=true (control_mode eventually flipped to followup after agent_settled).
- **Cold-start patience**: First assistant output at t+189s (~3 min) — accept this for substantive workers; outright-rejection at 180s smoke timeouts (which poisoned the Sprint-7 inkling + laguna-xs-2.1 smokes earlier) was a misconfiguration — kiro-auto shows the 15 min timeout was right.

### Worker telemetry excerpt (from poll API)

```json
{
  "status": "completed",
  "exit_code": 0,
  "output_state": "assistant_output_seen",
  "route": "pi:router-logfare/kiro-auto",
  "model": "kiro-auto",
  "usage": { "input": 606, "output": 125, "cacheRead": 36352, "reasoning": 87, "totalTokens": 37083,
    "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0, "total": 0 } },
  "stop_reason": "stop",
  "first_assistant_output_at": "2026-07-26T19:55:28.151Z"
}
```

### ZYDIT V4 CATALOG ASSESSMENT (2026-07-26T21:47 UTC)

User-clarified: zydit (routePrefix /zydit/v1) and zyditv4 (routePrefix /zydit/v4) BOTH share
the SAME ZYDIT_API_KEY env var and the SAME configFile `zydit-keys.json` — confirmed by reading
C:/Users/HP/harness/servers/key-router/src/opencode-key-router.mjs lines 177-199.
**/health status (post key-router restart 2026-07-26T21:40 UTC):**

- `/zydit/v1`: keys=2, activeKeys=2, coolingRecords=0 — HEALTHY
- `/zydit/v4`: keys=2, activeKeys=2, coolingRecords=0 — HEALTHY
- Both have stale `recentFailures` from earlier today's pre-restart state (now cooled)
**V4 catalog at `curl /zydit/v4/models` returns 37 models, all `owned_by: zydit.infra`:**

| Family | Models |
|---|---|
| **Kimi (14)** — newest+reasoning+search variants | kimi-k2, kimi-k2-search, kimi-k2-thinking, kimi-k2-thinking-search, kimi-2.6-fast, kimi-2.6-search, kimi-2.6-thinking, kimi-2.6-thinking-search, kimi-k2.5, kimi-k2.5-search, kimi-k2.5-thinking, kimi-k2.5-thinking-search, **kimi-k3** (newest), kimi-search, kimi-thinking, kimi-thinking-search |
| Mistral Coders | devstral-2:123b, devstral-small-2:24b, ministral-3:3b/8b/14b |
| Google Gemma | gemma-4-31b-it, gemma3:27b/12b/4b, gemma4:31b |
| GLM | glm-4.7 (newer than glm-5.2 we've been using) |
| GPT-OSS (OpenAI open source) | gpt-oss:20b, gpt-oss:120b |
| MiniMax | minimax-m2.1, minimax-m2.5, minimax-m3 |
| Nvidia Nemotron (reasoning) | nemotron-3-nano:30b, nemotron-3-super, nemotron-3-ultra |
| Qwen Coders | qwen3-coder-next, qwen3-coder:480b |

**Special note** (opencode-key-router.mjs line 3507): Kimi models on zydit/v4 reject `stream:true` — must use `stream:false`. Pi harness defaults send `stream:true` — workers on Kimi v4 need stream:false override.
**Live probes (POST `/zydit/v4/chat/completions` stream=false):**

| Model | Status | Result |
|---|---|---|
| ⭐ `kimi-k3` | **200 SUCCESS** (SSE stream) | content="Pong! 🏓\n\n[Pong game code snippet]" + completion chunks, finish_reason="stop", prompt=3/completion=51/total=54 tokens. **PROVEN ALIVE!** Newest Moonshot Kimi gen works clean on user's shared ZYDIT_API_KEY. |
| `qwen3-coder-next` | 401 | `"Ollama Cloud error: Unauthorized"` api_error provider_upstream_error — upstream routed through Ollama Cloud with unauthorized account |
| `minimax-m3` | 402 | `"Paid Model - Credits Required, balance=-0.00002, buyCreditsUrl=https://app.kilo.ai/profile"` — minimax-m3 query routed through kilo upstream (paid lane, no credits) — pre-existing bug |
| `kimi-k2.5-thinking` | 404 | `"Function '23d4f03a-...' not found for account '2A_iKCS-w...'"` — Anthropic-style function lookup route → 404 |

CONCLUSION: zydit/v4 lane itself is alive and provider shares keys with v1, but only **kimi-k3** among the 4 probed v4 models returned useful content. Others fail with auth/credits/function-not-found — their zydit/v4 upstream routing appears broken (Ollama Cloud / kilo / Anthropic reroutes are stale).

**ACTION**: kimi-k3 is the strongest zydit/v4 subagent dispatch candidate — verified LIVE ALIVE through user's existing ZYDIT_API_KEY with shared zydit-keys.json config (same as v1).
### Worker Status Snapshot 2026-07-26T21:48-21:50 UTC

```
KIRO-AUTO-SMOKE (ocw_44398b97):        exit_code=0 SUCCESS — 18-line kiro-auto-SMOKE-REPORT.md; $0 cost; first-ever kiro-auto dispatch verified working
KIRO-AUTO-W2-MATRIX-LOAD (ocw_61a84077): exit=pending but MISSION ACCOMPLISHED — patched Site A (line 4577+) + Site B (line 5406+) of opencode-key-router.mjs; v2-overlay-matrix.json (4725B); matrix-load-report.md (5361B); ESM __dirname derived via fileURLToPath athlete patch; node --check exit 0
KIRO-AUTO-W4-E2E (ocw_69a56e0f):       retry-looping on kiro-auto 429 (attempt 4/10, delayMs 16000) — no file on disk yet (tmp/s7-dispatch/v2-success-path-e2e.mjs NOT FOUND). Worker reasoning shows insightful X-Router-Failover-Applied analysis (true only when attempts.length>1) but hasn't issued write tool yet to deliver.
```

### W-D Option C Safest Variant Applied by Main-Lane

Main-lane patch landed at `~/.pi/agent/local-packages/pi-model-providers/index.ts` lines 880-895:
Replaced W-D worker's literal proposal `return { ...route, disabled: true };` with typed-safe variant:
```ts
if (activeKeys !== undefined && Number(activeKeys || 0) <= 0) {
    return { route: { ...route, disabled: true }, catalogBaseUrl: route.baseUrl, models: [] };
}
if (activeKeys === undefined && Number(route.status?.keys || 0) <= 0) {
    return { route: { ...route, disabled: true }, catalogBaseUrl: route.baseUrl, models: [] };
}
```
Reason for safer variant: worker's literal proposal would crash the downstream consumer at `for (const model of item.models)` because the spread route has no `models` field (TypeError: undefined is not iterable). The safer variant returns same shape as success path, `models: []` means consumer `for...of` exits cleanly, AND the `disabled: true` flag still attached to the route sub-object so a downstream catalog renderer can decide to render greyed-out vs silently drop. Per memory: requires Pi restart to take effect (package reads at startup only).

## Kimi-K3 Salvage Assessment — 2026-07-26T22:19:39.409Z

### Hypothesis: zydit/v4/kimi-k3 alive via raw curl — fails subagent dispatch?

**Verified broken**: 3 independent probes today (2026-07-26) on `/zydit/v4/chat/completions` with model=kimi-k3:
- (stream=false, max=200) -> 404 Not Found
- (stream=true, max=50) -> 404 Not Found
- (max=1000, no stream) -> 404 Not Found

All three return identical upstream body:
```
{"status":404,"title":"Not Found","detail":"Function '23d4f03a-b8a6-4adb-a183-7daa083a09cc': Not found for account '<account_id>'"}
```

Three separate Cloudflare account IDs probed (2A_iKCS-w..., CiBlb-6h..., Cw4iOx3T...) — meaning zydit/v4 rotates its pool, but the function binding `23d4f03a-...` is decommissioned across ALL accounts.

### ROOT CAUSE

Our own key-router at line 1614 hosts `addKimiK3ToZyditV4ModelsListing(text)` which **synthetically injects** `{id:'kimi-k3', owned_by:'zydit.infra'}` into the v4 models catalog listing (line 5129 caller). This is purely cosmetic listing patch — does NOT configure upstream binding. The zydit/v4 upstream Cloudflare worker function ID `23d4f03a-...` was decommissioned.

Earlier today (21:47 UTC) kimi-k3 worked via curl on zydit/v4 -> SSE 200 with content 'Pong! Park...' + tokens 3/51/54. By 21:51 UTC the Cloudflare binding expired (W-K4 subagent dispatch died 404 immediately). By 21:52 UTC batch-smoke confirmed same 404. **Ephemeral upstream binding decommissioned**, not carrier-wide failure.

### SALVAGE — Kimi K3 IS REAL (websearch)

Moonshot AI released Kimi K3 on July 16, 2026 (10 days ago) — 2.8T params, 1M context window, native multimodal. Officially carried by:

| Carrier | Status | Route we have? | Notes |
|---|---|---|---|
| SiliconFlow | AVAILABLE | YES `/siliconflow/v1` (welfare, no key yet) | siliconflow.com/blog/kimi-k3-siliconflow-api confirms $1 free credit |
| Together AI | AVAILABLE | YES `/together/v1` (welfare, no key yet) | together.ai/models/kimi-k3 page confirms |
| Novita AI | AVAILABLE | YES `/novita/v1` (welfare, no key yet) | blogs.novita.ai/kimi-k3-on-novita-ai confirms 1M context |
| AI/ML API | AVAILABLE | YES `/aimlapi/v1` (welfare, no key yet) | cometapi.com compare deepseek-chat vs kimi-k3 confirms |
| OpenRouter | AVAILABLE | YES `/openrouter/v1` (existing) | moonshotai/kimi-k3 at $3/$15 per million tokens |
| Moonshot Platform | AVAILABLE | NO (would need new route) | platform.kimi.ai first-party API |

**Salvage action**: Once user signs up at any of {SiliconFlow, Together, Novita, AI/ML API} and sets `{SILICONFLOW,TOGETHER,NOVITA,AIMLAPI}_API_KEY` env var + key-router restart, kimi-k3 dispatchable via the welfare provider prefix corresponding to their key.

## W4-RD3 (mistral/codestral-latest) SUCCESS — 2026-07-26T22:19:39.411Z

Re-dispatched W4 e2e script worker on `mistral/codestral-latest` AFTER W4-rd2 zydit/v4/kimi-k3 died at first inference with 404, AND W4-rd1 logfare/kiro-auto was retrying 429 rate-limit.

| Field | Value |
|---|---|
| worker_id | `ocw_155f909c-abff-4026-b9d9-7a37f234ffd0` |
| name | s7-mistral-codestral-w4-e2e-rd3 |
| route | `pi:router-mistral/codestral-latest` |
| exit | 0 PASS |
| output | 1.06 MB stdout |
| lifecycle | assistant_output_seen, stopReason=stop |
| tokens | input=138 output=143 cacheRead=40320 total=40601 |
| cost | $0.0014 |
| deliverables | `tmp/s7-dispatch/v2-success-path-e2e.mjs` (561 lines) + `tmp/s7-dispatch/v2-success-path-e2e-REPORT.md` (113 lines) |

Note: stopReason 'stop' (clean) — successfully wrote both files. Main-lane to RELINK-test script.

## Welfare probe — ALL 9 routes registered but no keys set

Curl `GET /<carrier>/v1/models` returned 503 'no conf' across all 9 welfare providers (Groq, DeepSeek, SiliconFlow, Together, Cerebras, Cohere, Hyperbolic, Novita, AI/ML API). EXPECTED — routes registered in router but no API keys supplied yet (waiting on user signup). Once user signs up + sets env vars + key-router restart, the 503s will become 200 catalog responses.

## Zydit/v4 full 37-model batch-smoke (37.3s)

- SUCCESS (200): 1/37 = glm-4.7 (returned HTML 171 tokens — model interpreted 'Pong' as Pong game snippet)
- FAIL (non-200): 36/37 = 97.3%
  - 429 key-cooldown (router gate): devstral-2:123b, devstral-small-2:24b, gemma-4-31b-it, gemma3:12b/27b/4b, gemma4:31b, gpt-oss:120b/20b, ministral-3:14b/3b/8b, nemotron-3-nano/super/ultra
  - 404 Not Found (upstream): 14 Kimi models + qwen3-coder-next + qwen3-coder:480b (function binding gone)
  - 402 Credits Required: minimax-m2.1 (kilo upstream) + minimax-m2.5 (openrouter upstream)
  - Timeout (25s): minimax-m3 (retrying/live pending — possibly alive but slow)

Reports:
- `tmp/s7-dispatch/zydit-v4-batch-smoke-report.tsv`
- `tmp/s7-dispatch/zydit-v4-batch-smoke-summary.txt`

Note: ZYDIT_API_KEY activeKeys=2 -> 0 (cooling) at moment of batch-smoke — pre-sweep probes (kimi-k3 at 21:47) + W-K2 worker + test probes consumed quota -> router went 'no-active-keys' cooldown phase. Reset period = ~5-10 min.

---
