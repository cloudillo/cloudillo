// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * "Someone signed in to this node from this browser before" — a UI hint only, never a
 * credential. It lets a guest view of one's own node say "Is this you?" and send `/` to the
 * login screen. Logout deliberately leaves it set (and `wipeLocalData` does not clear it):
 * the hint is most useful exactly after a sign-out.
 */

const KEY = 'cloudillo.signedInIdTag'

export function rememberSignedIn(idTag: string): void {
	try {
		localStorage.setItem(KEY, idTag)
	} catch {
		// localStorage may be unavailable (sandboxed contexts, etc.)
	}
}

export function wasSignedInHere(idTag: string | undefined): boolean {
	if (!idTag) return false
	try {
		return localStorage.getItem(KEY) === idTag
	} catch {
		return false
	}
}

// vim: ts=4
