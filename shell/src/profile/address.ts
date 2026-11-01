// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * Address entry for People / Communities: turns a typed idTag or a pasted profile / share
 * link into an idTag. Everything here is untrusted user input, so every idTag and host is
 * validated before it reaches a route path or a fetch URL.
 */

import { isIdTag } from '@cloudillo/core'

export type ProfileAddress = { kind: 'idTag'; idTag: string } | { kind: 'host'; host: string }

/** `isIdTag` accepts uppercase, so every input is lowercased first (URL hostnames already are). */
function asIdTag(s: string | undefined): string | undefined {
	const idTag = s?.toLowerCase()
	return idTag && isIdTag(idTag) ? idTag : undefined
}

/**
 * The idTag a shell route path names: `/<ctx>/profile/<idTag>[/…]` (not `me`), else the
 * community of a `/@<idTag>[|hat]/…` context. `undefined` when the path names none.
 */
function idTagFromPath(path: string): string | undefined {
	let segs: string[]
	try {
		segs = path.split('/').map(decodeURIComponent)
	} catch {
		return undefined
	}
	const [, ctx, section, target] = segs
	if (section === 'profile' && target && target !== 'me') {
		const idTag = asIdTag(target)
		if (idTag) return idTag
	}
	// A hatted context (`@comm.tld|hat`) still names the community.
	if (ctx?.startsWith('@')) return asIdTag(ctx.slice(1).split('|')[0])
	return undefined
}

export function parseProfileAddress(input: string): ProfileAddress | null {
	const s = input.trim()
	if (!s) return null

	if (s.startsWith('cloudillo:id:')) {
		const idTag = asIdTag(s.slice('cloudillo:id:'.length))
		return idTag ? { kind: 'idTag', idTag } : null
	}

	// `cl:/<path>` carries no host, so a path that names no idTag has nothing to fall back to.
	if (s.startsWith('cl:/')) {
		const idTag = idTagFromPath(s.slice(3))
		return idTag ? { kind: 'idTag', idTag } : null
	}

	if (/^https?:\/\//i.test(s)) {
		let u: URL
		try {
			u = new URL(s)
		} catch {
			return null
		}
		const idTag = idTagFromPath(u.pathname)
		if (idTag) return { kind: 'idTag', idTag }
		// The app domain may differ from the idTag: the host is only ever probed, never used.
		return isIdTag(u.hostname) ? { kind: 'host', host: u.hostname } : null
	}

	// Any other scheme (`javascript:`, `ftp:`, `cl:<app>/…`) is not an address.
	if (/^[a-z][a-z0-9+.-]*:/i.test(s)) return null

	const idTag = asIdTag(s.startsWith('@') ? s.slice(1) : s)
	return idTag ? { kind: 'idTag', idTag } : null
}

/** Resolve an address to an idTag; a bare host is asked for its idTag. `null` on any failure. */
export async function resolveProfileAddress(
	input: string,
	fetchFn: typeof fetch = fetch
): Promise<string | null> {
	const addr = parseProfileAddress(input)
	if (!addr) return null
	if (addr.kind === 'idTag') return addr.idTag
	try {
		const res = await fetchFn(`https://${addr.host}/.well-known/cloudillo/id-tag`)
		if (!res.ok) return null
		const body: unknown = await res.json()
		const idTag =
			body && typeof body === 'object' && 'idTag' in body && typeof body.idTag === 'string'
				? body.idTag
				: undefined
		return asIdTag(idTag) ?? null
	} catch {
		return null
	}
}

// vim: ts=4
