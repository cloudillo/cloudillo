// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'

import { createComponent, mergeClasses } from '../utils.js'

export interface HeroProps extends React.HTMLAttributes<HTMLDivElement> {
	/** Cover image (full width, cropped to the band); the band keeps its height without one */
	cover?: React.ReactNode
	/** Identity hue (`idHue()`) for the gradient shown when there is no cover */
	hue?: number
	/** Avatar overlapping the cover's bottom edge (sized for `2xl`) */
	avatar: React.ReactNode
	/** Overlaid on the cover's top-end corner (e.g. a change-cover button) */
	coverAction?: React.ReactNode
	/** Overlaid on the avatar's bottom-end corner */
	avatarAction?: React.ReactNode
	/** Header body: beside the avatar at md+, below it on phones */
	children?: React.ReactNode
}

/** Cover band with an avatar overlapping its bottom edge (profile headers). */
export const Hero = createComponent<HTMLDivElement, HeroProps>(
	'Hero',
	({ className, cover, hue, avatar, coverAction, avatarAction, children, ...props }, ref) => (
		<div ref={ref} className={mergeClasses('c-hero', className)} {...props}>
			<div
				className={mergeClasses(
					'c-hero-cover',
					cover == null && hue != null && 'c-id-color'
				)}
				style={
					cover == null && hue != null
						? ({ '--id-hue': hue } as React.CSSProperties)
						: undefined
				}
			>
				{cover}
				{coverAction != null && <div className="c-hero-cover-action">{coverAction}</div>}
			</div>
			<div className="c-hero-main">
				<div className="c-hero-avatar">
					{avatar}
					{avatarAction != null && (
						<div className="c-hero-avatar-action">{avatarAction}</div>
					)}
				</div>
				{children != null && <div className="c-hero-body">{children}</div>}
			</div>
		</div>
	)
)

// vim: ts=4
