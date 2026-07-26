// Sweep ALL 37 zydit/v4 models with a tiny "Pong" probe and tabulate results.
// Per opencode-key-router.mjs line 3507: Kimi models on zydit/v4 reject stream:true
// → we use stream:false for ALL probes (safer default; doesn't hurt other models).
import fs from "node:fs";

const ROUTER_BASE = "http://127.0.0.1:8788";
const V4_MODELS = [
  "devstral-2:123b", "devstral-small-2:24b", "gemma-4-31b-it", "gemma3:12b",
  "gemma3:27b", "gemma3:4b", "gemma4:31b", "glm-4.7", "gpt-oss:120b",
  "gpt-oss:20b", "kimi-2.6-fast", "kimi-2.6-search", "kimi-2.6-thinking",
  "kimi-2.6-thinking-search", "kimi-k2", "kimi-k2-search", "kimi-k2-thinking",
  "kimi-k2-thinking-search", "kimi-k2.5", "kimi-k2.5-search", "kimi-k2.5-thinking",
  "kimi-k2.5-thinking-search", "kimi-k3", "kimi-search", "kimi-thinking",
  "kimi-thinking-search", "minimax-m2.1", "minimax-m2.5", "minimax-m3",
  "ministral-3:14b", "ministral-3:3b", "ministral-3:8b",
  "nemotron-3-nano:30b", "nemotron-3-super", "nemotron-3-ultra",
  "qwen3-coder-next", "qwen3-coder:480b",
];

const results = [];
const startTime = Date.now();
console.log("[SWEEP] START — " + V4_MODELS.length + " models\n");

for (let i = 0; i < V4_MODELS.length; i++) {
  const model = V4_MODELS[i];
  const probeStart = Date.now();
  let outcome = { i: i + 1, model, status: "", content: "", tokens: null, cost: null, error: "", elapsed_ms: 0 };
  try {
    const res = await fetch(`${ROUTER_BASE}/zydit/v4/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: model,
        messages: [{ role: "user", content: "Pong" }],
        max_tokens: 25,
        stream: false,
      }),
      signal: AbortSignal.timeout(25000),
    });
    const elapsed = Date.now() - probeStart;
    outcome.elapsed_ms = elapsed;
    outcome.status = res.status;
    let rawBody = await res.text();
    if (rawBody.length > 800) rawBody = rawBody.slice(0, 800) + "...";
    let body;
    try { body = JSON.parse(rawBody); } catch { body = { _raw: rawBody }; }
    if (res.status === 200 && body && body.choices && body.choices[0]) {
      outcome.content = (body.choices[0].message?.content || "").slice(0, 200).replace(/\s+/g, " ");
      outcome.tokens = body.usage ? `${body.usage.prompt_tokens}/${body.usage.completion_tokens}/${body.usage.total_tokens}` : null;
      outcome.cost = body.usage?.market_cost != null ? String(body.usage.market_cost) : null;
    } else {
      outcome.error = (body && (body.error?.message || body.error?.title || body.error || body.title || body._raw)) || rawBody.slice(0, 200);
    }
  } catch (e) {
    outcome.elapsed_ms = Date.now() - probeStart;
    outcome.error = e.name + ": " + e.message;
  }
  results.push(outcome);
  console.log(`${String(i + 1).padStart(2)} of ${V4_MODELS.length} | model=${model.padEnd(28)} | status=${String(outcome.status).padEnd(6)} | elapsed=${String(outcome.elapsed_ms).padStart(5)}ms | tokens=${outcomeshort(outcome.tokens)} | content=${outcome.content ? '"' + outcome.content.slice(0, 80) + '"' + (outcome.content.length > 80 ? "…" : "") : "(empty)"}${outcome.error ? " ERR: " + String(outcome.error).slice(0, 100) : ""}`);
}

const totalElapsed = ((Date.now() - startTime) / 1000).toFixed(1);
const successCount = results.filter(r => r.status === 200 && r.content).length;
const partialCount = results.filter(r => r.status === 200 && !r.content).length;
const failCount = results.filter(r => r.status !== 200).length;

const summary = `=== SWEEP COMPLETE ===
Total models probed: ${V4_MODELS.length}
Time elapsed: ${totalElapsed}s
SUCCESS (200 + content): ${successCount} / ${V4_MODELS.length} (${(100 * successCount / V4_MODELS.length).toFixed(1)}%)
PARTIAL (200 + no content): ${partialCount}
FAIL (non-200): ${failCount}
`;

const headerRow = "row\tmodel\tstatus\ttokens\tcost\telapsed_ms\tcontent_or_error";
const tsvRows = results.map((r, i) => [i + 1, r.model, r.status, r.tokens || "", r.cost || "", r.elapsed_ms, (r.content || r.error).replace(/\t/g, " ").replace(/\s+/g, " ").slice(0, 300)].join("\t"));
const tsvOut = headerRow + "\n" + tsvRows.join("\n") + "\n";

const reportPath = "C:/Users/HP/repos/semantic-explorer/tmp/s7-dispatch/zydit-v4-batch-smoke-report.tsv";
const summaryPath = "C:/Users/HP/repos/semantic-explorer/tmp/s7-dispatch/zydit-v4-batch-smoke-summary.txt";
fs.writeFileSync(reportPath, tsvOut);
fs.writeFileSync(summaryPath, summary + "\n\nFULL TABLE:\n" + tsvOut);
console.log(summary);
console.log("Reports written:\n  TSV: " + reportPath + "\n  SUMMARY: " + summaryPath + "\n");

function outcomeshort(s) { return s || "-"; }
