// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { Link as RouterLink } from 'react-router-dom'

import type { Size } from '../types.js'
import { isCrossOrigin, isInternal, mergeClasses } from '../utils.js'
import { Image } from './Image.js'

const SIZE_PX: Record<Size, number> = { xs: 32, sm: 48, md: 64, lg: 96, xl: 128 }

interface ActionTargetProps {
	href?: string
	onClick?: (evt: React.MouseEvent<HTMLElement>) => void
	className?: string
	'aria-label'?: string
	children?: React.ReactNode
}

/** Renders `/…` → router Link, other `href` → `<a>`, `onClick` → `<button>`, neither → `<span>` */
export function ActionTarget({ href, onClick, className, children, ...aria }: ActionTargetProps) {
	if (href) {
		return isInternal(href) ? (
			<RouterLink to={href} className={className} onClick={onClick} {...aria}>
				{children}
			</RouterLink>
		) : (
			<a
				href={href}
				rel={isCrossOrigin(href) ? 'noopener' : undefined}
				className={className}
				onClick={onClick}
				{...aria}
			>
				{children}
			</a>
		)
	}
	if (onClick) {
		return (
			<button type="button" className={className} onClick={onClick} {...aria}>
				{children}
			</button>
		)
	}
	return <span className={className}>{children}</span>
}

export interface ThumbnailProps {
	src: string | undefined
	alt: string
	/** Square edge: xs 32 · sm 48 · md 64 (default) · lg 96 · xl 128 px */
	size?: Size
	/** Corner badge (e.g. a play or file-type icon) */
	icon?: React.ReactNode
	href?: string
	onClick?: (evt: React.MouseEvent<HTMLElement>) => void
	className?: string
}

/** Square, cropped Image; a link or button when `href` / `onClick` is set. */
export function Thumbnail({
	src,
	alt,
	size = 'md',
	icon,
	href,
	onClick,
	className
}: ThumbnailProps) {
	const px = SIZE_PX[size]
	return (
		<ActionTarget href={href} onClick={onClick} className={mergeClasses('c-thumb', className)}>
			<Image src={src} alt={alt} aspect={1} fit="cover" width={px} style={{ width: px }} />
			{icon && (
				<span className="c-thumb-icon" aria-hidden="true">
					{icon}
				</span>
			)}
		</ActionTarget>
	)
}

// vim: ts=4
