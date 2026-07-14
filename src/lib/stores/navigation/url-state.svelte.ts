/**
 * @lib/stores/navigation/url-state.svelte.ts — URL state handling
 *
 * Manages navigation state related to URL synchronization:
 * whether URL state is being applied, browser history restoration,
 * and the restore token counter.
 */
import { navStore, writeNavStateMirror } from './navigation-state.svelte.ts'

/** Set whether URL state is currently being applied. */
export function setApplyingUrlState(applying: boolean): void {
    writeNavStateMirror({ applyingUrlState: applying })
}

/** Set whether browser history is currently being restored. */
export function setRestoringBrowserHistory(restoring: boolean): void {
    writeNavStateMirror({ restoringBrowserHistory: restoring })
}

/** Increment the URL state restore token. */
export function bumpUrlStateRestoreToken(): number {
    const current = navStore()
    const next = current.urlStateRestoreToken + 1
    writeNavStateMirror({ urlStateRestoreToken: next })
    return next
}
