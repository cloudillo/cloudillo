// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * The server-side id of this browser's push subscription.
 *
 * Persisted because unsubscribing usually happens in a LATER session than subscribing, and the
 * DELETE endpoint keys on the numeric id the POST returned - not on the browser endpoint URL, so
 * it cannot be re-derived from the PushSubscription object, and there is no GET endpoint to ask
 * the server for it.
 *
 * Keyed per identity: one browser profile can be signed in as different tenants over time, and a
 * stale id from another tenant would name a row that is not ours.
 */

const STORAGE_KEY = 'notify.pushSubscriptionId'

function load(): Record<string, number> {
	try {
		const stored = localStorage.getItem(STORAGE_KEY)
		if (stored) return JSON.parse(stored)
	} catch (e) {
		console.error('[PushSubscriptionId] Failed to load ids:', e)
	}
	return {}
}

function save(ids: Record<string, number>): void {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(ids))
	} catch (e) {
		console.error('[PushSubscriptionId] Failed to save ids:', e)
	}
}

export function savePushSubscriptionId(idTag: string, id: number): void {
	save({ ...load(), [idTag]: id })
}

export function loadPushSubscriptionId(idTag: string): number | undefined {
	return load()[idTag]
}

export function clearPushSubscriptionId(idTag: string): void {
	const ids = load()
	delete ids[idTag]
	save(ids)
}

// vim: ts=4
