// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import type { ApiClient } from '@cloudillo/core'

/** Mirrors the backend's `peer_allowed` (`federation_policy.rs`): `*.d` matches `x.d`, not `d` */
export function peerAllowed(policy: unknown, idTag: string): boolean {
	if (!policy || typeof policy !== 'object') return true
	const { mode, allow } = policy as { mode?: unknown; allow?: unknown }
	if (mode === 'off') return false
	if (mode !== 'allowlist') return true
	return (Array.isArray(allow) ? allow : []).some((entry) =>
		typeof entry !== 'string'
			? false
			: entry.startsWith('*')
				? idTag.endsWith(entry.slice(1))
				: entry === idTag
	)
}

/**
 * The community offered by the "Join" card: the `onboarding.community` setting, or '' when
 * it is empty, unreadable, or refused by `federation.peers`. `federation.peers` is
 * Global/Admin and may be unreadable for the user; then `onboarding.community` alone decides.
 */
export async function loadOnboardingCommunity(api: ApiClient): Promise<string> {
	let community = ''
	try {
		const res = await api.settings.get('onboarding.community')
		if (typeof res.value === 'string') community = res.value.trim()
	} catch (err) {
		console.warn('Failed to read onboarding.community:', err)
		return ''
	}
	if (!community) return ''
	try {
		const peers = await api.settings.get('federation.peers')
		if (!peerAllowed(peers.value, community)) return ''
	} catch {
		// Not readable by this caller: rely on onboarding.community alone.
	}
	return community
}

// vim: ts=4
