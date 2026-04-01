// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { mergeClasses, createComponent } from '../utils.js'

export interface AvatarGroupProps extends React.HTMLAttributes<HTMLDivElement> {
	reverse?: boolean
	max?: number
	children?: React.ReactNode
}

export const AvatarGroup = createComponent<HTMLDivElement, AvatarGroupProps>(
	'AvatarGroup',
	({ className, reverse, max, children, ...props }, ref) => {
		let displayChildren = children

		// If max is set, limit the number of visible avatars
		if (max !== undefined && React.Children.count(children) > max) {
			const childArray = React.Children.toArray(children)
			const visibleChildren = childArray.slice(0, max)
			const remainingCount = childArray.length - max

			displayChildren = (
				<>
					{visibleChildren}
					<div className="c-avatar">
						<span className="c-avatar-fallback">+{remainingCount}</span>
					</div>
				</>
			)
		}

		return (
			<div
				ref={ref}
				className={mergeClasses('c-avatar-group', reverse && 'reverse', className)}
				{...props}
			>
				{displayChildren}
			</div>
		)
	}
)

// vim: ts=4
