// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'

import { createComponent, mergeClasses } from '../utils.js'

export type BadgeAnchorPosition = 'top-end' | 'top-start' | 'bottom-end' | 'bottom-start'

export interface BadgeAnchorProps extends React.HTMLAttributes<HTMLSpanElement> {
	/** The overlay, normally a `<Badge>`. Nothing is rendered over the child when unset. */
	badge?: React.ReactNode
	/** Corner, in logical (RTL-aware) terms. Default `top-end`. */
	position?: BadgeAnchorPosition
	children?: React.ReactNode
}

/** Puts a badge on a corner of its child (avatar, icon button, …). */
export const BadgeAnchor = createComponent<HTMLSpanElement, BadgeAnchorProps>(
	'BadgeAnchor',
	({ className, badge, position = 'top-end', children, ...props }, ref) => {
		return (
			<span ref={ref} className={mergeClasses('c-badge-anchor', className)} {...props}>
				{children}
				{badge != null && badge !== false && (
					<span className={mergeClasses('c-badge-anchor-badge', position)}>{badge}</span>
				)}
			</span>
		)
	}
)

// vim: ts=4
