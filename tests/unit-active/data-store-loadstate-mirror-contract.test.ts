/**
 * data-store-loadstate-mirror-contract.test.ts
 *
 * Regression detector for the Bug D cluster (data-store.svelte.ts mirror).
 *
 * Bug: historically, `data-store.svelte.ts` had a rune-based _dataLoadState
 * that was NORMALLY NEVER UPDATED because (1) the rune was never subscripted
 * to the canonical dataLoadState writable, and (2) the only writer to that
 * rune was data-store.svelte.ts's own initData(), which production boot never
 * called. Components like FocusPocket read getDataLoadState() from the rune
 * path and always saw status='idle', silently disabling focus mode.
 *
 * Resolution: data-store.svelte.ts was deleted (2026-06-20). All consumers now
 * import getDataLoadState()/setDataLoadStatus() from the canonical
 * data-store.ts, which uses a window-keyed writable. This contract test locks
 * the invariant in: writes via setDataLoadStatus() MUST round-trip through
 * getDataLoadState() within the same import resolution.
 *
 * If a future regression re-introduces a rune mirror (or any local-only
 * state-cache path), this test will fail because the writable read-after-write
 * state will diverge from a rune-only counterpart.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
    setDataLoadStatus,
    setDataLoadError,
    setBusinessData,
    getDataLoadState,
    getIsDataReady,
    getIsLoading,
    getBusinessRecords,
    resetDataStores,
} from '../../src/lib/data-store'
import type { DataLoadStatus } from '../../src/lib/data-store'

function makeFakeBusinessData() {
    return {
        records: [
            {
                lead_id: 'l-1',
                category: 'Cafe',
            },
        ],
        positionBuffer: new Float32Array([0, 0, 0, 1, 1, 1]),
        clustersBuffer: new Uint16Array([0, 1]),
        pointIndexByLeadId: new Map([['l-1', 0]]),
        semanticNeighborMap: new Map(),
    }
}

describe('Bug D regression: data-store loadState round-trip', () => {
    beforeEach(() => {
        // Reset to a known idle state so each test starts fresh.
        resetDataStores()
    })

    const SEQUENCE: DataLoadStatus[] = ['idle', 'loading', 'ready', 'error']

    it('every status round-trips read-after-write', () => {
        for (const status of SEQUENCE) {
            setDataLoadStatus(status)
            expect(getDataLoadState().status).toBe(status)
            if (status === 'ready') {
                expect(getIsDataReady()).toBe(true)
                expect(getIsLoading()).toBe(false)
            } else if (status === 'loading') {
                expect(getIsLoading()).toBe(true)
                expect(getIsDataReady()).toBe(false)
            } else if (status === 'error') {
                expect(getIsDataReady()).toBe(false)
                expect(getIsLoading()).toBe(false)
            } else {
                // idle
                expect(getIsDataReady()).toBe(false)
                expect(getIsLoading()).toBe(false)
            }
        }
    })

    it('setBusinessData transitions status to ready (if not already past)', () => {
        setDataLoadStatus('loading')
        const before = getDataLoadState().status
        setBusinessData(makeFakeBusinessData() as any)
        const after = getDataLoadState().status
        // Note: setBusinessData internally sets status to 'ready'. If a future
        // regression reverts to a rune-driven status mirror, this assertion
        // would fail because the rune's status never updates.
        expect(after).toBe('ready')
        expect(before).toBe('loading')
    })

    it('getIsDataReady agrees with setDataLoadStatus round-trip', () => {
        // This is the specific gate that FocusPocket relies on. Before Bug D
        // was fixed, this read-after-write gave stale='idle' because the rune
        // shadow was never updated.
        setDataLoadStatus('ready')
        expect(getIsDataReady()).toBe(true)

        setDataLoadStatus('loading')
        expect(getIsDataReady()).toBe(false)

        setDataLoadStatus('error')
        expect(getIsDataReady()).toBe(false)
    })

    it('setDataLoadError propagates to error message', () => {
        setDataLoadStatus('loading')
        setDataLoadError('telemetry-test-failure')
        const state = getDataLoadState()
        expect(state.status).toBe('error')
        expect(state.error).toBe('telemetry-test-failure')
    })

    it('round-trip after resetDataStores returns to idle', () => {
        setDataLoadStatus('ready')
        expect(getDataLoadState().status).toBe('ready')
        resetDataStores()
        // resetDataStores sets status back to 'idle'
        expect(getDataLoadState().status).toBe('idle')
    })

    it('getBusinessRecords returns the writable snapshot (not a frozen initial)', async () => {
        // Critical: getBusinessRecords MUST return value from the canonical
        // writable, not a stale rune or module-local cache. With Bug D active,
        // a rune-mirror pattern could return [] because the rune never
        // updated. After the fix, this snapshot is the live writable value.
        resetDataStores()
        expect(getBusinessRecords()).toEqual([])
        expect(getBusinessRecords().length).toBe(0)
        setBusinessData(makeFakeBusinessData() as any)
        const records = getBusinessRecords()
        expect(records.length).toBe(1)
        expect(records[0].lead_id).toBe('l-1')
    })
})
