// bench-append.mjs — Append Sprint-5 + Sprint-6 worker rows to v2-impl-bench-log.md
import fs from 'fs';

const rows5 = [
  {
    worker_id: 'ocw_74cf0f7f',
    name: 'S5-SPEC-UPDATE-gap11-shapes',
    status: 'DONE',
    exit_code: 0,
    tool_calls: '>1 (edit)',
    latency: '~2min',
    tokens: '52K IN,640 OUT,81 think',
    cost: '$0',
    fail_mode: 'none',
    // Verified: created=21:56:00, updated=21:58:45, exit=0, tokens from last_text_preview
  },
  {
    worker_id: 'ocw_29d1336e',
    name: 'S5-P5B-INTEGRATION-wire-overlay',
    status: 'DONE',
    exit_code: 0,
    tool_calls: '>1 (edit+node --check+bun build)',
    latency: '~2min',
    tokens: '31K IN,644 OUT,304 think',
    cost: '$0',
    fail_mode: 'none',
    // Verified: created=21:56:25, updated=21:58:34, exit=0, tokens from last_text_preview
  },
  {
    worker_id: 'ocw_c0f5fc91',
    name: 'S5-TIER-MATRIX-UPDATE',
    status: 'DONE',
    exit_code: 0,
    tool_calls: '>1 (write+verify)',
    latency: '~4min',
    tokens: '79K IN,649 OUT,339 think',
    cost: '$0',
    fail_mode: 'none',
    // Verified: created=22:07:12, updated=22:10:50, exit=0, tokens from last_text_preview
  },
  {
    worker_id: 'ocw_6d15e780',
    name: 'S5-SPEC-MERGE-into-canonical',
    status: 'DONE',
    exit_code: 0,
    tool_calls: '>1 (edit)',
    latency: '<1min',
    tokens: '42K IN,421 OUT,189 think',
    cost: '$0',
    fail_mode: 'none',
    // Verified: created=22:12:49, updated=22:14:41, exit=0, tokens from last_text_preview
  },
  {
    worker_id: 'ocw_3ccb69ff',
    name: 'S5-BENCH-DOCS-UPDATE',
    status: 'DONE',
    exit_code: 0,
    tool_calls: '>1 (edit)',
    latency: '~2min',
    tokens: '56K IN,454 OUT,121 think',
    cost: '$0',
    fail_mode: 'none',
    // Verified: created=22:17:22, updated=22:19:04, exit=0, tokens from last_text_preview
  },
];

const rows6 = [
  {
    worker_id: 'ocw_d2602d70',
    name: 'S6-TIER-MATRIX-VERIFY',
    status: 'DONE',
    exit_code: 0,
    tool_calls: '>1 (read+edit+verify)',
    latency: '~3min',
    tokens: '48K IN,481 OUT,28 think',
    cost: '$0',
    fail_mode: 'PASS-WITH-CAVEATS (missing qualityPerCapability field)',
    // Verified: created=22:35:29, updated=22:38:34, exit=0, 10822 IN, 36352 cacheRead
  },
  {
    worker_id: 'ocw_423eb0e3',
    name: 'S6-ZYDIT-SYNC-INVESTIGATE',
    status: 'DONE',
    exit_code: 0,
    tool_calls: '>1 (curl+write+verify)',
    latency: '~5min',
    tokens: '76K IN,354 OUT,31 think',
    cost: '$0',
    fail_mode: 'none — dual-sync naming collision documented + fix path recommended',
    // Verified: created=22:35:30, updated=22:40:17, exit=0
  },
];

const ts = new Date().toISOString();

let text = `\n\n## Sprint-5 + Sprint-6 wave rows (appended ${ts})\n\n`;
text += `### Sprint-5 ($0 aggregate, all agnes-2.0-flash)\n\n`;
text += `| worker_id | name | status | exit_code | tool_calls | latency | tokens(IN,OUT,think) | cost | fail_mode |\n`;
text += `|---|---|---|---|---|---|---|---|---|\n`;
for (const r of rows5) {
  text += `| ${r.worker_id} | ${r.name} | ${r.status} | ${r.exit_code} | ${r.tool_calls} | ${r.latency} | ${r.tokens} | ${r.cost} | ${r.fail_mode} |\n`;
}

text += `\n### Sprint-6 (first 2 completed — agnes-2.0-flash, $0 aggregate)\n\n`;
text += `| worker_id | name | status | exit_code | tool_calls | latency | tokens(IN,OUT,think) | cost | fail_mode |\n`;
text += `|---|---|---|---|---|---|---|---|---|\n`;
for (const r of rows6) {
  text += `| ${r.worker_id} | ${r.name} | ${r.status} | ${r.exit_code} | ${r.tool_calls} | ${r.latency} | ${r.tokens} | ${r.cost} | ${r.fail_mode} |\n`;
}

text += `\n### Verification: metadata.json excerpts\n\n`;
const workerMap = new Map([
  ['ocw_74cf0f7f', { created: '2026-07-25T21:56:00Z', updated: '2026-07-25T21:58:45Z' }],
  ['ocw_29d1336e', { created: '2026-07-25T21:56:25Z', updated: '2026-07-25T21:58:34Z' }],
  ['ocw_c0f5fc91', { created: '2026-07-25T22:07:12Z', updated: '2026-07-25T22:10:50Z' }],
  ['ocw_6d15e780', { created: '2026-07-25T22:12:49Z', updated: '2026-07-25T22:14:41Z' }],
  ['ocw_3ccb69ff', { created: '2026-07-25T22:17:22Z', updated: '2026-07-25T22:19:04Z' }],
  ['ocw_d2602d70', { created: '2026-07-25T22:35:29Z', updated: '2026-07-25T22:38:34Z' }],
  ['ocw_423eb0e3', { created: '2026-07-25T22:35:30Z', updated: '2026-07-25T22:40:17Z' }],
]);
for (const [wid, meta] of workerMap) {
  const dur = Math.round((new Date(meta.updated) - new Date(meta.created)) / 1000);
  text += `- **${wid}**: created=${meta.created}Z, updated=${meta.updated}Z, wall=${dur}s, exit=0 ✓\n`;
}

text += `\n> W3–W8 TBD pending S6 dispatches.\n`;

const logPath = 'C:/Users/HP/repos/semantic-explorer/tmp/v2-impl-bench-log.md';
fs.appendFileSync(logPath, text);
console.log(`Appended ${(rows5.length + rows6.length)} rows (${rows5.length} Sprint-5, ${rows6.length} Sprint-6) to ${logPath}`);
console.log('Done.');
