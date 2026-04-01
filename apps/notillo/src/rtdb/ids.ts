// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

const ID_CHARS = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'

export function shortId(length = 10): string {
	const arr = crypto.getRandomValues(new Uint8Array(length))
	return Array.from(arr, (b) => ID_CHARS[b % 62]).join('')
}

// vim: ts=4
