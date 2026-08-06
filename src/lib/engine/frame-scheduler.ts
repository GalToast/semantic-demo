/**
 * Shared per-frame task registry for camera and scene choreography.
 *
 * The Three engine already owns the render-loop RAF. Choreography tasks use
 * this registry so they update immediately before the engine renders instead
 * of creating independent RAF callbacks for the same browser frame.
 */

export type FrameTask = (now: number) => boolean | void

let nextTaskId = 0
const frameTasks = new Map<number, FrameTask>()
let wakeRenderLoop: (() => void) | null = null

/** Connect the registry to the engine's existing continuous-frame wake path. */
export function setFrameSchedulerWake(callback: (() => void) | null): void {
    wakeRenderLoop = callback
}

/** Add a task and return an idempotent cancellation function. */
export function scheduleFrameTask(task: FrameTask): () => void {
    const taskId = ++nextTaskId
    let active = true
    frameTasks.set(taskId, task)
    wakeRenderLoop?.()

    return () => {
        if (!active) return
        active = false
        frameTasks.delete(taskId)
    }
}

/** Run a stable snapshot so tasks added during a frame begin on the next one. */
export function runFrameTasks(now: number): void {
    if (frameTasks.size === 0) return

    for (const [taskId, task] of Array.from(frameTasks.entries())) {
        if (!frameTasks.has(taskId)) continue
        if (task(now) === true) frameTasks.delete(taskId)
    }
}

export function hasScheduledFrameTasks(): boolean {
    return frameTasks.size > 0
}

/** Clear all tasks during a full engine teardown or test reset. */
export function clearScheduledFrameTasks(): void {
    frameTasks.clear()
}
