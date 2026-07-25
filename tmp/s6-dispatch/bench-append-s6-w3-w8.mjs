// Sprint-6 W3-W8 rows appended to tmp/v2-impl-bench-log.md
// (W7 worker ran before W3-W8 completed, hence the "TBD" note in the log.
//  This main-lane Node script fills in the remaining rows now that those
//  workers have exited.)
//
// Established convention: Node script, not the `edit` tool, because the
// bench-log is full of em-dashes + backticks referenced in markdown that
// confuse edit tool's oldText matching.

import fs from 'fs';

const rows = [
  // W3: TIER-MATRIX-MERGE
  {
    worker_id: 'ocw_b6f4bd6f-2ba4-46e4-896a-18b5a6aa02e7',
    name: 'S6-W3-TIER-MATRIX-MERGE',
    route: 'router-agnes',
    model: 'agnes-2.0-flash',
    exit_code: 0,
    latency: '~4min (22:50:48 - 22:54:50)',
    tokens: '35K IN,321 OUT,14 think',
    cost: '$0',
    status: 'DONE',
    fail_mode: 'none — produced tmp/v2-overlay-matrix.json (8 entries: 3 T0+4 COND+1 SEAS, NO WARM_CADAVER), 13 required fields per entry'
  },
  // W4: PHASE-5B-SUCCESS-PATH
  {
    worker_id: 'ocw_91c722a0-da7c-4ad3-8c1b-76dd34024807',
    name: 'S6-W4-PHASE-5B-SUCCESS-PATH',
    route: 'router-agnes',
    model: 'agnes-2.0-flash',
    exit_code: 0,
    latency: '~14min (22:50:48 - 23:04:38, incl. 3 Agnes 429-backoff retries)',
    tokens: '17K IN,574 OUT,147 think (totals incl. cacheRead=119K)',
    cost: '$0',
    status: 'DONE',
    fail_mode: 'PARTIAL: found two real bugs (slotHandle undeclared in v2Failover-overlay.mjs lines 900/941 + v2diag scoping bug — same bug main-lane fixed). V2 success path unprovable with minimal matrix (only 1 carrier); allocated to Sprint-7 backlog'
  },
  // W5: PHASE-5C-OVERLAY-HEADER-PATCH — BROKEN ATTEMPT, main-lane corrected
  {
    worker_id: 'ocw_7dd755ff-0f36-4fc4-b45c-b21c809a757c',
    name: 'S6-W5-PHASE-5C-OVERLAY-HEADER-PATCH',
    route: 'router-agnes',
    model: 'agnes-2.0-flash',
    exit_code: 0,
    latency: '~5.5min (22:50:48 - 22:56:14)',
    tokens: '41K IN,291 OUT,12 think',
    cost: '$0',
    status: 'DONE (but BROKEN)',
    fail_mode: 'INITIAL PATCH BROKE THE KEY-ROUTER — placed let v2diag; INSIDE if-block scope (line 3528+4142) but spread ...v2diag AT function-body scope (line 3608+4196), causing ReferenceError: v2diag is not defined on EVERY request hitting FAILOVER_STATUSES. Main-lane captured the broken structure to /tmp/w5-broken-patch-snippet.txt, restored from backup .bak-pre-p5c-2026-07-25 (171520B), then re-applied cleanly via single edit() call with v2diag declared ONCE at function scope + (v2diag || {}) null-safe spread. See tmp/s6-dispatch/p5c-overlay-header-patch-CORRECTION-MAIN-LANE.md'
  },
  // W6: ADVERSARIAL-RE-RUN
  {
    worker_id: 'ocw_7abc2012-da11-4385-bac0-245d1998a583',
    name: 'S6-W6-ADVERSARIAL-RE-RUN',
    route: 'router-agnes',
    model: 'agnes-2.0-flash',
    exit_code: 0,
    latency: '~4min (22:50:48 - 22:54:24)',
    tokens: '47K IN,209 OUT,25 think',
    cost: '$0',
    status: 'DONE',
    fail_mode: 'none — 7/7 mock-server adversarial tests PASS + 2/2 live-router smokes PASS (bad-model → 503 model_not_found, valid agnes-2.0-flash → 200 with litellm traceability). No regression vs pre-V2 state'
  },
  // W7: BENCH-LOG-APPEND
  {
    worker_id: 'ocw_bd5a2b8d-e186-4179-ba98-3707bf7a3bd5',
    name: 'S6-W7-BENCH-LOG-APPEND',
    route: 'router-agnes',
    model: 'agnes-2.0-flash',
    exit_code: 0,
    latency: '~4min (22:50:49 - 22:54:32)',
    tokens: '51K IN,155 OUT,77 think',
    cost: '$0',
    status: 'DONE',
    fail_mode: 'none — appended 5 Sprint-5 + 2 Sprint-6 rows to bench-log (107 -> 139 lines). W3-W8 rows appended post-hoc by this main-lane Node script'
  },
  // W8: SESSION-SUMMARY
  {
    worker_id: 'ocw_9373669d-07d5-4e7a-9f21-f5844972354f',
    name: 'S6-W8-SESSION-SUMMARY',
    route: 'router-agnes',
    model: 'agnes-2.0-flash',
    exit_code: 0,
    latency: '~7min (22:50:49 - 22:57:40)',
    tokens: '75K IN,167 OUT,32 think',
    cost: '$0',
    status: 'DONE',
    fail_mode: 'none — wrote 250-line session summary at tmp/s6-dispatch/session-summary-2026-07-25.md covering 6 sprints + 2 commits (c3cd2f99 + 271fe111)'
  }
];

const ts = new Date().toISOString();
const today = new Date().toLocaleString('en-US', { timeStyle: 'long' });

let text = '\n### Sprint-6 W3-W8 — post-hoc row fill (appended by main-lane Node script, ' + today + ')\n\n';
text += 'Note: W7 worker ran at 22:50-22:54 BEFORE W3-W8 exited; this script fills in the gap.\n\n';
text += '| worker_id | name | status | exit_code | latency | tokens | cost | fail_mode |\n';
text += '|---|---|---|---|---|---|---|---|\n';
for (const r of rows) {
  text += `| ${r.worker_id} | ${r.name} | ${r.status} | ${r.exit_code} | ${r.latency} | ${r.tokens} | ${r.cost} | ${r.fail_mode} |\n`;
}
text += '\n### Aggregate cost Sprint-6\n\n';
text += '- Total cost (all 8 Sprint-6 workers on agnes-2.0-flash): **$0.00**\n';
text += '- Total wall time across Sprint-6 wave: ~30 min (most workers ran in parallel)\n';
text += '- Main-lane time on the P5C correction + key-router restart + live verification: ~8 min for everything\n';
text += '- Live verification result: ✅ Phase-5C patch PROVEN WORKING — both Site A (HTTP 429 + X-Router-Diagnostic) AND Site B (HTTP 502 + X-Router-Diagnostic) show V2 diagnostic headers flowing through HTTP response\n';

fs.appendFileSync('tmp/v2-impl-bench-log.md', text);
console.log('Appended', rows.length, 'Sprint-6 W3-W8 rows to tmp/v2-impl-bench-log.md');
console.log('  - Total characters appended:', text.length);
console.log('  - Live P5C verification: ✅');
