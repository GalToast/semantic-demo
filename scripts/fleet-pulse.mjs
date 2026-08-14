/* fleet-pulse.mjs — human-visible observability for in-flight subagent swarms.
 * Prints per-lane: status, log size + last-activity, report artifacts on disk,
 * plus the dirty working-tree one-liner. Run while lanes are at sea so the
 * main lane's 'waiting' messages carry live receipts, never "…".
 * Usage: node scripts/fleet-pulse.mjs [swarmDir=tmp/swarm-audit]
 */
import { readdirSync, statSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

const SWARM = process.argv[2] || 'tmp/swarm-audit';
const RECENT_MS = 1000 * 60 * 60; // lanes idle > 1h treated as done
const now = Date.now();

const logTail = (s) => {
  try {
    const b = statSync(join(s, 'stdout.log')).size;
    const m = statSync(join(s, 'stdout.log')).mtimeMs;
    return `${(b / 1e6).toFixed(1)}MB@${Math.max(0, (now - m) / 1000).toFixed(0)}s`;
  } catch {
    return 'no-log';
  }
};
const reportCount = (s) => {
  try {
    const hits = readdirSync(s).filter((f) => f.endsWith('.md') || f.endsWith('.json'));
    return hits.length ? `${hits.length}rt` : '—';
  } catch {
    return '—';
  }
};
const laneStatus = (s) => {
  try {
    const meta = JSON.parse(readFileSync(join(s, 'metadata.json'), 'utf8'));
    return meta.status || '▲';
  } catch {
    return '▲';
  }
};

let lines = [];
try {
  readdirSync(SWARM, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name.startsWith('ocw_'))
    .forEach((d) => {
      const full = join(SWARM, d.name);
      if (now - statSync(full).mtimeMs > RECENT_MS) return;
      lines.push(
        `  ${d.name.slice(4, 12)} ${laneStatus(full).padEnd(9)} ${logTail(full)} reports=${reportCount(full)}`
      );
    });
} catch {
  lines = '  (swarm dir unreadable)';
}

const dirty = (() => {
  try {
    const out = execSync('git status --porcelain', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
    return out.split('\n').filter(Boolean).slice(0, 10).join(' | ') || 'clean';
  } catch {
    return 'git-unavailable';
  }
})();

console.log(`fleet-pulse: ${lines.length} fresh lane(s)`);
console.log(lines.length ? lines.join('\n') : '  — none in flight');
console.log('tree-dirty:', dirty);