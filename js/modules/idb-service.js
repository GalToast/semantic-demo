/**
 * idb-service.js
 *
 * Dependency-free wrapper for IndexedDB to provide persistent key-value storage.
 * Used for caching semantic search payloads across sessions.
 */

import { debugWarn } from './diagnostic-adapter.js';

const DB_NAME = 'SemanticExplorerDB';
const STORE_NAME = 'SearchCache';
const DB_VERSION = 1;

let dbPromise = null;

/**
 * Initialize the IndexedDB connection and create object stores.
 */
export function initDB() {
    if (!dbPromise) {
        dbPromise = new Promise((resolve, reject) => {
            if (typeof window === 'undefined' || !window.indexedDB) {
                reject(new Error('IndexedDB not available'));
                return;
            }

            const request = window.indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = (event) => {
                debugWarn('[idb-service] Database error:', event.target.error);
                dbPromise = null;
                reject(event.target.error);
            };

            request.onsuccess = (event) => {
                resolve(event.target.result);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
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
export async function get(key) {
    const db = await initDB();
    return new Promise((resolve, reject) => {
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
export async function set(key, value) {
    const db = await initDB();
    return new Promise((resolve, reject) => {
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
export async function remove(key) {
    const db = await initDB();
    return new Promise((resolve, reject) => {
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
export async function keys() {
    const db = await initDB();
    return new Promise((resolve, reject) => {
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
export async function entries() {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const keysReq = store.getAllKeys();
        const valsReq = store.getAll();

        transaction.oncomplete = () => {
            const result = [];
            const keys = keysReq.result;
            const vals = valsReq.result;
            for (let i = 0; i < keys.length; i++) {
                result.push([keys[i], vals[i]]);
            }
            resolve(result);
        };
        transaction.onerror = () => reject(transaction.error);
    });
}

/**
 * Clears all entries from the store.
 */
export async function clear() {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.clear();
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}
