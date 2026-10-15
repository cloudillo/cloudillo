// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/** The user's own dictionary words: IndexedDB `pagillo-spell`, store `words` (word → 1). */

let db: Promise<IDBDatabase> | undefined

function openDb(): Promise<IDBDatabase> {
	db ??= new Promise<IDBDatabase>((res, rej) => {
		const r = indexedDB.open('pagillo-spell', 1)
		r.onupgradeneeded = () => r.result.createObjectStore('words')
		r.onsuccess = () => res(r.result)
		r.onerror = () => rej(r.error)
	}).catch((err) => {
		db = undefined
		throw err
	})
	return db
}

/** The user's dictionary words (keys of store `words`). */
export async function userWords(): Promise<string[]> {
	const d = await openDb()
	return new Promise((res, rej) => {
		const q = d.transaction('words').objectStore('words').getAllKeys()
		q.onsuccess = () => res(q.result as string[])
		q.onerror = () => rej(q.error)
	})
}

export async function addUserWord(word: string): Promise<void> {
	const d = await openDb()
	return new Promise((res, rej) => {
		const tx = d.transaction('words', 'readwrite')
		tx.objectStore('words').put(1, word)
		tx.oncomplete = () => res()
		tx.onerror = () => rej(tx.error)
	})
}

// vim: ts=4
