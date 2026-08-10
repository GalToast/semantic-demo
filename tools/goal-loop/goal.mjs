#!/usr/bin/env node
// tools/goal-loop/goal.mjs — CLI for the goal-loop state machine.
// Usage: node goal.mjs <set|status|clear|pause|resume|step> [condition] [budget]
//   set "cond::cmd: npx vitest run && echo DONE" [budget]  → write goal state
//   status                                              → print current state
//   step                                                → run one evaluateAndUpdate pass (returns continueLoop)
//   clear | pause | resume                               → mutate status
import { writeFileSync } from 'node:fs'
import {
    STATE_PATH,
    defaultState,
    readStateFile,
    writeStateFile,
    evaluateAndUpdate,
} from './evaluator.mjs'

const CLI_STATE = process.env.GOAL_STATE_PATH || STATE_PATH

function usage() {
    console.log(`goal.mjs — condition checkpoint

  set <condition> [budget]   write a new goal (default budget 12)
  status                     print the state (JSON)
  step                       run one evaluateAndUpdate pass
  clear                      clear the goal entirely
  pause / resume             toggle status (paused / running)
state file: ${CLI_STATE}`)
}

function main(argv) {
    const [action, cond, budgetArg] = argv
    if (!action || action === 'help' || action === '--help') { usage(); return }
    const stateFile = CLI_STATE
    switch (action) {
        case 'set': {
            if (!cond) { console.error('set needs a condition'); process.exit(2) }
            const budget = budgetArg ? Math.min(Number(budgetArg) || 12, 200) : 12
            const state = defaultState(cond, cond, budget)
            writeStateFile(state, stateFile)
            console.log('GOAL SET:', JSON.stringify({ status: state.status, budget }, null, 2))
            break
        }
        case 'status': {
            const st = readStateFile(stateFile)
            if (!st) { console.log('NO GOAL STATE'); break }
            console.log(JSON.stringify(st, null, 2))
            break
        }
        case 'step': {
            let st = readStateFile(stateFile)
            if (!st) { console.error('no goal state — set first (goal.mjs set "cond::cmd: ...")'); process.exit(2) }
            const { state, continueLoop, check } = evaluateAndUpdate(st)
            writeStateFile(state, stateFile)
            console.log({ status: state.status, continueLoop, evidence: state.lastEvidence, turns: state.turnCount })
            break
        }
        case 'pause': {
            const st = readStateFile(stateFile); if (!st) { console.error('no goal'); process.exit(2) }
            st.status = 'paused'; writeStateFile(st, stateFile); console.log('PAUSED')
            break
        }
        case 'resume': {
            const st = readStateFile(stateFile); if (!st) { console.error('no goal'); process.exit(2) }
            st.status = 'running'; writeStateFile(st, stateFile); console.log('RESUMED')
            break
        }
        case 'clear': {
            try { writeFileSync(stateFile, ''); console.log('CLEARED') } catch { console.log('no goal file') }
            break
        }
        default: usage(); process.exit(2)
    }
}

main(process.argv.slice(2))