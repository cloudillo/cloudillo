// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

export type CloudilloUri =
	| { type: 'id'; idTag: string }
	| { type: 'qr-login'; loginCode: string }
	| { type: 'unknown'; raw: string }

export function parseCloudilloUri(uri: string): CloudilloUri | null {
	if (!uri.startsWith('cloudillo:')) return null

	const rest = uri.slice('cloudillo:'.length)
	const colonIdx = rest.indexOf(':')
	if (colonIdx === -1) return { type: 'unknown', raw: uri }

	const uriType = rest.slice(0, colonIdx)
	const payload = rest.slice(colonIdx + 1)

	if (uriType === 'id' && payload) {
		return { type: 'id', idTag: payload }
	}

	if (uriType === 'qr-login' && payload) {
		return { type: 'qr-login', loginCode: payload }
	}

	return { type: 'unknown', raw: uri }
}

export function buildCloudilloUri(type: string, payload: string): string {
	return `cloudillo:${type}:${payload}`
}

// vim: ts=4
