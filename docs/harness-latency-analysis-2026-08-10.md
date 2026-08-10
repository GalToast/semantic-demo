# Pi harness slowdown/hang analysis — 2026-08-10

Source: flight-recorder 2026-08-10.jsonl + pi_harness_doctor + pi_background_jobs diagnostics.
Measured during a multi-worker fleet session (main lane + 2-6 logfare/cline subagents).

## 1. Provider FIFO contention (dominant cost)

- 2-4 agent processes share `direct-freeinference` (deepseek-v4-flash) concurrently.
- `provider_request.pendingCountBeforeRequest` reached **11-12**; `provider_response.correlation`
  flipped to **fifo_ambiguous**; `oldestPendingAgeMs` reached **549,754 / 1,040,320 ms**
  (9.5 min / 17 min). When the FIFO is ambiguous, responses can't be matched to requests
  reliably -> stalls that look like "hangs" but are queue-congestion.
- Worker routes to other providers (router-modelscope zai-org/GLM-5.2, router-clinefree
  deepseek) also contend with their own FIFOs (modelscope `pendingCountBeforeRequest: 7`,
  2.67 MB payload).

## 2. Payload bloat (amplifier)

- Main-session provider_request payloads: `bytes: 1,386,197 - 2,115,797`; `messages: 911-2,222`;
  `messageContentChars: 715,968-1,466,942`. Every turn ships ~1.4-2.1 MB to the provider.
- Worker sessions: mostly lean (2-5 messages, 78 KB), EXCEPT a runaway modelscope worker
  (1947 messages, 2.67 MB) - commit-heavy lanes without compaction.

## 3. Cache-break + empty-error turns (the "hang" symptom)

- On ANY error the recorder emits `cache_break { previousCacheRead: 380K-592K → newCacheRead: 0 }`.
- `message_end stopReason:"error" errorMessage:"Stream ended..."` at **durationMs 229,028-238,665**
  (4 min) with **usage all-zero** - the request died empty after a long wait (provider-side
  stream abort), then the retry starts a fresh no-cache encode (because cache broke).
- These two combined = the visible 4-minute dead turns.

## 4. Detached-job accumulation

- pi_background_jobs: **992 completed records**, 73 errors, largest log 1.8 MB
  (today's session spawned ~hundreds of `background:true` curls/vitest/job-drivers).
- Not the latency driver, but `pi_background_jobs` list/diagnostics scans get slower.

## Verdict

The main-lane 1.4-2.1 MB payloads + multi-agent FIFO contention are the two structural
causes of "pi feels slow / hangs": every main turn forces a 2 MB encode while 11-12 pending
requests sit in one FIFO. Cache-breaks amplify errors to 4-min empty turns. Doctor health is
clean; no intrinsic harness bug - the harness is fine, the WORKLOAD PATTERN is the problem.

## Optimizations (measured, safe)

1. Cap subagent payloads: workers stay < 1500 messages / < 1 MB (compaction/re-spawn threshold).
2. Spread providers: fleet lanes should round-robin logfare/modelscope/clinefree/zen instead of
   all funneling the same FIFO when latency spikes.
3. Main lane: keep provider payloads lean (batch tool calls; early compaction; avoid
   accumulating this report's giant logs into turns).
4. Periodic `pi-background-jobs clear --older-than 1d` after sessions (dust feels slow).
5. Watch `correlation: fifo_ambiguous` + `oldestPendingAgeMs > 300000` as the tension early
   warns for splitting sessions across providers BEFORE visible hangs.
