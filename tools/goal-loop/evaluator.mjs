// tools/goal-loop/evaluator.mjs — compatibility facade for the canonical Pi
// goal engine. The runtime implementation lives in the enabled extension at
// ~/.pi/agent/extensions/goal.ts; this file keeps the historical CLI/test API
// without maintaining a second parser, evaluator, or state writer.
import { dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const MODULE_DIR = dirname(fileURLToPath(import.meta.url))
const DEFAULT_CWD = dirname(dirname(MODULE_DIR))
const DEFAULT_EXTENSION_PATH = 'C:/Users/HP/.pi/agent/extensions/goal.ts'
const extensionPath = process.env.PI_GOAL_EXTENSION_PATH || DEFAULT_EXTENSION_PATH
const engine = await import(`${pathToFileURL(extensionPath).href}?goal-loop-engine=1`)

export const STATE_PATH =
    process.env.GOAL_STATE_PATH || process.env.PI_GOAL_STATE_PATH || engine.DEFAULT_GOAL_STATE_PATH

export const MAX_GOAL_TURNS = engine.MAX_GOAL_TURNS
export const MAX_GOAL_FILE_BUDGET = engine.MAX_GOAL_FILE_BUDGET
export const MAX_GOAL_FILE_MINUTES = engine.MAX_GOAL_FILE_MINUTES
export const GOAL_FILE_LEDGER_LIMIT = engine.GOAL_FILE_LEDGER_LIMIT
export const MAX_GOAL_CONDITION_PARTS = engine.MAX_GOAL_CONDITION_PARTS
export const MAX_GOAL_STATE_FILE_BYTES = engine.MAX_GOAL_STATE_FILE_BYTES

export const parseCondition = engine.parseCondition

function conditionText(condition) {
    if (!condition || typeof condition !== 'object') return String(condition || '')
    if (condition.type === 'and' || condition.type === 'or') {
        return `cond::${condition.type}:[${(condition.payload || []).join(',')}]`
    }
    return `cond::${condition.type}:${condition.payload || ''}`
}

function publicCheck(check) {
    if (!check) return null
    return {
        met: check.checked ? check.met : null,
        checked: check.checked,
        evidence: check.detail,
        detail: check.detail,
    }
}

/** Historical API retained for scripts that import evaluateCondition. */
export function evaluateCondition(condition, opts = {}) {
    return publicCheck(engine.evaluateCondition(String(condition || ''), {
        cwd: opts.cwd || DEFAULT_CWD,
        timeoutMs: opts.timeoutMs,
    }))
}

/** Historical compound API retained as a thin projection of the same engine. */
export function evaluateCompound(condition, opts = {}) {
    const parsed = typeof condition === 'string' ? engine.parseCondition(condition) : condition
    const check = evaluateCondition(conditionText(parsed), opts)
    return { met: check.met, evidence: check.evidence, parts: [check] }
}

export function defaultState(goal, conditionStr, budget = 12, maxMinutes = 0) {
    return engine.defaultGoalState(goal, conditionStr, budget, maxMinutes)
}

export function readStateFile(p = STATE_PATH) {
    return engine.readGoalStateFileAt(p)
}

export function writeStateFile(state, p = STATE_PATH) {
    return engine.writeGoalStateFileAt(state, p) || state
}

export function updateStateFile(state, p = STATE_PATH) {
    return writeStateFile(state, p)
}

// One transition function for both the CLI and Pi's agent_end file driver.
// Unresolved judge conditions remain resumable and do not consume a turn.
export function evaluateAndUpdate(state, opts = {}) {
    const result = engine.evaluateGoalState(state, {
        cwd: opts.cwd || DEFAULT_CWD,
        timeoutMs: opts.timeoutMs,
        verdict: opts.verdict,
    })
    return {
        state: result.state,
        continueLoop: result.continueLoop,
        check: publicCheck(result.check),
        reason: result.reason,
    }
}
