// three-shim.cjs - CommonJS shim for esbuild's __require("three")
// Maps the require call to window.THREE (loaded via CDN)
module.exports = globalThis.THREE;