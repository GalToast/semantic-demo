import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
    clearScheduledFrameTasks,
    hasScheduledFrameTasks,
    runFrameTasks,
    scheduleFrameTask,
    setFrameSchedulerWake
} from '@lib/engine/frame-scheduler'

describe('frame scheduler', () => {
    beforeEach(() => {
        clearScheduledFrameTasks()
        setFrameSchedulerWake(null)
    })

    it('wakes the engine and runs tasks in registration order', () => {
        const wake = vi.fn()
        const calls: string[] = []
        setFrameSchedulerWake(wake)

        scheduleFrameTask((now) => {
            calls.push(`first:${now}`)
            return true
        })
        scheduleFrameTask((now) => {
            calls.push(`second:${now}`)
            return true
        })

        expect(wake).toHaveBeenCalledTimes(2)
        expect(hasScheduledFrameTasks()).toBe(true)
        runFrameTasks(123)
        expect(calls).toEqual(['first:123', 'second:123'])
        expect(hasScheduledFrameTasks()).toBe(false)
    })

    it('keeps unfinished tasks and makes cancellation idempotent', () => {
        const task = vi.fn(() => false)
        const cancel = scheduleFrameTask(task)

        runFrameTasks(1)
        expect(task).toHaveBeenCalledTimes(1)
        expect(hasScheduledFrameTasks()).toBe(true)

        cancel()
        cancel()
        runFrameTasks(2)
        expect(task).toHaveBeenCalledTimes(1)
        expect(hasScheduledFrameTasks()).toBe(false)
    })

    it('defers tasks added during a frame until the next frame', () => {
        const calls: string[] = []
        scheduleFrameTask(() => {
            calls.push('outer')
            scheduleFrameTask(() => {
                calls.push('inner')
                return true
            })
            return true
        })

        runFrameTasks(10)
        expect(calls).toEqual(['outer'])
        expect(hasScheduledFrameTasks()).toBe(true)

        runFrameTasks(20)
        expect(calls).toEqual(['outer', 'inner'])
        expect(hasScheduledFrameTasks()).toBe(false)
    })
})
