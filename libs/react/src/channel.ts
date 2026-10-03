// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/** Splits `@tenant~name` into its parts; a bare name has no tenant. */
export function parseChannel(channel: string): { tenant?: string; name: string } {
	const sep = channel.indexOf('~')
	if (channel.startsWith('@') && sep > 1) {
		return { tenant: channel.slice(1, sep), name: channel.slice(sep + 1) }
	}
	return { name: channel }
}

/** The absolute channel `@tenant~name`. */
export function makeChannel(tenant: string, name: string): string {
	return `@${tenant}~${name}`
}

/** Makes a bare room name absolute on `tenant`; an absolute channel is kept. */
export function absChannel(channel: string, tenant: string): string {
	return parseChannel(channel).tenant ? channel : makeChannel(tenant, channel)
}

/** The idTag an action lives on: its audience, else its issuer. */
export const actionContextTag = (a: { audience?: { idTag: string }; issuer: { idTag: string } }) =>
	a.audience?.idTag ?? a.issuer.idTag

// vim: ts=4
