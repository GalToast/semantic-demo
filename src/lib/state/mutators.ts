/**
 * @lib/state/mutators.ts
 *
 * Ported from:
 * State mutator functions. Each updates the corresponding state field
 * through withStateMutation().
 */

import { appState } from './app.svelte'
import { withStateMutation } from './with-state-mutation'
import type { ViewName, NavState, SemanticState } from '@lib/state/state-types'

const state = appState as unknown as SemanticState

export function setCurrentView(view: string): void {
    withStateMutation(() => {
        state.currentView = view as ViewName
    })
}

export function setNavState(updates: Partial<NavState>): void {
    withStateMutation(() => {
        Object.assign(state.navState, updates)
    })
}

export function updateSemanticLaneState(newState: string): void {
    withStateMutation(() => {
        state.semanticLaneState = newState
    })
}

export function updateLoadingPhaseKey(key: string): void {
    withStateMutation(() => {
        state.loadingPhaseKey = key as 'records' | 'scene' | 'restore' | 'launch'
    })
}

export function updateSemanticThreadsStatus(status: string): void {
    withStateMutation(() => {
        state.semanticThreadsStatus = status
    })
}
