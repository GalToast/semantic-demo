/**
 * @lib/audio/jam-rig.ts — One shared rig store for the jam dials.
 *
 * JamView ("?jam=1") and SonicIdentity (focus panel) each held their own
 * noteState/bandMode — co-mounting split the truth, and two tabs diverged
 * silently (settings read once at mount, never re-synced). This module is
 * the single source: both surfaces subscribe, both write through here, and
 * a `storage` listener pulls cross-tab changes in. localStorage stays the
 * persistence layer (same key, same shape — existing profiles migrate).
 */

import { loadJamSettings, saveJamSettings } from '@lib/audio/jam-radio'
import type { RadioBandMode } from '@lib/audio/jam-radio'

export interface JamRigState {
    noteState: number
    bandMode: RadioBandMode
    progSpec: string
    progBpm: number
    morphT: number
    volume: number
}

export const JAM_RIG_DEFAULTS: JamRigState = {
    noteState: 4,
    bandMode: 'tone',
    progSpec: 'Am-F-C-G',
    progBpm: 100,
    morphT: 0,
    volume: 1
}

type Listener = (s: JamRigState) => void

function current(): JamRigState {
    const saved = loadJamSettings()
    return {
        noteState: saved.noteState ?? JAM_RIG_DEFAULTS.noteState,
        bandMode: saved.bandMode ?? JAM_RIG_DEFAULTS.bandMode,
        progSpec: saved.progSpec ?? JAM_RIG_DEFAULTS.progSpec,
        progBpm: saved.progBpm ?? JAM_RIG_DEFAULTS.progBpm,
        morphT: saved.morphT ?? JAM_RIG_DEFAULTS.morphT,
        volume: saved.volume ?? JAM_RIG_DEFAULTS.volume
    }
}

let state: JamRigState = current()
const listeners = new Set<Listener>()
let storageBound = false

function emit(): void {
    try {
        saveJamSettings({ ...state })
    } catch {
        // persistence is best-effort; in-memory truth still updates
    }
    for (const fn of [...listeners]) {
        try {
            fn({ ...state })
        } catch {
            // one bad subscriber must not break the rig
        }
    }
}

function onStorage(ev: StorageEvent): void {
    if (!ev.key || ev.key !== 'sonic-jam-settings-v1') return
    const next = current()
    state = next
    for (const fn of [...listeners]) {
        try {
            fn({ ...next })
        } catch {
            // ignore
        }
    }
}

function ensureStorageBinding(): void {
    if (storageBound) return
    try {
        if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
            window.addEventListener('storage', onStorage)
            storageBound = true
        }
    } catch {
        // headless — skip cross-tab sync
    }
}

/** Snapshot of the rig (copy — mutate via patchRig). */
export function getRig(): JamRigState {
    ensureStorageBinding()
    return { ...state }
}

/** Merge a patch into the rig, persist, and notify subscribers. */
export function patchRig(patch: Partial<JamRigState>): JamRigState {
    ensureStorageBinding()
    state = { ...state, ...patch }
    emit()
    return { ...state }
}

/** Subscribe to rig changes. Returns an unsubscribe fn. */
export function subscribeRig(fn: Listener): () => void {
    ensureStorageBinding()
    listeners.add(fn)
    return () => {
        listeners.delete(fn)
    }
}

/** Reset module state (unit tests). */
export function resetRigForTest(next?: Partial<JamRigState>): void {
    state = { ...JAM_RIG_DEFAULTS, ...next }
    listeners.clear()
}
