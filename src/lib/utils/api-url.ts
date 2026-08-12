/**
 * @lib/utils/api-url.ts — Build API URLs with an optional origin override.
 *
 * In production the API is served same-origin, so the default returns a
 * root-relative path. In dev/test environments `VITE_API_BASE_URL` can be set
 * to a different origin (e.g. `http://127.0.0.1:8795`) so the API lives on a
 * separate origin from static assets. This avoids the browser's per-origin
 * connection limit, which can queue `/api.php` requests behind large static
 * downloads (data.dat, JS chunks) and cause tests to time out.
 */
// NOTE: no optional chaining here — `import.meta.env?.VITE_API_BASE_URL`
// defeats Vite's static define-replacement (it only matches the exact
// `import.meta.env.VITE_X` expression), so the override silently resolved to
// '' and cross-origin API config never worked (W85).
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? ''

export function apiUrl(path: string): string {
    // Support both 'api.php?...' and '/api.php?...' style inputs.
    const cleanPath = path.replace(/^\//, '')
    if (API_BASE_URL) {
        return `${API_BASE_URL}/${cleanPath}`
    }
    return `/${cleanPath}`
}
