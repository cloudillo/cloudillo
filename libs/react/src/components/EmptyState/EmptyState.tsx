// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'

import type { HeadingLevel } from '../Text/Heading.js'
import type { ColorVariant } from '../types.js'
import { createComponent, mergeClasses } from '../utils.js'

export type EmptyStateSize = 'sm' | 'md' | 'lg'

export interface EmptyStateProps
	extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title' | 'color'> {
	/** Tone of the icon and title (e.g. `error` for a failed load, `warning` for denied) */
	color?: ColorVariant
	icon?: React.ReactNode
	title?: React.ReactNode
	description?: React.ReactNode
	actions?: React.ReactNode
	/** @deprecated use `actions` */
	action?: React.ReactNode
	size?: EmptyStateSize
	/** Grow to fill and centre in the parent area */
	fill?: boolean
	/** Light-on-dark colours for use over media / dark overlays */
	inverse?: boolean
	headingLevel?: HeadingLevel
}

export const EmptyState = createComponent<HTMLDivElement, EmptyStateProps>(
	'EmptyState',
	(
		{
			className,
			color,
			icon,
			title,
			description,
			actions,
			action,
			size = 'md',
			fill,
			inverse,
			headingLevel = 3,
			children,
			...props
		},
		ref
	) => {
		const H = `h${headingLevel}` as const
		const acts = actions ?? action

		return (
			<div
				ref={ref}
				className={mergeClasses(
					'c-empty-state',
					`c-empty-state--${size}`,
					color,
					fill && 'fill',
					inverse && 'inverse',
					className
				)}
				{...props}
			>
				{icon && (
					<div className="c-empty-state-icon" aria-hidden="true">
						{icon}
					</div>
				)}
				{title && <H className="c-empty-state-title">{title}</H>}
				{description && <p className="c-empty-state-description">{description}</p>}
				{acts && <div className="c-empty-state-action">{acts}</div>}
				{children}
			</div>
		)
	}
)

// vim: ts=4
