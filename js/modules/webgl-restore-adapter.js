let _restoreHandler = null;

export function setWebGLContextRestoreHandler(fn) {
    _restoreHandler = typeof fn === 'function' ? fn : null;
}

export function restoreWebGLContext() {
    if (!_restoreHandler) return Promise.resolve(false);
    return Promise.resolve(_restoreHandler()).then(() => true);
}
