/**
 * js/modules/webgl-restore-adapter.ts
 *
 * TypeScript shadow of webgl-restore-adapter.js.
 * WebGL context restore handler registry.
 */

let _restoreHandler: (() => Promise<any> | any) | null = null;

export function setWebGLContextRestoreHandler(fn: (() => Promise<any> | any) | null): void {
    _restoreHandler = typeof fn === 'function' ? fn : null;
}

export function restoreWebGLContext(): Promise<boolean> {
    if (!_restoreHandler) return Promise.resolve(false);
    return Promise.resolve(_restoreHandler()).then(() => true);
}
