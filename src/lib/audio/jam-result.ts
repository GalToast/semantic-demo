/**
 * @lib/audio/jam-result.ts — Shared discriminated result for every jam-server
 * HTTP call. Replaces the silent `catch(()=>false)` / `return null` pattern:
 * offline, lease-held (HTTP 409), and rejected (other non-2xx) are distinct
 * so the UI can say "server down" vs "another session owns the stream" vs
 * "server refused that value" instead of doing nothing.
 */

export type JamResultKind = 'ok' | 'offline' | 'lease-held' | 'rejected'

export interface JamOk<T = unknown> {
    kind: 'ok'
    value: T
}
export interface JamOffline {
    kind: 'offline'
}
export interface JamLeaseHeld {
    kind: 'lease-held'
}
export interface JamRejected {
    kind: 'rejected'
    status: number
}

export type JamResult<T = unknown> = JamOk<T> | JamOffline | JamLeaseHeld | JamRejected

export function jamOk(): JamOk<boolean>
export function jamOk<T>(value: T): JamOk<T>
export function jamOk<T>(value?: T): JamOk<T | boolean> {
    return { kind: 'ok', value: (value ?? true) as T | boolean } as JamOk<T | boolean>
}

export function jamOffline(): JamOffline {
    return { kind: 'offline' }
}

export function jamLeaseHeld(): JamLeaseHeld {
    return { kind: 'lease-held' }
}

export function jamRejected(status: number): JamRejected {
    return { kind: 'rejected', status }
}

/** Map a fetch Response to a JamResult. 409 = another session holds the lease. */
export function jamResultFromStatus(status: number, ok: boolean): JamResult<boolean> {
    if (ok) return jamOk(true)
    if (status === 409) return jamLeaseHeld()
    return jamRejected(status)
}

/** Human sentence for the status line. Musician words, no lab jargon. */
export function jamResultLabel(r: JamResult): string | null {
    switch (r.kind) {
        case 'ok':
            return null
        case 'offline':
            return 'Jam server not reachable — sound keeps playing locally.'
        case 'lease-held':
            return 'Another session owns the live stream — retrying keeps your sound.'
        case 'rejected':
            return `Jam server declined that change (${r.status}) — sound unchanged.`
    }
}
