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
import type { Size, AvatarShape, AvatarRing } from '../types.js'

export interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
	size?: Size
	shape?: AvatarShape
	ring?: AvatarRing
	src?: string
	alt?: string
	fallback?: React.ReactNode
	children?: React.ReactNode
}

export const Avatar = createComponent<HTMLDivElement, AvatarProps>(
	'Avatar',
	({ className, size, shape, ring, src, alt, fallback, children, ...props }, ref) => {
		const [imgError, setImgError] = React.useState(false)

		const ringClass = ring === true ? 'ring'
			: ring === 'secondary' ? 'ring-secondary'
			: ring === 'success' ? 'ring-success'
			: undefined

		return (
			<div
				ref={ref}
				className={mergeClasses(
					'c-avatar',
					size,
					shape,
					ringClass,
					className
				)}
				{...props}
			>
				{src && !imgError ? (
					<img
						src={src}
						alt={alt || ''}
						onError={() => setImgError(true)}
					/>
				) : fallback ? (
					<span className="c-avatar-fallback">{fallback}</span>
				) : null}
				{children}
			</div>
		)
	}
)

// vim: ts=4
