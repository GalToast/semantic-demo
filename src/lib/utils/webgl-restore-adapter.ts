/**
 * @lib/utils/webgl-restore-adapter.ts — WebGL context restore handler registry
 *
 * Allows the engine to register a restore callback that is invoked
 * when the WebGL context is lost and needs recovery.
 *
 * Port of
 */

let _restoreHandler: (() => Promise<unknown> | unknown) | null = null

/**
 * Register (or clear) the handler that restores the WebGL context.
 *
 * @param fn - Async or sync restore function, or null to clear.
 */
export function setWebGLContextRestoreHandler(fn: (() => Promise<unknown> | unknown) | null): void {
    _restoreHandler = typeof fn === 'function' ? fn : null
}

/**
 * Invoke the registered restore handler.
 *
 * @returns true if a handler was invoked, false if none was registered.
 */
export function restoreWebGLContext(): Promise<boolean> {
    if (!_restoreHandler) return Promise.resolve(false)
    return Promise.resolve(_restoreHandler()).then(() => true)
}
