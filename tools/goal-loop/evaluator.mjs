// tools/goal-loop/evaluator.mjs — deterministic evaluator + state machine for the goal-loop extension.
// Node ESM, zero deps (node:fs, node:child_process). Condition syntax:
//   cond::cmd: <shell>      → run, met iff exit 0
//   cond::file:<path>       → met iff path exists
//   cond::judge:<text>      → {met:null, evidence:text} — caller model decides
//   (anything else)         → treated as an inline command unless it starts with a known prefix
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const MODULE_DIR = dirname(fileURLToPath(import.meta.url))
// Default cwd = repo root (two levels up from tools/goal-loop).
const DEFAULT_CWD = dirname(dirname(MODULE_DIR))

export const STATE_PATH = 'C:/Users/HP/.pi/agent/extensions/goal-state.json'

export function parseCondition(conditionStr) {
    const s = String(conditionStr || '').trim()
    const m = s.match(/^cond::(cmd|file|judge):\s*([\s\S]+)$/)
    if (m) return { type: m[1], payload: m[2].trim() }
    // bare conditions become cmd checks (common default) unless they look like plain prose
    if (s.length > 120 || !/[;|&]/.test(s)) {
        return { type: 'judge', payload: s }
    }
    return { type: 'cmd', payload: s }
}

export function evaluateCondition(condition, opts = {}) {
    const c = condition && condition.type ? condition : parseCondition(condition)
    const cwd = opts.cwd || DEFAULT_CWD
    const timeoutMs = opts.timeoutMs || 10000
    const t0 = Date.now()
    try {
        if (c.type === 'file') {
            const ok = existsSync(c.payload)
            return { met: ok, evidence: `file: ${c.payload} ${ok ? 'exists' : 'MISSING'} (${Date.now() - t0}ms)` }
        }
        if (c.type === 'judge') {
            return { met: null, judge: c.payload, evidence: `judge: ${c.payload.slice(0, 120)}` }
        }
        // cmd
        const r = spawnSync(c.payload, { cwd, shell: true, encoding: 'utf8', timeout: timeoutMs })
        const ms = Date.now() - t0
        const out = String(r.stdout || '') + String(r.stderr || '')
        return {
            met: r.status === 0,
            evidence: `cmd exit=${r.status} (${ms}ms) ${out.slice(0, 140).replace(/\s+/g, ' ')}`,
            status: r.status
        }
    } catch (e) {
        return { met: false, evidence: `evaluation threw: ${String(e).slice(0, 120)}` }
    }
}

export function defaultState(goal, conditionStr, budget = 12) {
    return {
        goal: goal || '',
        condition: conditionStr || '',
        startedAt: new Date().toISOString(),
        lastCheckAt: null,
        turnCount: 0,
        budget,
        status: 'running', // running | met | cleared | paused
        lastEvidence: ''
    }
}

export function readStateFile(p = STATE_PATH) {
    try {
        return JSON.parse(readFileSync(p, 'utf8'))
    } catch {
        return null
    }
}

export function writeStateFile(state, p = STATE_PATH) {
    mkdirSync(dirname(p), { recursive: true })
    state.lastCheckAt = new Date().toISOString()
    writeFileSync(p, JSON.stringify(state, null, 2), 'utf8')
    return state
}

export function updateStateFile(state, p = STATE_PATH) {
    return writeStateFile(state, p)
}

// Real gate: return true when a running goal has a not-yet-met condition and budget left.
export function evaluateAndUpdate(state, opts = {}) {
    if (!state || state.status !== 'running') return { state, continueLoop: false, check: null }
    const check = evaluateCondition(state.condition, { cwd: opts.cwd, timeoutMs: opts.timeoutMs })
    state.turnCount += 1
    state.lastEvidence = check.evidence
    if (check.met === true) {
        state.status = 'met'
    } else if (state.turnCount >= state.budget) {
        state.status = 'cleared'
        state.lastEvidence += ' (budget hit)'
    }
    return { state, continueLoop: state.status === 'running', check }
}
