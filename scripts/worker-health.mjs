#!/usr/bin/env node
// worker-health.mjs — surface the retry/error/thinking timeline that
// external_subagent_poll HIDES. Complements poll with raw-log forensics.
//
// Usage:
//   node scripts/worker-health.mjs <worker-id-or-stdout-path>
//   node scripts/worker-health.mjs ocw_02a35a6b
//   node scripts/worker-health.mjs .opencode/opencode-workers/<wid>/stdout.log
//
// Prints a compact structured timeline: connection errors, retry attempts,
// provider_request events, thinking vs text deltas, TTFT, final usage.
// This is the diagnosis tool that would have instantly shown "inkling is in
// a silent connection-retry loop" instead of "both workers look like they're
// thinking" (W56 vision faceoff, 2026-07-29).
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

function resolveLog(arg) {
  if (existsSync(arg)) return arg;
  if (arg.startsWith('ocw_') || /^ocw[/_]/.test(arg)) {
    const wid = arg.replace(/^ocw[/_]/, 'ocw_');
    const dir = join('.opencode', 'opencode-workers', wid);
    const f = join(dir, 'stdout.log');
    if (existsSync(f)) return f;
  }
  // partial prefix match
  const root = '.opencode/opencode-workers';
  if (existsSync(root)) {
    for (const d of readdirSync(root)) {
      if (d.startsWith(arg) || d.includes(arg)) {
        const f = join(root, d, 'stdout.log');
        if (existsSync(f)) return f;
      }
    }
  }
  throw new Error('could not resolve worker stdout log for: ' + arg);
}

function main() {
  const arg = process.argv[2];
  if (!arg) { console.error('usage: worker-health.mjs <worker-id-or-path>'); process.exit(2); }
  const logPath = resolveLog(arg);
  const raw = readFileSync(logPath, 'utf8');
  const lines = raw.split('\n').filter(Boolean);
  let model = '?', connErr = 0, retries = 0, lastRetryAttempt = 0, lastError = '';
  let thinking = 0, text = 0, textNonStreamed = 0, toolCalls = 0, toolResults = 0;
  let firstTs = null, firstAssistantTs = null, lastTs = 0, agentSettled = false;
  let retryAfterHonored = null, promptTs = null;
  const seenErrTs = new Set();
  for (const line of lines) {
    let j; try { j = JSON.parse(line); } catch { continue; }
    const ts = j.timestamp || (j.message && j.message.timestamp) || null;
    if (ts) { if (!firstTs) firstTs = ts; lastTs = Math.max(lastTs, ts); }
    if (j.model) model = j.model;
    else if (j.message && j.message.model) model = j.message.model;
    else if (j.route) model = j.route;
    // Count errors across ALL lifecycle events (message_start/message_end/turn_end/agent_end)
    // deduped by timestamp — the retry loop repeats the same error in several event types.
    const errMsg = (j.message && j.message.errorMessage) || j.errorMessage;
    if (errMsg && j.message && j.message.stopReason === 'error') {
      const key = j.message.timestamp || ts || Math.random();
      if (!seenErrTs.has(key)) { seenErrTs.add(key); connErr++; lastError = errMsg; }
    }
    if (j.type === 'message_start' && j.message && j.message.role === 'assistant') {
      if (!firstAssistantTs && j.message.timestamp) firstAssistantTs = j.message.timestamp;
    }
    if (j.type === 'auto_retry_start') { retries++; lastRetryAttempt = j.attempt; if ('__retryAfterHonored__' in j) retryAfterHonored = j.__retryAfterHonored__; }
    // thinking: streamed deltas OR non-streamed thinking content blocks
    if (j.type === 'thinking_delta') thinking++;
    else if (j.message && Array.isArray(j.message.content) && j.message.content.some(c => c.type === 'thinking')) thinking++;
    // text: streamed deltas OR non-streamed final text (some providers return full text in one shot)
    if (j.type === 'text_delta') text++;
    else if (j.message && Array.isArray(j.message.content) && j.message.content.some(c => c.type === 'text' && c.text)) textNonStreamed++;
    if (j.type === 'toolCall') toolCalls++;
    if (j.type === 'toolResults') toolResults++;
    if (j.type === 'agent_settled') agentSettled = true;
    if (j.type === 'turn_end' && ts && !promptTs) promptTs = ts;
  }
  // final usage
  let usage = null;
  for (let i = lines.length - 1; i >= 0; i--) {
    let j; try { j = JSON.parse(lines[i]); } catch { continue; }
    const u = j.message && j.message.usage;
    if (u && (u.totalTokens || u.input || u.output)) { usage = u; break; }
  }
  const fmtTs = ms => ms ? new Date(ms).toISOString().slice(11,19) + 'Z' : '-';
  const dur = (a,b) => (a&&b) ? ((b-a)/1000).toFixed(1)+'s' : '-';
  console.log('worker-health:', logPath);
  console.log('  model:            ', model);
  console.log('  state:            ', agentSettled ? 'SETTLED (terminal)' : 'in-progress');
  console.log('  timeline:         ', fmtTs(firstTs), '->', fmtTs(lastTs), '(' + dur(firstTs,lastTs) + ')');
  console.log('  first assistant:  ', fmtTs(firstAssistantTs), '(' + dur(firstTs, firstAssistantTs) + ' TTFT-ish)');
  console.log('  --- provider health (HIDDEN by poll) ---');
  console.log('  connection errors:', connErr, connErr ? '  <<< POLL HID THIS' : '');
  console.log('  retry attempts:   ', retries, lastRetryAttempt ? '(last attempt '+lastRetryAttempt+')' : '');
  console.log('  last error:       ', lastError || '(none)');
  console.log('  retryAfterHonored:', retryAfterHonored ?? '-');
  console.log('  --- token stream ---');
  console.log('  thinking deltas:  ', thinking, thinking && !text && !textNonStreamed ? '  <<< reasoning-only (still thinking OR stuck)' : '');
  console.log('  text deltas:      ', text, textNonStreamed ? '(+'+textNonStreamed+' non-streamed final blocks)' : '');
  console.log('  tool calls:       ', toolCalls, '| tool results:', toolResults);
  console.log('  --- final usage ---');
  if (usage) {
    console.log('  ', JSON.stringify({input:usage.input,output:usage.output,cacheRead:usage.cacheRead,reasoning:usage.reasoning,total:usage.totalTokens,cost:usage.cost&&usage.cost.total}));
  } else { console.log('   (no usage recorded yet)'); }
  // verdict
  const hasOutput = text > 0 || textNonStreamed > 0;
  if (connErr > 0 && !hasOutput && thinking < 20) console.log('  VERDICT: stuck in connection-error retry loop — NOT progressing. Check router/upstream, consider relaunch.');
  else if (connErr > 0 && hasOutput) console.log('  VERDICT: hit connection errors but RECOVERED and produced output.');
  else if (connErr > 0 && !hasOutput) console.log('  VERDICT: connection errors, no output yet — retrying (check router/upstream).');
  else if (thinking > 0 && !hasOutput && !agentSettled) console.log('  VERDICT: reasoning, no visible output yet — likely thinking (verify with another poll).');
  else if (agentSettled) console.log('  VERDICT: completed.');
  else console.log('  VERDICT: in progress.');
}

main();