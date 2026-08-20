// idb-service.ts
// Canonical home for the dependency-free IndexedDB wrapper.
//
// Ported from (W15 Wave D).
// Zero logic changes — only import paths adapted for src/lib/utils/ location.
//
// Resilience: every transaction races a 5-second timeout.  If the
// transaction hangs (browser quirk, storage pressure, corruption), the
// timeout fires, aborts the transaction, and resets `dbPromise` so the
// next call re-opens the database instead of permanently blocking.

import { debugWarn } from '@lib/utils/debug'
import { DisposableRegistry } from '@lib/utils/disposable-registry'

const DB_NAME = 'SemanticExplorerDB'
const STORE_NAME = 'SearchCache'
const DB_VERSION = 1

/** Maximum time (ms) to wait for a transaction before aborting. */
const TX_TIMEOUT_MS = 5_000

let dbPromise: Promise<IDBDatabase> | null = null

// ── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Reset the cached promise so the next operation re-opens the DB.
 * Called after a timeout to prevent a permanent "corruption lock".
 */
function resetDB(): void {
    dbPromise = null
}

/**
 * Wrap a transaction in a timeout race.  If the transaction doesn't
 * complete within `TX_TIMEOUT_MS`, abort it and reset `dbPromise`.
 *
 * @param db   The open IDBDatabase handle.
 * @param mode 'readonly' | 'readwrite'.
 * @param fn   Callback that receives the transaction + store and sets up
 *             request handlers.  The callback must NOT resolve/reject the
 *             outer promise — that's handled by the transaction events.
 * @returns    A promise that resolves/rejects when the transaction
 *             completes or the timeout fires.
 */
function withTxTimeout<T>(
    db: IDBDatabase,
    mode: IDBTransactionMode,
    fn: (tx: IDBTransaction, store: IDBObjectStore) => void
): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        let settled = false
        const reg = new DisposableRegistry({ label: 'idb-service-tx' })
        const timer = reg.schedule(TX_TIMEOUT_MS, () => {
            if (settled) return
            settled = true
            debugWarn('[idb-service] Transaction timed out after ' + TX_TIMEOUT_MS + 'ms — aborting')
            try {
                tx.abort()
            } catch (abortErr) {
                debugWarn('[idb-service] tx.abort() failed during timeout cleanup:', abortErr)
            }
            resetDB()
            reject(new Error('IndexedDB transaction timed out'))
        })

        const tx = db.transaction(STORE_NAME, mode)
        const store = tx.objectStore(STORE_NAME)

        fn(tx, store)

        tx.oncomplete = () => {
            if (settled) return
            settled = true
            clearTimeout(timer)
            reg.disposeAll()
            // Resolve with void-ish for mutations; callers that need
            // a result must resolve from their own request handler.
            resolve(undefined as T)
        }

        tx.onerror = () => {
            if (settled) return
            settled = true
            clearTimeout(timer)
            reg.disposeAll()
            debugWarn('[idb-service] Transaction error:', tx.error)
            resetDB()
            reject(tx.error ?? new Error('IndexedDB transaction failed'))
        }

        tx.onabort = () => {
            if (settled) return
            settled = true
            clearTimeout(timer)
            reg.disposeAll()
            debugWarn('[idb-service] Transaction aborted')
            resetDB()
            reject(new Error('IndexedDB transaction aborted'))
        }
    })
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Initialize the IndexedDB connection and create object stores.
 * Includes a timeout around the open() request to detect hung opens.
 */
export function initDB(): Promise<IDBDatabase> {
    if (!dbPromise) {
        dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
            if (typeof window === 'undefined' || !window.indexedDB) {
                reject(new Error('IndexedDB not available'))
                return
            }

            let settled = false
            const reg = new DisposableRegistry({ label: 'idb-service-open' })

            // Safety timeout for the open request itself (which can hang on
            // version upgrade conflicts in some browsers).
            const timer = reg.schedule(TX_TIMEOUT_MS, () => {
                if (settled) return
                settled = true
                debugWarn('[idb-service] Database open timed out after ' + TX_TIMEOUT_MS + 'ms')
                dbPromise = null
                reject(new Error('IndexedDB open timed out'))
            })

            const request = window.indexedDB.open(DB_NAME, DB_VERSION)

            request.onerror = (event) => {
                if (settled) return
                settled = true
                clearTimeout(timer)
                reg.disposeAll()
                debugWarn('[idb-service] Database error:', (event.target as IDBOpenDBRequest).error)
                dbPromise = null
                reject((event.target as IDBOpenDBRequest).error!)
            }

            request.onsuccess = (event) => {
                if (settled) return
                settled = true
                clearTimeout(timer)
                reg.disposeAll()
                resolve((event.target as IDBOpenDBRequest).result)
            }

            request.onupgradeneeded = (event) => {
                const db = (event.target as IDBOpenDBRequest).result
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME)
                }
            }
        })
    }
    return dbPromise
}

/**
 * Retrieves a value by key.
 * Transaction is protected by a 5-second timeout.
 */
export async function get(key: string): Promise<unknown> {
    const db = await initDB()
    let result: unknown
    await withTxTimeout(db, 'readonly', (_tx, store) => {
        const req = store.get(key)
        req.onsuccess = () => {
            result = req.result
        }
    })
    return result
}

/**
 * Stores a value by key.
 * Transaction is protected by a 5-second timeout.
 */
export async function set(key: string, value: unknown): Promise<void> {
    const db = await initDB()
    await withTxTimeout<void>(db, 'readwrite', (_tx, store) => {
        store.put(value, key)
    })
}

/**
 * Removes a value by key.
 * Transaction is protected by a 5-second timeout.
 */
export async function remove(key: string): Promise<void> {
    const db = await initDB()
    await withTxTimeout<void>(db, 'readwrite', (_tx, store) => {
        store.delete(key)
    })
}

/**
 * Returns an array of all keys in the store.
 * Transaction is protected by a 5-second timeout.
 */
export async function keys(): Promise<IDBValidKey[]> {
    const db = await initDB()
    let result: IDBValidKey[] = []
    await withTxTimeout(db, 'readonly', (_tx, store) => {
        const req = store.getAllKeys()
        req.onsuccess = () => {
            result = req.result
        }
    })
    return result
}

/**
 * Retrieves all entries in the store (for bulk cache restoration).
 * Transaction is protected by a 5-second timeout.
 */
export async function entries(): Promise<[IDBValidKey, unknown][]> {
    const db = await initDB()
    let result: [IDBValidKey, unknown][] = []
    await withTxTimeout(db, 'readonly', (_tx, store) => {
        const keysReq = store.getAllKeys()
        const valsReq = store.getAll()
        let keys: IDBValidKey[] | null = null
        let values: unknown[] | null = null

        const collectIfReady = () => {
            if (!keys || !values) return
            result = []
            for (let i = 0; i < keys.length; i++) {
                const key = keys[i]
                if (key !== undefined) {
                    result.push([key, values[i]])
                }
            }
        }

        keysReq.onsuccess = () => {
            keys = [...keysReq.result]
            collectIfReady()
        }

        valsReq.onsuccess = () => {
            values = [...valsReq.result]
            collectIfReady()
        }
    })
    return result
}

/**
 * Clears all entries from the store.
 * Transaction is protected by a 5-second timeout.
 */
export async function clear(): Promise<void> {
    const db = await initDB()
    await withTxTimeout<void>(db, 'readwrite', (_tx, store) => {
        store.clear()
    })
}
