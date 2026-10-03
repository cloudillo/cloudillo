// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Hat role maps: `peer_role:local_role,…` — which local role a partner community's member
 * gets here, by their role there. `""` is an empty map (nothing maps), `null`/absent is no
 * agreement at all; the caller tells the two apart before parsing.
 */

/** Roles a map may grant. Stops below `moderator`: a hat never manages members. */
export const HAT_TARGET_ROLES = ['follower', 'supporter', 'contributor'] as const

/** Roles a partner's member may hold there, i.e. the map's keys, ascending. A follower
 * can't wear a hat, so it is no key. */
export const HAT_PEER_ROLES = ['supporter', 'contributor', 'moderator', 'leader'] as const

/** Every key the server accepts (its full role hierarchy); kept so a save round-trips them. */
const HAT_KEY_ROLES: readonly string[] = ['public', 'follower', ...HAT_PEER_ROLES]

export function parseHatRoles(s: string | null | undefined): Record<string, string> {
	const map: Record<string, string> = {}
	for (const pair of (s ?? '').split(',')) {
		const [peer, local] = pair.split(':').map((x) => x.trim())
		if (peer && local && HAT_KEY_ROLES.includes(peer)) map[peer] = local
	}
	return map
}

export interface EffectiveHatRole {
	peer: string
	/** The local role this peer role gets, if any */
	local?: string
	/** The peer role whose entry supplied `local`; `=== peer` when explicit */
	from?: string
}

/**
 * Per `HAT_PEER_ROLES` entry, the role it actually gets: its own entry, else the closest
 * lower mapped one (the server's `map_hat_role` fall-back), else none.
 */
export function effectiveHatRoles(map: Record<string, string | undefined>): EffectiveHatRole[] {
	let from: string | undefined
	return HAT_PEER_ROLES.map((peer) => {
		if (map[peer]) from = peer
		return from ? { peer, local: map[from], from } : { peer }
	})
}

/** Runs of peer roles `lo`..`hi` that get `local` from the same entry, ascending. */
export function hatRoleRanges(
	map: Record<string, string | undefined>
): { lo: string; hi: string; local: string }[] {
	const ranges: { lo: string; hi: string; local: string; from: string }[] = []
	for (const { peer, local, from } of effectiveHatRoles(map)) {
		if (!local || !from) continue
		const last = ranges[ranges.length - 1]
		if (last?.from === from) last.hi = peer
		else ranges.push({ lo: peer, hi: peer, local, from })
	}
	return ranges.map(({ lo, hi, local }) => ({ lo, hi, local }))
}

/** Inverse of `parseHatRoles`, in role order; unknown keys and "no access" drop out. */
export function formatHatRoles(map: Record<string, string | undefined>): string {
	return HAT_KEY_ROLES.filter((peer) => map[peer])
		.map((peer) => `${peer}:${map[peer]}`)
		.join(',')
}

// vim: ts=4
