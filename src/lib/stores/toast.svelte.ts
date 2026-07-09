import { writable, get } from 'svelte/store'

/**
 * @lib/stores/toast.svelte.ts — Toast queue + lifetime orchestrator
 *
 * Queue-aware toast store. Rapid calls no longer overwrite each other: each
 * call enqueues behind any currently visible toast; the active toast is
 * followed by the queue in FIFO order. Auto-dismiss advances the queue.
 *
 * State shape exposes both `title`/`copy` (split, for direct DOM rendering)
 * and `message` (newline-joined `title\ncopy`, preserved for legacy
 * consumers and contract tests that read `get(toastStore).message`).
 *
 * Optional knobs (only used by callers that opt in):
 *   - duration?: number   overrides default variant duration (ms)
 *   - dedupeKey?: string  identical toasts already queued are swallowed
 */

export type ToastVariant = 'info' | 'warning' | 'error'

export interface ToastSpec {
    title: string
    copy: string
    variant?: ToastVariant
    /** Override auto-dismiss duration in milliseconds. */
    duration?: number
    /**
     * If set, identical toasts still queued for display are suppressed.
     * Useful for spam-prone messages like "Trail locked".
     */
    dedupeKey?: string
}

interface ToastState {
    /** Newline-joined `title\ncopy` — preserved for legacy consumers/tests. */
    message: string
    title: string
    copy: string
    variant: ToastVariant
    active: boolean
    /** Number of toasts queued behind the currently visible one. */
    queueLength: number
    /**
     * Title of the next toast in the queue (if any). Surfaced in the
     * Toast UI as a "Next: <title>" preview so users know what's coming
     * without having to dismiss the current one to find out.
     * W49-A: added so callers can trust a single source of truth for
     * the queue preview.
     */
    nextTitle: string
}

const DEFAULT_DURATIONS: Record<ToastVariant, number> = {
    info: 5000,
    warning: 6500,
    error: 8000
}

const defaultState: ToastState = {
    message: '',
    title: '',
    copy: '',
    variant: 'info',
    active: false,
    queueLength: 0,
    nextTitle: ''
}

export const toastStore = writable<ToastState>({ ...defaultState })

// Internal queue + timer. Held in module scope for the app lifetime.
const queue: ToastSpec[] = []
let autoTimer: ReturnType<typeof setTimeout> | null = null

function clearAuto(): void {
    if (autoTimer !== null) {
        clearTimeout(autoTimer)
        autoTimer = null
    }
}

function emitVisible(spec: ToastSpec): void {
    const variant: ToastVariant = spec.variant ?? 'info'
    toastStore.set({
        message: `${spec.title}\n${spec.copy}`,
        title: spec.title,
        copy: spec.copy,
        variant,
        active: true,
        queueLength: queue.length,
        nextTitle: queue[0]?.title ?? ''
    })
}

function emitInactive(): void {
    toastStore.set({ ...defaultState })
}

function startAuto(spec: ToastSpec): void {
    clearAuto()
    const variant: ToastVariant = spec.variant ?? 'info'
    const duration = spec.duration ?? DEFAULT_DURATIONS[variant]
    // eslint-disable-next-line no-restricted-syntax -- module-scoped singleton; the autoTimer is tracked in module scope and cleared in clearAuto() + the self-sync subscribe below. DisposableRegistry is for component-scoped lifecycles, which a singleton store doesn't have.
    autoTimer = setTimeout(() => {
        advance()
    }, duration)
}

/** Remove the currently visible toast and surface the next queued one. */
function advance(): void {
    clearAuto()
    const next = queue.shift()
    if (next) {
        emitVisible(next)
        startAuto(next)
    } else {
        emitInactive()
    }
}

function enqueue(spec: ToastSpec): void {
    // Dedupe against what's already in the queue.
    if (spec.dedupeKey && queue.some((s) => s.dedupeKey === spec.dedupeKey)) {
        return
    }

    // Read current visible state. Prefer get() over a throwaway subscribe
    // snapshot (W-audit-G): get() is synchronous and leaves no dangling
    // subscription.
    const isActive = get(toastStore).active

    if (isActive) {
        queue.push(spec)
        toastStore.update((s) => ({
            ...s,
            queueLength: queue.length,
            // Surface the next-in-line title. queue[0] is the next visible
            // toast; the just-pushed one only becomes "next" if the queue
            // was empty before the push (i.e. this is the first queued item).
            nextTitle: queue[0]?.title ?? ''
        }))
    } else {
        emitVisible(spec)
        startAuto(spec)
    }
}

/** Show an info toast (auto-dismisses after 5s by default). */
export function showToast(title: string, copy: string): void {
    enqueue({ title, copy, variant: 'info' })
}

/** Show a warning toast (auto-dismisses after 6.5s by default). */
export function showWarningToast(title: string, copy: string): void {
    enqueue({ title, copy, variant: 'warning' })
}

/** Show an error toast (auto-dismisses after 8s by default). */
export function showErrorToast(title: string, copy: string): void {
    enqueue({ title, copy, variant: 'error' })
}

/** Show a toast from a full spec object (duration, dedupeKey, variant). */
export function showToastSpec(spec: ToastSpec): void {
    enqueue(spec)
}

/** Dismiss the currently visible toast and advance to the next queued. */
export function dismissToast(): void {
    advance()
}

/** Drop every queued toast without firing another auto-dismiss cycle. */
export function clearToastQueue(): void {
    queue.length = 0
    emitInactive()
    clearAuto()
}

// Self-sync: if external code (legacy tests) sets toastStore.set({active:false})
// directly, we treat that as a hard reset — drop everything queued too,
// otherwise interleaving queue + manual resets would leak ghosts.
toastStore.subscribe((s) => {
    if (!s.active && (autoTimer !== null || queue.length > 0)) {
        queue.length = 0
        clearAuto()
    }
})
