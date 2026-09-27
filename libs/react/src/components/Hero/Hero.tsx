// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'

import { createComponent, mergeClasses } from '../utils.js'

export interface HeroProps extends React.HTMLAttributes<HTMLDivElement> {
	/** Cover image (full width); the band keeps a minimum height without one */
	cover?: React.ReactNode
	/** Avatar overlapping the cover's bottom edge */
	avatar: React.ReactNode
	/** Overlaid on the cover's top-end corner (e.g. a change-cover button) */
	coverAction?: React.ReactNode
	/** Overlaid on the avatar's bottom-end corner */
	avatarAction?: React.ReactNode
}

/** Cover band with an avatar overlapping its bottom edge (profile headers). */
export const Hero = createComponent<HTMLDivElement, HeroProps>(
	'Hero',
	({ className, cover, avatar, coverAction, avatarAction, ...props }, ref) => (
		<div ref={ref} className={mergeClasses('c-hero', className)} {...props}>
			<div className="c-hero-cover">
				{cover}
				{coverAction != null && <div className="c-hero-cover-action">{coverAction}</div>}
			</div>
			<div className="c-hero-avatar">
				{avatar}
				{avatarAction != null && <div className="c-hero-avatar-action">{avatarAction}</div>}
			</div>
		</div>
	)
)

// vim: ts=4
