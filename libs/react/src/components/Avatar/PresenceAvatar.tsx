// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { PresenceEntry } from '@cloudillo/core'
import * as React from 'react'

import type { Size } from '../types.js'
import { mergeClasses } from '../utils.js'
import { Avatar } from './Avatar.js'
import { InitialsAvatar, monogramFor } from './InitialsAvatar.js'

/** The name to show for a roster entry, falling back to the guest label. */
export function displayName(user: PresenceEntry, guestLabel: string): string {
	return user.name || user.idTag || guestLabel
}

export interface PresenceAvatarProps {
	/** One entry of a roster from `useDocPresence`. */
	user: PresenceEntry
	size?: Size
	/** Name to show for a peer with neither a display name nor an idTag. */
	guestLabel: string
	/** Tooltip. Omit when the surrounding group is labelled instead. */
	title?: string
	className?: string
}

/**
 * One collaborator's face.
 *
 * The picture, when there is one, was resolved by `useDocPresence` from the
 * idTag rather than transmitted — and the idTag itself was stamped by the relay
 * from the sender's token, so neither half of a face is peer-asserted. Without a
 * picture we fall back to a monogram on a hue derived from the same identity, so
 * the two representations of a person stay recognisably the same colour.
 *
 * Both branches wear a ring in that identity colour — dashed for a guest, who by
 * definition has no idTag (`buildPresenceUser` omits it unless authenticated, and
 * the relay strips it), so the face carries no verified identity.
 */
export function PresenceAvatar({ user, size, guestLabel, title, className }: PresenceAvatarProps) {
	const name = displayName(user, guestLabel)
	const ringClass = mergeClasses('id-ring', !user.idTag && 'guest', className)

	return user.profilePic ? (
		<Avatar
			// A picture avatar has no identity colour of its own, so hand it the
			// hue the roster already computed as idHue(idTag ?? connId) — that
			// is what colours the ring. The initials branch below needs neither:
			// InitialsAvatar adds `c-id-color` and derives the same hue from the
			// same seed.
			className={mergeClasses('c-id-color', ringClass)}
			style={{ '--id-hue': user.hue } as React.CSSProperties}
			size={size}
			src={user.profilePic}
			alt={name}
			fallback={monogramFor(user.idTag, name)}
			title={title}
		/>
	) : (
		<InitialsAvatar
			className={ringClass}
			size={size}
			name={name}
			idTag={user.idTag}
			seed={user.idTag ?? user.connId}
			title={title}
		/>
	)
}

// vim: ts=4
