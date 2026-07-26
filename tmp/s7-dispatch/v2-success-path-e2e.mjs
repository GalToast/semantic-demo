#!/usr/bin/env node
/**
 * S7-W4 — V2-SUCCESS-PATH E2E TEST SCRIPT
 *
 * Runs POST requests against the live key-router (http://127.0.0.1:8788)
 * with X-V2-Failover: 1 to exercise the V2 failover overlay SUCCESS path
 * (alternative-carrier dispatch returning HTTP 200).
 *
 * HOW V2 IS TRIGGERED IN THE ROUTER
 * --------------------------------
 * The V2 block lives inside tryFailover() in opencode-key-router.mjs.
 * Two conditions must BOTH be true for V2 to fire:
 *
 *   A. The provider has KEYS CONFIGURED (provider.getKeys() returns > 0)
 *      — if keys.length === 0, forward() returns HTTP 503 immediately
 *        and NEVER reaches tryFailover() or the V2 block.
 *
 *   B. All active keys are exhausted (active.length === 0) — either all
 *      keys are on cooldown or ALL slots are disabled via env var.
 *      This causes forward() to call tryFailover(), which evaluates the
 *      V2 block.
 *
 * The V2 block checks x-v2-failover: 1 and calls v2FailoverDispatch(),
 * which iterates the 8-entry matrix and returns { success: true, ... }
 * when any upstream carrier responds with HTTP 200.
 *
 * ENVIRONMENT VARIABLE STRATEGY
 * -----------------------------
 * Providers with no keys (zydit, zyditv4) return 503 at the forward() level
 * — V2 is never reached.  They are EXCLUDED from this test suite.
 *
 * To reliably trigger V2, the main-lane MUST start the key-router with
 * these env vars set (they disable ALL key slots → active=[] → V2):
 *
 *   set OPENCODE_KEY_ROUTER_DISABLED_SLOTS_OPENPROVIDER_ALL=all
 *   set OPENCODE_KEY_ROUTER_DISABLED_SLOTS_NEURALWATT_ALL=all
 *   set OPENCODE_KEY_ROUTER_DISABLED_SLOTS_LLM7_ALL=all
 *   set OPENCODE_KEY_ROUTER_DISABLED_SLOTS_FREEMODEL_ALL=all
 *   node C:/Users/HP/harness/servers/key-router/src/opencode-key-router.mjs
 *
 * Prerequisites (landed by main-lane before running this script):
 *   W1 — slotHandle ReferenceError fixed in v2-failover-overlay.mjs
 *   W2 — 8-entry v2-overlay-matrix.json loaded at both Site A and Site B
 *         in opencode-key-router.mjs
 *   Key-router restarted with disabled-slot env vars set (see above)
 *
 * Outputs:
 *   JSONL lines appended to tmp/s7-dispatch/v2-success-path-results.jsonl
 *   Summary printed to STDOUT
 *   Exit 0 = all pass, Exit 1 = any failure
 */

import http from "node:http";
import fs from "node:fs";
import path from "node:path";

// ──────────────────────────────────────────────────────────────────────────────
// Configuration
// ──────────────────────────────────────────────────────────────────────────────

const ROUTER_BASE = "http://127.0.0.1:8788";
const OUTPUT_DIR = path.join(process.cwd(), "tmp", "s7-dispatch");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "v2-success-path-results.jsonl");
const REQUEST_TIMEOUT_MS = 45_000; // 45 s per test case
const CLEAR_OUTPUT = true;

// ──────────────────────────────────────────────────────────────────────────────
// Env-var requirements for main-lane (documented here, not applied by script)
// ──────────────────────────────────────────────────────────────────────────────
//
// For V2 to activate for providers WITH configured keys, ALL their key slots
// must be disabled (active=[] → tryFailover → V2 block).  Set these BEFORE
// starting the key-router:
//
//   OPENCODE_KEY_ROUTER_DISABLED_SLOTS_OPENPROVIDER_ALL=all
//   OPENCODE_KEY_ROUTER_DISABLED_SLOTS_NEURALWATT_ALL=all
//   OPENCODE_KEY_ROUTER_DISABLED_SLOTS_LLM7_ALL=all
//   OPENCODE_KEY_ROUTER_DISABLED_SLOTS_FREEMODEL_ALL=all
//
// Providers WITHOUT configured keys (zydit, zyditv4) return HTTP 503 from
// forward() BEFORE tryFailover() is called — V2 is never reached for those.
// They are intentionally excluded from this test suite.

// ──────────────────────────────────────────────────────────────────────────────
// Test cases
//
// RATIONALE FOR ROUTE SELECTION
// -----------------------------
// After W2 loads the 8-entry matrix, V2 tries carriers in this order:
//   0: agnes-2.0-flash        → carrierType: auto        T0  GOLDEN_GOOSE_#1
//   1: north-mini-code:free   → carrierType: openrouter  T0  GOLDEN_GOOSE_#2
//   2: minimax-m3             → carrierType: nvidia      T0  FREE_WITH_REASONING
//   3: kilo-step-3.7-flash    → carrierType: kilo        CONDITIONAL
//   4: cloudflare             → carrierType: cloudflare  CONDITIONAL
//   5: nvidia-minimax-m3      → carrierType: nvidia      CONDITIONAL
//   6: opencode-zen           → carrierType: opencode-zen CONDITIONAL
//   7: logfare-kimi-k2.6      → carrierType: logfare     SEASONAL
//
// T0 carriers (0, 1, 2) are free-to-use. If the first carrier succeeds
// immediately, X-Router-Failover-Applied is "false" (single-attempt = partial).
// If the first carrier fails, V2 falls through to the next carrier and
// X-Router-Failover-Applied becomes "true" (full pass).
//
// Selection logic:
//   - Use providers with keys configured but all slots disabled via env var
//     (TC-01 through TC-04): deterministic active=[] → Site A → V2 fires.
//   - TC-05 and TC-06 repeat with different bogus model names to confirm
//     V2 activation is model-independent.

const TEST_CASES = [
  {
    id: "TC-01-openprovider-disabled-slots",
    route: "/openprovider/v1",
    suffix: "/v1/chat/completions",
    model: "nonexistent-XYZ-bogus",
    provider: "openprovider",
    expectedSite: "A",
    rationale:
      "openprovider keys disabled via OPENCODE_KEY_ROUTER_DISABLED_SLOTS_OPENPROVIDER_ALL=all. " +
      "activeKeyIndexes() returns active=[] → forward() calls tryFailover() → " +
      "V2 block fires because x-v2-failover: 1 is set. " +
      "V2 iterates the 8-entry matrix and dispatches to first available T0 carrier.",
    expectedAlternative: "agnes-2.0-flash (idx 0, T0) or north-mini-code:free (idx 1, T0)",
  },
  {
    id: "TC-02-neuralwatt-disabled-slots",
    route: "/neuralwatt/v1",
    suffix: "/v1/chat/completions",
    model: "nonexistent-XYZ-bogus",
    provider: "neuralwatt",
    expectedSite: "A",
    rationale:
      "neuralwatt keys disabled via OPENCODE_KEY_ROUTER_DISABLED_SLOTS_NEURALWATT_ALL=all. " +
      "Same mechanism as TC-01: active=[] → tryFailover → V2.",
    expectedAlternative: "First available T0 carrier from matrix (idx 0 or 1)",
  },
  {
    id: "TC-03-llm7-disabled-slots",
    route: "/llm7/v1",
    suffix: "/v1/chat/completions",
    model: "nonexistent-XYZ-bogus",
    provider: "llm7",
    expectedSite: "A",
    rationale:
      "llm7 keys disabled via OPENCODE_KEY_ROUTER_DISABLED_SLOTS_LLM7_ALL=all. " +
      "Confirms V2 fires for a third distinct provider.",
    expectedAlternative: "First available T0 carrier from matrix",
  },
  {
    id: "TC-04-freemodel-disabled-slots",
    route: "/freemodel/v1",
    suffix: "/v1/chat/completions",
    model: "nonexistent-XYZ-bogus",
    provider: "freemodel",
    expectedSite: "A",
    rationale:
      "freemodel keys disabled via OPENCODE_KEY_ROUTER_DISABLED_SLOTS_FREEMODEL_ALL=all. " +
      "Fourth distinct provider confirming V2 activation.",
    expectedAlternative: "First available T0 carrier from matrix",
  },
  {
    id: "TC-05-openprovider-alt-bogus-model",
    route: "/openprovider/v1",
    suffix: "/v1/chat/completions",
    model: "totally-invalid-model-zzz-999",
    provider: "openprovider",
    expectedSite: "A",
    rationale:
      "Same provider as TC-01 but with a different bogus model name. " +
      "Confirms V2 activation is model-independent.",
    expectedAlternative: "Same as TC-01",
  },
  {
    id: "TC-06-neuralwatt-alt-bogus-model",
    route: "/neuralwatt/v1",
    suffix: "/v1/chat/completions",
    model: "totally-invalid-model-zzz-999",
    provider: "neuralwatt",
    expectedSite: "A",
    rationale:
      "Same provider as TC-02 with a different bogus model. " +
      "Redundant with TC-02 but increases confidence if TC-02 flakes.",
    expectedAlternative: "Same as TC-02",
  },
];

// ──────────────────────────────────────────────────────────────────────────────
// HTTP helpers
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Make a single HTTP POST request. Returns { status, headers, body }.
 * Uses Node's built-in http module — zero external dependencies.
 */
function postJson(url, body, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const headers = {
      "Content-Type": "application/json",
      "x-v2-failover": "1",
      ...extraHeaders,
    };

    const req = http.request(
      {
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname + parsed.search,
        method: "POST",
        headers,
        timeout: REQUEST_TIMEOUT_MS,
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const bodyStr = Buffer.concat(chunks).toString("utf-8");
          const xRouterHeaders = {};
          for (const [key, value] of Object.entries(res.headers)) {
            if (key.toLowerCase().startsWith("x-router-")) {
              xRouterHeaders[key] = value;
            }
          }
          resolve({
            status: res.statusCode,
            headers: xRouterHeaders,
            body: bodyStr,
          });
        });
      },
    );

    req.on("error", (err) => {
      reject(new Error(`HTTP request failed for ${url}: ${err.message}`));
    });

    req.on("timeout", () => {
      req.destroy();
      reject(
        new Error(
          `HTTP request timed out after ${REQUEST_TIMEOUT_MS}ms for ${url}`,
        ),
      );
    });

    req.write(JSON.stringify(body));
    req.end();
  });
}

/**
 * Probe whether the router is alive (GET / or /status).
 */
async function probeRouter(baseUrl, timeoutMs = 3000) {
  return new Promise((resolve) => {
    const req = http.get(baseUrl, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () =>
        resolve({
          alive: res.statusCode < 500,
          status: res.statusCode,
          body: data.slice(0, 200),
        }),
      );
    });
    req.on("error", () => resolve({ alive: false }));
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      resolve({ alive: false });
    });
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// Classification helpers
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Truncate a string to maxLen chars with ellipsis.
 */
function truncate(str, maxLen = 200) {
  if (!str) return "";
  const s = String(str);
  return s.length > maxLen ? s.slice(0, maxLen) + "…" : s;
}

/**
 * Classify a test result.
 *
 *   pass    — HTTP 200 + X-Router-Failover-Applied === 'true' + body non-empty
 *   partial — HTTP 200 + X-Router-Failover-Applied === 'false'
 *              (V2 activated, first carrier succeeded — single-attempt success)
 *   fail    — HTTP >= 400, or HTTP 200 with empty body
 *   error   — network error / timeout / uncaught throw
 */
function classifyResult(status, failoverApplied, body) {
  if (status === 200 && failoverApplied === "true" && body?.trim()) return "pass";
  if (status === 200 && failoverApplied === "false" && body?.trim()) return "partial";
  if (status === 200 && !body?.trim()) return "partial";
  if (typeof status === "number" && status >= 400) return "fail";
  return "fail";
}

/**
 * Ensure the output directory exists.
 */
function ensureOutputDir() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Main test runner
// ──────────────────────────────────────────────────────────────────────────────

async function runTests() {
  ensureOutputDir();

  // Truncate output file at the start of a fresh run
  if (CLEAR_OUTPUT) {
    fs.writeFileSync(OUTPUT_FILE, "");
  }

  const results = [];
  const startTime = Date.now();
  let passCount = 0;
  let partialCount = 0;
  let failCount = 0;
  let errorCount = 0;

  console.log(`\n${"=".repeat(70)}`);
  console.log("S7-W4 V2-SUCCESS-PATH E2E TEST RUN");
  console.log(`Router:  ${ROUTER_BASE}`);
  console.log(`Output:  ${OUTPUT_FILE}`);
  console.log(`Cases:   ${TEST_CASES.length}`);
  console.log(`Started: ${new Date(startTime).toISOString()}`);
  console.log("=".repeat(70));

  // ── Phase 1: verify router is alive ────────────────────────────────────
  console.log("\n[phase-1] Probing router at " + ROUTER_BASE + " …");
  const probe = await probeRouter(ROUTER_BASE);
  if (!probe.alive) {
    console.log(
      "[phase-1] Router not responding.\n" +
        "  The key-router must be running before this script is invoked.\n" +
        "  Start it with these disabled-slot env vars:\n" +
        "    set OPENCODE_KEY_ROUTER_DISABLED_SLOTS_OPENPROVIDER_ALL=all\n" +
        "    set OPENCODE_KEY_ROUTER_DISABLED_SLOTS_NEURALWATT_ALL=all\n" +
        "    set OPENCODE_KEY_ROUTER_DISABLED_SLOTS_LLM7_ALL=all\n" +
        "    set OPENCODE_KEY_ROUTER_DISABLED_SLOTS_FREEMODEL_ALL=all\n" +
        "    node C:/Users/HP/harness/servers/key-router/src/opencode-key-router.mjs\n",
    );
    console.log("FATAL: Cannot proceed without a live router on port 8788.");
    process.exit(2);
  }
  console.log(`[phase-1] Router alive (HTTP ${probe.status}).`);

  // ── Phase 2: run test cases ────────────────────────────────────────────
  console.log("\n[phase-2] Running test cases …\n");

  for (const tc of TEST_CASES) {
    const tcStart = Date.now();
    const url = `${ROUTER_BASE}${tc.route}${tc.suffix}`;
    const requestBody = {
      model: tc.model,
      messages: [{ role: "user", content: "ping" }],
      max_tokens: 1, // minimal token request — reduces upstream cost if charged
    };

    const tcResult = {
      testId: tc.id,
      route: tc.route,
      suffix: tc.suffix,
      model: tc.model,
      provider: tc.provider,
      expectedSite: tc.expectedSite,
      url,
      status: null,
      statusOk: false,
      failoverApplied: null,
      failoverAppliedOk: false,
      bodySnippet: "",
      xRouterHeaders: {},
      classification: "error",
      error: null,
      durationMs: 0,
      ts: new Date().toISOString(),
    };

    try {
      console.log(`  [${tc.id}] POST ${url}`);
      console.log(`           model=${tc.model}  provider=${tc.provider}`);

      const res = await postJson(url, requestBody);
      const failoverApplied = res.headers["X-Router-Failover-Applied"] ?? null;
      const statusOk = res.status === 200;
      const failoverAppliedOk = failoverApplied === "true";
      const classification = classifyResult(res.status, failoverApplied, res.body);
      const durationMs = Date.now() - tcStart;

      tcResult.status = res.status;
      tcResult.statusOk = statusOk;
      tcResult.failoverApplied = failoverApplied;
      tcResult.failoverAppliedOk = failoverAppliedOk;
      tcResult.bodySnippet = truncate(res.body, 200);
      tcResult.xRouterHeaders = res.headers;
      tcResult.classification = classification;
      tcResult.durationMs = durationMs;

      if (classification === "pass") passCount++;
      else if (classification === "partial") partialCount++;
      else if (classification === "fail") failCount++;
      else errorCount++;

      const statusIcon =
        classification === "pass" ? "✅ PASS"
        : classification === "partial" ? "⚠️  PARTIAL"
        : classification === "fail" ? "❌ FAIL"
        : "💥 ERROR";

      console.log(
        `           → ${statusIcon}  status=${res.status}  ` +
          `failoverApplied=${failoverApplied ?? "MISSING"}  ` +
          `body=${tcResult.bodySnippet.slice(0, 80)}`,
      );
      if (tcResult.error) console.log(`           error: ${tcResult.error}`);
      console.log(`           duration=${durationMs}ms`);
    } catch (err) {
      const durationMs = Date.now() - tcStart;
      tcResult.classification = "error";
      tcResult.error = err.message;
      tcResult.durationMs = durationMs;
      errorCount++;

      console.log(
        `           → 💥 ERROR  ${err.message}  duration=${durationMs}ms`,
      );
    }

    // Crash-safe JSONL append after each test
    fs.appendFileSync(OUTPUT_FILE, JSON.stringify(tcResult) + "\n");
    results.push(tcResult);

    // Brief inter-test pause
    await new Promise((r) => setTimeout(r, 500));
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Summary
  // ──────────────────────────────────────────────────────────────────────────
  const totalDuration = Date.now() - startTime;
  const total = results.length;
  const allPassed = failCount === 0 && errorCount === 0;

  const summary = {
    __summary: true,
    total,
    passed: passCount,
    partial: partialCount,
    failed: failCount + errorCount,
    durationMs: totalDuration,
    startedAt: new Date(startTime).toISOString(),
    finishedAt: new Date().toISOString(),
    exitCode: allPassed ? 0 : 1,
    results: results.map((r) => ({
      testId: r.testId,
      route: r.route,
      classification: r.classification,
      status: r.status,
      failoverApplied: r.failoverApplied,
      durationMs: r.durationMs,
    })),
  };

  fs.appendFileSync(OUTPUT_FILE, JSON.stringify(summary) + "\n");

  console.log(`\n${"=".repeat(70)}`);
  console.log("SUMMARY");
  console.log("=".repeat(70));
  console.log(`  Total   : ${total}`);
  console.log(`  Pass    : ${passCount}  (V2 success + failoverApplied=true)`);
  console.log(`  Partial : ${partialCount}  (V2 success, failoverApplied=false — single-attempt)`);
  console.log(`  Fail    : ${failCount}  (HTTP >= 400)`);
  console.log(`  Error   : ${errorCount}  (network/timeout/throw)`);
  console.log(`  Duration: ${totalDuration}ms`);
  console.log(
    `  Exit    : ${allPassed ? 0 : 1}  (${allPassed ? "ALL PASSED" : "FAILURES DETECTED — see JSONL"})`,
  );
  console.log("=".repeat(70));
  console.log(`\nJSONL log: ${OUTPUT_FILE}\n`);

  process.exit(allPassed ? 0 : 1);
}

// ──────────────────────────────────────────────────────────────────────────────
// Entry point — non-interactive batch mode, no readline
// ──────────────────────────────────────────────────────────────────────────────

runTests().catch((err) => {
  console.error(`\nFATAL: Test runner threw: ${err.message}`);
  console.error(err.stack);
  process.exit(2);
});
