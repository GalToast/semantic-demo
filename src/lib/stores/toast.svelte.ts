import { writable } from 'svelte/store'

interface ToastState {
    message: string
    variant: 'info' | 'error'
    active: boolean
}

const defaultState: ToastState = {
    message: '',
    variant: 'info',
    active: false
}

export const toastStore = writable<ToastState>(defaultState)

/** Show an info toast (auto-dismisses after 5s) */
export function showToast(title: string, copy: string): void {
    toastStore.set({
        message: `${title}\n${copy}`,
        variant: 'info',
        active: true
    })
}

/** Show an error toast (auto-dismisses after 8s) */
export function showErrorToast(title: string, copy: string): void {
    toastStore.set({
        message: `${title}\n${copy}`,
        variant: 'error',
        active: true
    })
}

/** Dismiss the toast immediately */
export function dismissToast(): void {
    toastStore.update((s) => ({ ...s, active: false }))
}
