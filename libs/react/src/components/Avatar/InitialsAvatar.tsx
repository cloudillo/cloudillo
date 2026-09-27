// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { idHue } from '@cloudillo/core'
import * as React from 'react'

import type { AvatarRing, AvatarShape, AvatarSize } from '../types.js'
import { mergeClasses } from '../utils.js'
import { Avatar, initialsFor } from './Avatar.js'

// Re-exported for existing importers of this module; the source lives in Avatar.tsx
export { initialsFor }

export interface InitialsAvatarProps extends React.HTMLAttributes<HTMLDivElement> {
	/** Display name the initials are derived from. */
	name?: string
	/**
	 * Identity tag. When given it drives both the monogram (first two characters
	 * of the tag) and, by default, the colour seed.
	 */
	idTag?: string
	/**
	 * Colour seed; defaults to `idTag` then `name`. Pass the idTag when known, so
	 * the colour is stable across sessions and identical in every app.
	 */
	seed?: string
	size?: AvatarSize
	shape?: AvatarShape
	ring?: AvatarRing
}

/**
 * The first two characters of the user part of an idTag, capitalised as a word:
 * `@szilu.cloudillo.net` -> `Sz`, `@a.example` -> `A`. Stopping at the first dot
 * is what keeps a one-letter user from reading as `A.`.
 *
 * Falls back to {@link initialsFor} when there is no idTag — a guest has none.
 */
export function monogramFor(idTag?: string, name?: string): string {
	// Both '@szilu.cloudillo.net' and the bare form occur in this codebase
	const tag = (idTag ?? '').trim().replace(/^@/, '')
	const user = tag.split('.')[0]
	if (!user) return initialsFor(name)
	// `[...user]` rather than slice: see initialsFor
	const [first, second] = [...user]
	// Guard the uppercase to one grapheme — 'ß'.toLocaleUpperCase() is 'SS'
	const head = [...(first ?? '').toLocaleUpperCase()][0] ?? ''
	return head + (second ?? '').toLocaleLowerCase()
}

/**
 * An avatar for someone with no picture: their initials on a colour derived
 * from their identity.
 *
 * Only the hue is pinned in JS (`--id-hue`); the fill and text colours come from
 * the `.c-id-color` rules in components.css, which have a `body.dark` variant.
 * So a theme switch recolours it with no re-render and can never leave a stale
 * colour behind.
 *
 * @deprecated Use `<ProfilePicture profile size />` for a person, or `<Avatar alt>` whose
 * default fallback is the initials. Kept for app consumers.
 */
export function InitialsAvatar({
	className,
	name,
	idTag,
	seed,
	size,
	shape,
	ring,
	style,
	...props
}: InitialsAvatarProps) {
	const hue = idHue(seed ?? idTag ?? name ?? '')

	return (
		<Avatar
			className={mergeClasses('c-id-color', className)}
			size={size}
			shape={shape}
			ring={ring}
			alt={name}
			fallback={idTag ? monogramFor(idTag, name) : initialsFor(name)}
			style={{ ...style, '--id-hue': hue } as React.CSSProperties}
			{...props}
		/>
	)
}

// vim: ts=4
