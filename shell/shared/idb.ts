// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * IndexedDB database names and lifecycle helpers. The name constants are the
 * single source of truth for every by-name delete and enumeration across the
 * page and the ServiceWorker. DOM-free: bundled into both.
 */

/** Yjs document persistence + offline update log (see message-bus/handlers/crdt.ts). */
export const CRDT_DB = 'cloudillo-crdt'

/** Encrypted file/action metadata cache (see cache/encrypted-store.ts). */
export const DATA_CACHE_DB = 'cloudillo-data-cache'

/** Sandboxed per-app key/value storage served over the message bus. */
export const APP_STORAGE_DB = 'cloudillo-app-storage'

/**
 * Every database this context has open, by name. Holding the resolved handle
 * alongside the promise lets `closeDb` close synchronously, which is what the
 * logout wipe needs: an open connection defers a `deleteDatabase` (`onblocked`).
 */
const openDbs = new Map<string, { promise: Promise<IDBDatabase>; db?: IDBDatabase }>()

/**
 * Open (and memoise) a database connection. One connection per name for the
 * context's lifetime — the stores call this on every read and write, and a fresh
 * `indexedDB.open` per call leaks handles and would make a future version upgrade
 * fire `blocked`.
 *
 * The memo is dropped on `versionchange`/`close` so the next call reopens instead
 * of handing out a dead handle, and on `blocked` — where another context holds an
 * older version — so the promise rejects rather than hanging every store
 * operation forever.
 *
 * `onUpgrade` receives the database, the previous version (0 on create) and the
 * versionchange transaction — the last because `db.transaction()` throws while an
 * upgrade is running, so a migration that touches existing rows has no other way
 * to reach them.
 */
export function openDb(
	name: string,
	version: number,
	onUpgrade: (db: IDBDatabase, oldVersion: number, tx: IDBTransaction) => void
): Promise<IDBDatabase> {
	const cached = openDbs.get(name)
	if (cached) return cached.promise

	const entry: { promise: Promise<IDBDatabase>; db?: IDBDatabase } = {
		promise: new Promise<IDBDatabase>((resolve, reject) => {
			const request = indexedDB.open(name, version)
			// Only ever forget the entry we own: a later reopen must not be
			// evicted by this one's late teardown.
			const forget = () => {
				if (openDbs.get(name) === entry) openDbs.delete(name)
			}

			request.onupgradeneeded = (event) => {
				// Non-null: `transaction` is always the versionchange transaction
				// inside this handler.
				const tx = request.transaction as IDBTransaction
				onUpgrade(request.result, (event as IDBVersionChangeEvent).oldVersion, tx)
			}
			request.onblocked = () => {
				forget()
				reject(
					new Error(`IndexedDB "${name}" blocked: another context holds an older version`)
				)
			}
			request.onerror = () => {
				forget()
				reject(request.error)
			}
			request.onsuccess = () => {
				const db = request.result
				entry.db = db
				// Step aside for another context's upgrade or `deleteDatabase()` —
				// the logout wipe deletes these while the page is still open.
				db.onversionchange = () => {
					db.close()
					forget()
				}
				// Abnormal termination: don't hand the dead connection out again.
				db.onclose = forget
				resolve(db)
			}
		})
	}
	// Attached now so an open that rejects before anyone awaits it doesn't count
	// as an unhandled rejection; awaiters still see the rejection themselves.
	entry.promise.catch(() => {})
	openDbs.set(name, entry)
	return entry.promise
}

/**
 * The connection this context already has open for `name`, if any — never opens
 * one. The stores that gate `openDb` behind an encryption-key check use this to
 * skip the check once they are open, so a key that goes missing mid-session
 * can't retract a database whose handle callers are already using.
 */
export function openedDb(name: string): Promise<IDBDatabase> | undefined {
	return openDbs.get(name)?.promise
}

/**
 * Close this context's connection to `name` and drop the memo, so a
 * `deleteDatabase(name)` isn't deferred by it. Synchronous: the delete usually
 * follows on the very next line.
 */
export function closeDb(name: string): void {
	const entry = openDbs.get(name)
	if (!entry) return
	openDbs.delete(name)
	entry.db?.close()
}

/**
 * Best-effort deletion; never rejects. The outcome is reported instead —
 * `'blocked'` means another tab's open connection deferred the delete, so the
 * data is still there and a caller that promised a wipe has not delivered one.
 */
export function deleteDatabase(name: string): Promise<'deleted' | 'blocked' | 'error'> {
	return new Promise((resolve) => {
		const req = indexedDB.deleteDatabase(name)
		req.onsuccess = () => resolve('deleted')
		req.onerror = () => resolve('error')
		req.onblocked = () => resolve('blocked')
	})
}

/**
 * Check whether a database exists without opening it (opening would create a
 * phantom empty DB).
 *
 * Returns `'unknown'` on browsers without `indexedDB.databases()`, so callers
 * pick their own fallback rather than inheriting someone else's guess.
 */
export async function databaseExists(name: string): Promise<boolean | 'unknown'> {
	if (typeof indexedDB.databases !== 'function') return 'unknown'
	try {
		const dbs = await indexedDB.databases()
		return dbs.some((d) => d.name === name)
	} catch {
		return 'unknown'
	}
}

// vim: ts=4
