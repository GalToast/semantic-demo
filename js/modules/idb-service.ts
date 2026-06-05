// idb-service.ts
// TypeScript shadow of idb-service.js
// Dependency-free IndexedDB wrapper for persistent key-value storage.

import { debugWarn } from './diagnostic-adapter.js';

const DB_NAME = 'SemanticExplorerDB';
const STORE_NAME = 'SearchCache';
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

/**
 * Initialize the IndexedDB connection and create object stores.
 */
export function initDB(): Promise<IDBDatabase> {
    if (!dbPromise) {
        dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
            if (typeof window === 'undefined' || !window.indexedDB) {
                reject(new Error('IndexedDB not available'));
                return;
            }

            const request = window.indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = (event) => {
                debugWarn('[idb-service] Database error:', (event.target as IDBOpenDBRequest).error);
                reject((event.target as IDBOpenDBRequest).error!);
            };

            request.onsuccess = (event) => {
                resolve((event.target as IDBOpenDBRequest).result);
            };

            request.onupgradeneeded = (event) => {
                const db = (event.target as IDBOpenDBRequest).result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME);
                }
            };
        });
    }
    return dbPromise;
}

/**
 * Retrieves a value by key.
 */
export async function get(key: string): Promise<unknown> {
    const db = await initDB();
    return new Promise<unknown>((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(key);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

/**
 * Stores a value by key.
 */
export async function set(key: string, value: unknown): Promise<void> {
    const db = await initDB();
    return new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.put(value, key);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

/**
 * Removes a value by key.
 */
export async function remove(key: string): Promise<void> {
    const db = await initDB();
    return new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.delete(key);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

/**
 * Returns an array of all keys in the store.
 */
export async function keys(): Promise<IDBValidKey[]> {
    const db = await initDB();
    return new Promise<IDBValidKey[]>((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAllKeys();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

/**
 * Retrieves all entries in the store (for bulk cache restoration).
 */
export async function entries(): Promise<[IDBValidKey, unknown][]> {
    const db = await initDB();
    return new Promise<[IDBValidKey, unknown][]>((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const keysReq = store.getAllKeys();
        const valsReq = store.getAll();

        transaction.oncomplete = () => {
            const result: [IDBValidKey, unknown][] = [];
            const k = keysReq.result;
            const v = valsReq.result;
            for (let i = 0; i < k.length; i++) {
                result.push([k[i], v[i]]);
            }
            resolve(result);
        };
        transaction.onerror = () => reject(transaction.error);
    });
}

/**
 * Clears all entries from the store.
 */
export async function clear(): Promise<void> {
    const db = await initDB();
    return new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.clear();
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}
