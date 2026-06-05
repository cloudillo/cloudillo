// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { Profile } from '@cloudillo/types'

/** Primary action/state shown on the relationship chip. */
export type RelPrimary =
	| 'blocked' // status==='B' (overrides everything)
	| 'pending' // connected==='R'
	| 'connected' // person, connected===true
	| 'member' // community, connected===true
	| 'following' // following && !connected
	| 'follow-back' // person: follower && !following && !connected
	| 'connect' // person, no relationship
	| 'join' // community, no relationship & not following

export interface RelationshipView {
	primary: RelPrimary
	/** They follow me (persons only meaningful). */
	followsYou: boolean
	/** Two-way follow. */
	mutual: boolean
	/** I follow them. */
	following: boolean
	/** Social/membership link active. */
	connected: boolean
}

export function describeRelationship(
	p: Pick<Profile, 'type' | 'status' | 'connected' | 'following' | 'follower'>
): RelationshipView {
	const isCommunity = p.type === 'community'
	const following = !!p.following
	const followsYou = !!p.follower
	const connected = p.connected === true
	const pending = p.connected === 'R'
	const mutual = following && followsYou

	let primary: RelPrimary
	if (p.status === 'B') primary = 'blocked'
	else if (pending) primary = 'pending'
	else if (connected) primary = isCommunity ? 'member' : 'connected'
	else if (following) primary = 'following'
	else if (!isCommunity && followsYou) primary = 'follow-back'
	else primary = isCommunity ? 'join' : 'connect'

	return { primary, followsYou, mutual, following, connected }
}
