// three-shim.js - Maps esbuild's external 'three' to window.THREE
// Since Three.js is loaded via CDN and exposes window.THREE, we provide it here
module.exports = window.THREE;