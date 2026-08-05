// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Losing the `swKey` cookie is a recoverable event, not a catastrophe.
 *
 * Everything encrypted under that key is a *cache*: the API key (re-minted by signing in
 * again), the file/action cache, and synced CRDT documents. The one irreplaceable thing is a
 * CRDT document with local edits that never reached the server — so that, and only that, is
 * worth blocking the app for.
 *
 * The assessment lives on the page rather than in the ServiceWorker because `document.cookie`
 * is the strictly stronger signal: it works on every browser, whereas the SW's Cookie Store
 * API view is `null` on Firefox and Safari regardless of whether the cookie exists.
 */

import { CRDT_DB, DATA_CACHE_DB, databaseExists, deleteDatabase } from '../../shared/idb.js'
import { generateSwKey } from '../../shared/sw-key.js'
import { readSwKeyCookie, writeSwKeyCookie } from '../pwa/cookie.js'
import { hadEncryptedData } from '../pwa/encrypted-data-flag.js'
import { swNotify, swRequestResult } from '../pwa/sw-rpc.js'
import { type KeyLossState, publishKeyLoss, setKeyLossReported } from './key-signal.js'
import { type DirtyDocSummary, listDirtyDocs } from './wipe-local-data.js'

// The signal lives in the leaf module `key-signal.ts` (see the note there on why); re-exported
// so consumers keep importing from `key-loss.js`.
export { type KeyLossState, keyLossAtom, reportKeyUnavailable } from './key-signal.js'

/**
 * Purge everything encrypted under the lost key and mint a fresh one, so the session can
 * continue (via a re-login) instead of dead-ending.
 *
 * Deliberately destructive: the caches it deletes are unreadable anyway, and leaving them
 * behind would make every later boot look like key loss again.
 */
export async function recoverFromKeyLoss(): Promise<void> {
	// Awaited so the SW is done before the replacement key is minted below. Still best-effort
	// — a dead or uncontrolled worker silently drops the message, which is why the database
	// deletes below are unconditional.
	const ack = await swRequestResult('sw:key.reset')
	if (ack.status === 'error') {
		console.warn('[KeyLoss] sw:key.reset failed in the worker:', ack.error)
	} else if (ack.status !== 'ok') {
		console.warn(`[KeyLoss] sw:key.reset was not acknowledged (${ack.status})`)
	}
	for (const name of [CRDT_DB, DATA_CACHE_DB]) {
		// A blocked delete leaves data encrypted under the key being replaced — recovery is
		// incomplete, and the next boot sees the leftovers as key loss all over again.
		if ((await deleteDatabase(name)) === 'blocked') {
			console.warn(`[KeyLoss] Delete of ${name} was blocked by another open connection`)
		}
	}

	// The page is the only minter on every browser — the worker reads the key and never creates
	// one (see shell/sw/key-cookie.ts). The relay below is what Firefox/Safari need, where the
	// worker has no Cookie Store API; on Chrome/Edge the notify refreshes its dropped cache.
	const key = generateSwKey()
	if (writeSwKeyCookie(key)) {
		await swNotify('sw:key.set', { key })
	} else {
		console.error('[KeyLoss] swKey cookie did not persist — encrypted storage unavailable')
	}
}

/**
 * Was anything ever written under the key? Distinguishes "the key is gone" from "there has
 * never been a key" — the state every first-time visitor is in, and one that must not trigger
 * recovery (minting a cookie for someone who has not signed in is exactly what `setApiKey` is
 * careful not to do).
 */
async function hasEncryptedData(): Promise<boolean> {
	for (const name of [CRDT_DB, DATA_CACHE_DB]) {
		const exists = await databaseExists(name)
		// No `indexedDB.databases()` on this browser — the localStorage flag is the only
		// remaining evidence.
		if (exists === 'unknown') return hadEncryptedData()
		if (exists) return true
	}
	return false
}

/**
 * Is the key gone, and if so is anything irreplaceable riding on it? Returns null when the key
 * is fine *or* when nothing unsynced would be lost.
 *
 * The dirty-doc markers are stored unencrypted (`<docId>:dirty` in `cloudillo-crdt`, see
 * message-bus/handlers/crdt.ts), so enumerating them works precisely when the key is gone.
 */
async function checkKeyLoss(): Promise<KeyLossState | null> {
	if (readSwKeyCookie()) return null

	let dirtyDocs: DirtyDocSummary[] = []
	try {
		dirtyDocs = await listDirtyDocs()
	} catch (err) {
		console.warn('[KeyLoss] Could not list dirty documents:', err)
	}

	return dirtyDocs.length > 0 ? { dirtyDocs } : null
}

async function runKeyLossAssessment(): Promise<KeyLossState | null> {
	if (readSwKeyCookie()) return null
	// No key and nothing encrypted: a first visit, not a loss. Leave it alone — the cookie is
	// minted at sign-in by `setApiKey`.
	if (!(await hasEncryptedData())) return null

	const state = await checkKeyLoss()
	if (state) return state

	console.warn('[KeyLoss] swKey cookie is gone; nothing unsynced — recovering silently')
	await recoverFromKeyLoss()
	return null
}

/**
 * Boot-time assessment. With unsynced work at risk it returns the state and the caller must
 * block; otherwise it repairs the damage silently and returns null, leaving boot to fall
 * through to the login screen.
 */
export async function assessKeyLoss(): Promise<KeyLossState | null> {
	// Boot owns the outcome while this runs: suppress the mid-session reporter so the cache
	// reads below can't schedule a second, redundant assessment.
	setKeyLossReported(true)
	let state: KeyLossState | null = null
	try {
		state = await runKeyLossAssessment()
		return state
	} finally {
		// Release the latch unless boot itself raised the dialog, or the mid-session path stays
		// dead for the whole session and a cookie evicted while the app runs is never
		// reported. Also on a throw: `state` is null there, so nothing raised a dialog.
		setKeyLossReported(state !== null)
	}
}

/**
 * The assessment behind `reportKeyUnavailable` (key-signal.ts), which reaches it through a
 * dynamic import and has already taken the latch.
 */
export async function handleKeyUnavailable(): Promise<void> {
	const state = await checkKeyLoss()
	if (state) {
		publishKeyLoss(state)
		return
	}
	// Nothing at risk right now. Re-arm rather than latch: a document that goes dirty later
	// still deserves the warning. Cheap to repeat — the call sites only fire while there is no
	// key at all, which is when their caches are disabled.
	setKeyLossReported(false)
}

// vim: ts=4
