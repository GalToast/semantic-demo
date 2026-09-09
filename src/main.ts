/**
 * @/main.ts — route dispatcher
 *
 * Keep the standalone jam surface on its own bootstrap path. The explorer
 * bootstrap owns the data/adapter/WebGL graph, so importing it before checking
 * the URL would make `?jam=1` pay for engine assets even though JamView never
 * mounts a canvas.
 */
import { mount, unmount } from 'svelte'

function isJamRoute(): boolean {
    try {
        const params = new URLSearchParams(window.location.search)
        return params.get('jam') === '1' || params.get('view') === 'jam'
    } catch {
        return false
    }
}

const mountTarget = document.getElementById('app') ?? document.getElementById('app-root')
let jamApp: ReturnType<typeof mount> | undefined

if (isJamRoute() && mountTarget) {
    // App.svelte normally removes this inline first-paint veil in its onMount.
    // JamView intentionally bypasses App.svelte, so clear the same veil here
    // before mounting the interactive standalone surface.
    document.getElementById('app-loading-placeholder')?.remove()
    import('./components/JamView.svelte')
        .then(({ default: JamView }) => {
            jamApp = mount(JamView, { target: mountTarget })
        })
        .catch((err) => {
            console.error('[main] JamView failed to load:', err)
        })
} else {
    // Keep the full explorer bootstrap out of the jam route's module graph.
    import('./main-explorer').catch((err) => {
        console.error('[main] explorer bootstrap failed to load:', err)
    })
}

function disposeJamApp(): void {
    if (!jamApp) return
    unmount(jamApp)
    jamApp = undefined
}

window.addEventListener('beforeunload', disposeJamApp, { once: true })

if (import.meta.hot) {
    import.meta.hot.dispose(() => {
        disposeJamApp()
    })
}
