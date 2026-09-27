// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'

import type { AvatarRing, AvatarShape, AvatarSize } from '../types.js'
import { createComponent, mergeClasses } from '../utils.js'

export interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
	size?: AvatarSize
	shape?: AvatarShape
	ring?: AvatarRing
	src?: string
	/** Accessible name of the image; also the source of the default initials fallback. */
	alt?: string
	/** Shown when there is no (loadable) `src`. Defaults to `initialsFor(alt)` when `alt` is set; `null` opts out. */
	fallback?: React.ReactNode
	children?: React.ReactNode
}

/**
 * Two characters from a display name, or a neutral glyph when there is nothing
 * to work with.
 *
 * The two cases are capitalised differently on purpose, because they are
 * different things: several words give initials (`Ada Lovelace` -> `AL`, both
 * upper), a single word is read as a word the way `monogramFor` reads an
 * idTag (`Guest` -> `Gu`, first upper, second lower) — one letter alone would
 * leave every share-link guest with a bare `G`.
 */
export function initialsFor(name?: string): string {
	const words = (name ?? '').trim().split(/\s+/).filter(Boolean)
	if (!words.length) return '?'
	// `[...word]` rather than charAt: an emoji or an astral-plane letter is one
	// grapheme but two UTF-16 units, and half of one renders as a replacement box.
	if (words.length === 1) {
		const [first, second] = [...words[0]]
		// Guard the uppercase to one grapheme — 'ß'.toLocaleUpperCase() is 'SS'
		const head = [...(first ?? '').toLocaleUpperCase()][0] ?? ''
		return head + (second ?? '').toLocaleLowerCase()
	}
	const letters = words.slice(0, 2).map((w) => [...w][0] ?? '')
	return letters.join('').toLocaleUpperCase()
}

export const Avatar = createComponent<HTMLDivElement, AvatarProps>(
	'Avatar',
	({ className, size, shape, ring, src, alt, fallback, children, ...props }, ref) => {
		const [imgError, setImgError] = React.useState(false)

		const ringClass =
			ring === true
				? 'ring'
				: ring === 'secondary'
					? 'ring-secondary'
					: ring === 'success'
						? 'ring-success'
						: undefined

		// Only default when there is a name to derive from: an Avatar holding an icon
		// child must not grow a '?' on top of it.
		const fallbackContent = fallback === undefined && alt ? initialsFor(alt) : fallback

		return (
			<div
				ref={ref}
				className={mergeClasses('c-avatar', size, shape, ringClass, className)}
				{...props}
			>
				{src && !imgError ? (
					<img src={src} alt={alt || ''} onError={() => setImgError(true)} />
				) : fallbackContent ? (
					<span className="c-avatar-fallback">{fallbackContent}</span>
				) : null}
				{children}
			</div>
		)
	}
)

// vim: ts=4
