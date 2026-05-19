// Inject shim — bridges CDN THREE (window.THREE) to esbuild's import system
// The HTML <script type="importmap"> resolves 'three' to unpkg CDN,
// but esbuild's injected import needs a module to bind to.
// This re-exports the CDN global AS a module, AND exposes it on window.
import * as _THREE from 'three';
if (_THREE && typeof _THREE !== 'undefined') {
    window.THREE = _THREE;
} else {
    console.error('inject-three: THREE import failed, window.THREE is undefined');
}
export { _THREE as THREE };
