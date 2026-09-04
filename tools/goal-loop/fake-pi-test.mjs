// goal-loop-fake-pi-test.mjs — prove the goal-loop extension's loop behavior
// with a stubbed pi object (no real harness). Run: node goal-loop-fake-pi-test.mjs
import { pathToFileURL } from 'node:url'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'

const EXT = 'C:/Users/HP/.pi/agent/extensions/goal.ts'
const STATE = `C:/tmp/pi-goal-loop-fake-${process.pid}.json`
const INHERIT = `C:/tmp/pi-goal-loop-fake-${process.pid}-inherit.json`
const TELEMETRY = `C:/tmp/pi-goal-loop-fake-${process.pid}-events.jsonl`
mkdirSync('C:/tmp', { recursive: true })
process.env.PI_GOAL_STATE_PATH = STATE
process.env.PI_GOAL_INHERIT_STATE_PATH = INHERIT
process.env.PI_GOAL_TELEMETRY_PATH = TELEMETRY

const captured = {}
const sendMessages = []
const fakePi = {
    on: (ev, fn) => {
        captured[ev] = fn
    },
    sendMessage: async (msg) => sendMessages.push(msg),
    exec: async () => ({ stdout: '', code: 0 }),
    registerTool: () => {},
    registerCommand: () => {},
    appendEntry: () => {},
}
const mod = await import(pathToFileURL(EXT).href)
mod.default(fakePi)

function freshState(over = {}) {
    const base = {
        // Quote the JavaScript so this fixture is valid under both cmd.exe
        // and the POSIX shell used by the live Pi bash tool on Windows.
        goal: 'cond::cmd: node -e "process.exit(0)"',
        condition: 'cond::cmd: node -e "process.exit(0)"',
        budget: 3,
        turnCount: 0,
        status: 'running',
        startedAt: new Date().toISOString(),
        lastCheckAt: null,
        lastEvidence: ''
    }
    writeFileSync(STATE, JSON.stringify({ ...base, ...over }))
}
const ctx = { sendMessage: async (msg) => sendMessages.push(msg) }

let pass = 0,
    fail = 0
function assert(cond, label) {
    if (cond) {
        pass++
        console.log('  PASS', label)
    } else {
        fail++
        console.log('  FAIL', label)
    }
}

// 1. Registers the hooks
assert(typeof captured.agent_end === 'function', 'registers agent_end')
assert(typeof captured.session_before_compact === 'function', 'registers session_before_compact')

// 2. Met condition → no nextTurn
freshState({ condition: 'cond::cmd: node -e "process.exit(0)"' })
sendMessages.length = 0
await captured.agent_end({}, ctx)
assert(sendMessages.length === 0, 'met condition → no sendMessage')

// 3. Unmet condition → nextTurn with evidence
freshState({ condition: 'cond::cmd: node -e "process.exit(1)"', goal: 'cond::cmd: node -e "process.exit(1)"' })
sendMessages.length = 0
await captured.agent_end({}, ctx)
assert(sendMessages.length === 1, 'unmet condition → sendMessage called')
assert(sendMessages[0]?.customType === 'goal-loop', 'message has customType goal-loop')
assert(/\[goal-loop continue\]/.test(sendMessages[0]?.content || ''), 'message carries continue directive')
assert(/exit=1|Evidence|not yet met/i.test(sendMessages[0]?.content || ''), 'message carries evidence')

// 4. Budget exhausted → stops (no nextTurn)
freshState({
    condition: 'cond::cmd: node -e "process.exit(1)"',
    goal: 'cond::cmd: node -e "process.exit(1)"',
    turnCount: 3,
    budget: 3
})
sendMessages.length = 0
await captured.agent_end({}, ctx)
assert(sendMessages.length === 0, 'budget hit → no sendMessage (loop stops)')

// 5. Status cleared/met → no nextTurn
freshState({ condition: 'cond::cmd: node -e process.exit(1)', goal: 'x', status: 'cleared' })
sendMessages.length = 0
await captured.agent_end({}, ctx)
assert(sendMessages.length === 0, 'status cleared → no sendMessage')

// 6. Missing state file → no crash, no sendMessage
try {
    writeFileSync(STATE, '')
} catch {}
try {
    writeFileSync(STATE, '{')
} catch {}
sendMessages.length = 0
await captured.agent_end({}, ctx)
assert(sendMessages.length === 0, 'malformed/missing state → graceful, no sendMessage')

// 7. state file updated after evaluation (lastCheckAt/status transitions)
freshState({ condition: 'cond::cmd: node -e "process.exit(0)"' })
await captured.agent_end({}, ctx)
const after = JSON.parse(readFileSync(STATE, 'utf8'))
assert(after.status === 'met' || after.status === 'cleared', 'met condition transitions state')

console.log(`\nRESULT: ${pass} pass / ${fail} fail`)
rmSync(STATE, { force: true })
rmSync(INHERIT, { force: true })
rmSync(TELEMETRY, { force: true })
process.exit(fail > 0 ? 1 : 0)
