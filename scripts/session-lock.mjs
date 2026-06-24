#!/usr/bin/env node
/**
 * scripts/session-lock.mjs — Multi-session coordination for the working tree.
 *
 * W46-E4: when multiple AI sessions (Pi, Codex, subagents) share this repo,
 * they can clobber each other's in-flight edits. This tool records who's
 * currently working on what. Other sessions can check `status` and
 * coordinate via the user before touching the same files.
 *
 * Usage:
 *   node scripts/session-lock.mjs acquire "<intent>"  # start a session
 *   node scripts/session-lock.mjs touch               # heartbeat (long work)
 *   node scripts/session-lock.mjs status              # who's working
 *   node scripts/session-lock.mjs release             # end the session
 *   node scripts/session-lock.mjs add-file "<path>"   # track file in flight
 *
 * The lock file lives at .session-lock at the repo root and is gitignored.
 * Locks expire after 30 minutes without a heartbeat; stale locks can be
 * taken over with `--force`.
 *
 * Exit codes:
 *   0 — success
 *   1 — refused (another fresh session is active; coordinate first)
 *   2 — file I/O error
 *
 * See docs/session-coordination.md for the full protocol.
 */

import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { hostname, userInfo } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');
const LOCK_PATH = path.join(ROOT, '.session-lock');
const TTL_MS = 30 * 60 * 1000; // 30 minutes

function sessionId() {
    const u = userInfo()?.username || process.env.USER || process.env.USERNAME || 'unknown';
    const h = hostname().split('.')[0];
    return `${u}@${h}`;
}

function readLock() {
    if (!existsSync(LOCK_PATH)) return null;
    try {
        return JSON.parse(readFileSync(LOCK_PATH, 'utf8'));
    } catch {
        return null;
    }
}

function isStale(lock) {
    if (!lock?.last_heartbeat) return true;
    return Date.now() - new Date(lock.last_heartbeat).getTime() > TTL_MS;
}

function fmtAge(ms) {
    const s = Math.round(ms / 1000);
    if (s < 60) return `${s}s ago`;
    if (s < 3600) return `${Math.round(s / 60)}m ago`;
    return `${Math.round(s / 3600)}h ago`;
}

function status() {
    const lock = readLock();
    if (!lock) {
        console.log('No active session. Working tree is unclaimed.');
        return 0;
    }
    const stale = isStale(lock);
    console.log(`Active session: ${lock.session_id}${stale ? ' (STALE)' : ''}`);
    console.log(`Intent:         ${lock.intent || '(none)'}`);
    console.log(`Started:        ${new Date(lock.started_at).toISOString()} (${fmtAge(Date.now() - new Date(lock.started_at).getTime())})`);
    console.log(`Heartbeat:      ${new Date(lock.last_heartbeat).toISOString()} (${fmtAge(Date.now() - new Date(lock.last_heartbeat).getTime())})`);
    if (lock.files_in_flight?.length) {
        console.log(`Files in flight:`);
        for (const f of lock.files_in_flight) console.log(`  - ${f}`);
    }
    if (stale) {
        console.log(`\n⚠️  Lock is stale (>${TTL_MS / 60000} min without heartbeat). Safe to take over.`);
    } else {
        console.log(`\nLock is fresh. Coordinate with ${lock.session_id} before touching the same files.`);
    }
    return 0;
}

function acquire(intent, force) {
    if (!intent) {
        console.error('Usage: session-lock acquire "<intent>"');
        process.exit(1);
    }
    const existing = readLock();
    if (existing && !isStale(existing) && !force) {
        console.error(`Another session is active: ${existing.session_id}`);
        console.error(`Intent:  ${existing.intent}`);
        console.error(`Started: ${new Date(existing.started_at).toISOString()}`);
        console.error('Coordinate via the user, wait, or run with --force to take over.');
        return 1;
    }
    if (existing && force) {
        console.error(`⚠️  Taking over lock from ${existing.session_id} (${existing.intent})`);
    }
    const now = new Date().toISOString();
    const lock = {
        session_id: sessionId(),
        intent,
        started_at: existing?.started_at || now,
        last_heartbeat: now,
        files_in_flight: existing?.files_in_flight || []
    };
    try {
        writeFileSync(LOCK_PATH, JSON.stringify(lock, null, 2) + '\n', 'utf8');
    } catch (e) {
        console.error(`Failed to write lock file: ${e.message}`);
        return 2;
    }
    console.log(`✓ Lock acquired by ${lock.session_id}`);
    console.log(`  Intent: ${intent}`);
    console.log(`  Run 'node scripts/session-lock.mjs touch' periodically for long work.`);
    console.log(`  Run 'node scripts/session-lock.mjs release' when done.`);
    return 0;
}

function touch() {
    const lock = readLock();
    if (!lock) {
        console.error('No active lock. Run `acquire` first.');
        return 1;
    }
    if (lock.session_id !== sessionId()) {
        console.error(`Lock is held by ${lock.session_id}, not you (${sessionId()}).`);
        return 1;
    }
    lock.last_heartbeat = new Date().toISOString();
    try {
        writeFileSync(LOCK_PATH, JSON.stringify(lock, null, 2) + '\n', 'utf8');
    } catch (e) {
        console.error(`Failed to write lock file: ${e.message}`);
        return 2;
    }
    console.log(`✓ Heartbeat updated. Lock is fresh.`);
    return 0;
}

function release() {
    const lock = readLock();
    if (!lock) {
        console.log('No active lock.');
        return 0;
    }
    if (lock.session_id !== sessionId()) {
        console.error(`Lock is held by ${lock.session_id}, not you (${sessionId()}).`);
        console.error('Use `status` to see the lock. If it is stale, you can `acquire` with --force.');
        return 1;
    }
    try {
        unlinkSync(LOCK_PATH);
    } catch (e) {
        if (e.code !== 'ENOENT') {
            console.error(`Failed to delete lock file: ${e.message}`);
            return 2;
        }
    }
    console.log(`✓ Lock released by ${lock.session_id}`);
    return 0;
}

function addFile(file) {
    if (!file) {
        console.error('Usage: session-lock add-file "<path>"');
        return 1;
    }
    const lock = readLock();
    if (!lock) {
        console.error('No active lock. Run `acquire` first.');
        return 1;
    }
    if (lock.session_id !== sessionId()) {
        console.error(`Lock is held by ${lock.session_id}, not you (${sessionId()}).`);
        return 1;
    }
    if (!lock.files_in_flight.includes(file)) {
        lock.files_in_flight.push(file);
        lock.last_heartbeat = new Date().toISOString();
        try {
            writeFileSync(LOCK_PATH, JSON.stringify(lock, null, 2) + '\n', 'utf8');
        } catch (e) {
            console.error(`Failed to write lock file: ${e.message}`);
            return 2;
        }
    }
    console.log(`✓ Tracking file: ${file}`);
    console.log(`  Files in flight: ${lock.files_in_flight.length}`);
    return 0;
}

const subcommand = process.argv[2];
const arg1 = process.argv[3] || '';
const force = process.argv.includes('--force');

switch (subcommand) {
    case 'acquire':
        process.exit(acquire(arg1, force));
        break;
    case 'touch':
        process.exit(touch());
        break;
    case 'release':
        process.exit(release());
        break;
    case 'status':
        process.exit(status());
        break;
    case 'add-file':
        process.exit(addFile(arg1));
        break;
    default:
        console.error('Usage:');
        console.error('  node scripts/session-lock.mjs acquire "<intent>"  [--force]');
        console.error('  node scripts/session-lock.mjs touch');
        console.error('  node scripts/session-lock.mjs release');
        console.error('  node scripts/session-lock.mjs status');
        console.error('  node scripts/session-lock.mjs add-file "<path>"');
        process.exit(1);
        break;
}
