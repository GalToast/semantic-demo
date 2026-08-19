#!/usr/bin/env node
/**
 * tests/frame-scheduler-contract.mjs
 *
 * Node contract for src/lib/engine/frame-scheduler.ts — the shared per-frame
 * task registry that every camera/scene choreography contract depends on.
 * Pure JS, no DOM, no WebGL. Runs in plain Node.
 *
 * Covers: scheduleFrameTask, runFrameTasks, hasScheduledFrameTasks,
 *         clearScheduledFrameTasks, setFrameSchedulerWake.
 *
 * The interesting invariants this locks:
 *   - scheduleFrameTask returns an idempotent cancellation fn
 *   - a task returning `true` is removed after running; `false`/`void` keeps it
 *   - runFrameTasks snapshots tasks at call start (stable snapshot): a task
 *     scheduled DURING a run is NOT executed in the same pass
 *   - clearScheduledFrameTasks empties the registry
 *   - wakeRenderLoop is invoked by scheduleFrameTask and cleared by null
 */

import { register } from 'node:module'
import { fileURLToPath } from 'node:url'

const tsResolve = new URL('./helpers/ts-resolve-loader.mjs', import.meta.url)
register(tsResolve, import.meta.url)

// ── Helpers ──────────────────────────────────────────────────────────────────

function assert(cond, msg) {
    if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`)
}

// ── Tests ────────────────────────────────────────────────────────────────────

async function testScheduleAndCancel() {
    console.log('\n[TEST] scheduleFrameTask + cancellation')

    const { scheduleFrameTask, hasScheduledFrameTasks, clearScheduledFrameTasks } =
        await import('../src/lib/engine/frame-scheduler.ts')

    clearScheduledFrameTasks()
    assert(hasScheduledFrameTasks() === false, 'empty registry initially')

    let ran = false
    const cancel = scheduleFrameTask(() => {
        ran = true
    })
    assert(typeof cancel === 'function', 'scheduleFrameTask should return a function')
    assert(hasScheduledFrameTasks() === true, 'task should be registered')

    // Idempotent cancellation: calling twice must not throw.
    cancel()
    cancel()
    assert(hasScheduledFrameTasks() === false, 'task should be removed after cancel')
    assert(ran === false, 'task must not run before runFrameTasks')

    clearScheduledFrameTasks()
    console.log('  OK schedules, returns cancel fn, idempotent cancel, task not run pre-drive')
}

async function testRunFrameTasksRemovesDoneTasks() {
    console.log('\n[TEST] runFrameTasks — done vs pending tasks')

    const { scheduleFrameTask, runFrameTasks, hasScheduledFrameTasks, clearScheduledFrameTasks } =
        await import('../src/lib/engine/frame-scheduler.ts')

    clearScheduledFrameTasks()
    let doneCount = 0
    let pendingCount = 0

    scheduleFrameTask(() => {
        doneCount += 1
        return true // done -> removed
    })
    scheduleFrameTask(() => {
        pendingCount += 1
        return false // pending -> kept
    })
    scheduleFrameTask(() => {
        /* void return -> treated as pending, kept */
    })

    runFrameTasks(100)
    assert(doneCount === 1, 'done task should run once')
    assert(pendingCount === 1, 'pending task should run once')
    assert(hasScheduledFrameTasks() === true, 'pending tasks should remain')

    // Pending tasks keep running on subsequent frames.
    runFrameTasks(200)
    assert(doneCount === 1, 'done task should not run again')
    assert(pendingCount === 2, 'pending task should run again')

    clearScheduledFrameTasks()
    console.log('  OK done tasks removed, pending tasks persist across frames')
}

async function testStableSnapshot() {
    console.log('\n[TEST] runFrameTasks — stable snapshot (no same-pass rescheduling)')

    const { scheduleFrameTask, runFrameTasks, hasScheduledFrameTasks, clearScheduledFrameTasks } =
        await import('../src/lib/engine/frame-scheduler.ts')

    clearScheduledFrameTasks()
    let pass1Count = 0
    let pass2Count = 0
    let rescheduledDuringPass1 = false

    // This task, on its first run, schedules a NEW task. Because runFrameTasks
    // snapshots with Array.from() at call start, the new task must NOT run in
    // the same pass — only on the next.
    scheduleFrameTask((now) => {
        pass1Count += 1
        if (pass1Count === 1) {
            rescheduledDuringPass1 = true
            scheduleFrameTask((n) => {
                pass2Count += 1
            })
        }
        return true
    })

    runFrameTasks(100)
    assert(pass1Count === 1, 'first task should run once in pass 1')
    assert(pass2Count === 0, 'task scheduled during pass 1 must NOT run in pass 1 (stable snapshot)')
    assert(rescheduledDuringPass1 === true, 'sanity: the reschedule did happen')

    runFrameTasks(200)
    assert(pass2Count === 1, 'task scheduled during pass 1 must run in pass 2')

    clearScheduledFrameTasks()
    console.log('  OK stable snapshot: same-pass reschedule deferred to next pass')
}

async function testWakeCallback() {
    console.log('\n[TEST] setFrameSchedulerWake + scheduleFrameTask invokes it')

    const { scheduleFrameTask, clearScheduledFrameTasks, hasScheduledFrameTasks } =
        await import('../src/lib/engine/frame-scheduler.ts')
    const { setFrameSchedulerWake } = await import('../src/lib/engine/frame-scheduler.ts')

    clearScheduledFrameTasks()
    let wakeCount = 0
    let captured = null
    const wake = () => {
        wakeCount += 1
        captured = 'woken'
    }
    setFrameSchedulerWake(wake)

    scheduleFrameTask(() => {})
    assert(wakeCount === 1, 'scheduleFrameTask should invoke the wake callback')
    assert(captured === 'woken', 'wake callback should have run')

    // Clearing the wake with null stops further invocations.
    setFrameSchedulerWake(null)
    const before = wakeCount
    scheduleFrameTask(() => {})
    assert(wakeCount === before, 'wake callback should NOT run after null is set')

    // Restore a no-op wake so this module's state doesn't leak into other tests.
    setFrameSchedulerWake(() => {})
    clearScheduledFrameTasks()
    console.log('  OK wake invoked by scheduleFrameTask, null clears it')
}

async function testClearAndHas() {
    console.log('\n[TEST] clearScheduledFrameTasks + hasScheduledFrameTasks')

    const { scheduleFrameTask, clearScheduledFrameTasks, hasScheduledFrameTasks } =
        await import('../src/lib/engine/frame-scheduler.ts')

    clearScheduledFrameTasks()
    assert(hasScheduledFrameTasks() === false, 'empty after clear')
    scheduleFrameTask(() => {})
    scheduleFrameTask(() => {})
    assert(hasScheduledFrameTasks() === true, 'tasks present after scheduling')
    clearScheduledFrameTasks()
    assert(hasScheduledFrameTasks() === false, 'empty after clear with tasks present')

    console.log('  OK clear empties, has reflects size')
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
    const tests = [
        testScheduleAndCancel,
        testRunFrameTasksRemovesDoneTasks,
        testStableSnapshot,
        testWakeCallback,
        testClearAndHas
    ]

    let passed = 0
    let failed = 0

    for (const test of tests) {
        try {
            await test()
            passed++
        } catch (err) {
            console.error(`  ${err.message}`)
            failed++
        }
    }

    console.log(`\n${'─'.repeat(50)}`)
    console.log(`  ${passed} passed, ${failed} failed`)
    if (failed > 0) process.exit(1)
}

main().catch((err) => {
    console.error('FATAL:', err)
    process.exit(1)
})
