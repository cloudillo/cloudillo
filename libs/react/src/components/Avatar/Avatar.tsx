// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

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

		const ringClass =
			ring === true
				? 'ring'
				: ring === 'secondary'
					? 'ring-secondary'
					: ring === 'success'
						? 'ring-success'
						: undefined

		return (
			<div
				ref={ref}
				className={mergeClasses('c-avatar', size, shape, ringClass, className)}
				{...props}
			>
				{src && !imgError ? (
					<img src={src} alt={alt || ''} onError={() => setImgError(true)} />
				) : fallback ? (
					<span className="c-avatar-fallback">{fallback}</span>
				) : null}
				{children}
			</div>
		)
	}
)

// vim: ts=4
