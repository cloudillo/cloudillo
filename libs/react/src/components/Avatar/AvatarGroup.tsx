// This file is part of the Cloudillo Platform.
// Copyright (C) 2024  Szilárd Hajba
//
// Cloudillo is free software: you can redistribute it and/or modify
// it under the terms of the GNU Lesser General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Lesser General Public License for more details.
//
// You should have received a copy of the GNU Lesser General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

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
				className={mergeClasses(
					'c-avatar-group',
					reverse && 'reverse',
					className
				)}
				{...props}
			>
				{displayChildren}
			</div>
		)
	}
)

// vim: ts=4
