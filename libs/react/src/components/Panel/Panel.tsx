// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { Link } from 'react-router-dom'

import type { Spacing } from '../Box/HBox.js'
import { HBox } from '../Box/HBox.js'
import { VBox } from '../Box/VBox.js'
import type { HeadingLevel } from '../Text/Heading.js'
import { Heading } from '../Text/Heading.js'
import { Text } from '../Text/Text.js'
import type { ColorVariant, Elevation } from '../types.js'
import { createComponent, isCrossOrigin, isInternal, mergeClasses, polyRef } from '../utils.js'

export type SurfaceVariant = 'filled' | 'soft' | 'outline' | 'plain'

/** Props shared by Panel and Card */
export interface SurfaceProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
	color?: ColorVariant
	variant?: SurfaceVariant
	padding?: Spacing
	elevation?: Elevation
	/** `/…` → router Link, absolute → `<a>`; makes the whole surface interactive */
	href?: string
	/** Header title; renders the surface as `<section aria-labelledby>` */
	title?: React.ReactNode
	description?: React.ReactNode
	/** Trailing header slot */
	actions?: React.ReactNode
	headingLevel?: HeadingLevel
	children?: React.ReactNode
}

interface InteractiveProps {
	href?: string
	onClick?: React.MouseEventHandler<HTMLElement>
	className?: string
	children?: React.ReactNode
	ref?: React.Ref<never>
	[key: string]: unknown
}

/** Link or button: `/…` → Link, absolute → `<a>`, no href → `<button>` */
function Interactive({ href, onClick, children, ref, ...props }: InteractiveProps) {
	if (href && isInternal(href)) {
		return (
			<Link ref={ref} to={href} onClick={onClick} {...props}>
				{children}
			</Link>
		)
	}
	if (href) {
		return (
			<a
				ref={ref}
				href={href}
				rel={isCrossOrigin(href) ? 'noopener' : undefined}
				onClick={onClick}
				{...props}
			>
				{children}
			</a>
		)
	}
	return (
		<button ref={ref} type="button" onClick={onClick} {...props}>
			{children}
		</button>
	)
}

/** Shared renderer for Panel and Card */
export function renderSurface(
	base: 'c-panel' | 'c-card',
	defaultLevel: HeadingLevel,
	titleSize: 'lg' | 'base',
	{
		className,
		color,
		variant,
		padding,
		elevation,
		href,
		onClick,
		title,
		description,
		actions,
		headingLevel,
		children,
		...props
	}: SurfaceProps,
	ref: React.ForwardedRef<HTMLDivElement>,
	/** Legacy Card `interactive`: hover styling only, element unchanged */
	hoverable?: boolean
) {
	// biome-ignore lint/correctness/useHookAtTopLevel: only called unconditionally at the top of Panel/Card render
	const titleId = React.useId()
	const interactive = !!href || !!onClick
	const hasHeader = title != null || description != null || actions != null
	const classes = mergeClasses(
		base,
		color,
		variant && variant !== 'filled' && variant,
		elevation,
		padding != null && `p-${padding}`,
		(interactive || hoverable) && 'interactive',
		className
	)

	const header = hasHeader && (
		<HBox align="start" gap={2}>
			<VBox fill gap={0}>
				{title != null && (
					<Heading
						id={titleId}
						level={headingLevel ?? defaultLevel}
						size={titleSize}
						className="m-0"
					>
						{interactive ? (
							// Stretched link: the title's `::after` covers the surface, so
							// `actions` stay separately clickable without nesting.
							<Interactive className="c-surface-link" href={href} onClick={onClick}>
								{title}
							</Interactive>
						) : (
							title
						)}
					</Heading>
				)}
				{description != null && (
					<Text as="p" emphasis="muted" className="m-0">
						{description}
					</Text>
				)}
			</VBox>
			{actions != null && (
				<HBox gap={1} className="surface-actions">
					{actions}
				</HBox>
			)}
		</HBox>
	)

	// Interactive, untitled: the surface itself is the link/button
	if (interactive && title == null) {
		return (
			<Interactive
				ref={polyRef(ref)}
				className={classes}
				href={href}
				onClick={onClick as React.MouseEventHandler<HTMLElement>}
				{...props}
			>
				{header}
				{children}
			</Interactive>
		)
	}

	if (title != null) {
		return (
			<section ref={polyRef(ref)} className={classes} aria-labelledby={titleId} {...props}>
				{header}
				{children}
			</section>
		)
	}

	return (
		<div ref={ref} className={classes} onClick={onClick} {...props}>
			{header}
			{children}
		</div>
	)
}

export interface PanelProps extends SurfaceProps {
	emph?: boolean
}

export const Panel = createComponent<HTMLDivElement, PanelProps>(
	'Panel',
	({ emph, className, ...props }, ref) =>
		renderSurface(
			'c-panel',
			2,
			'lg',
			{ ...props, className: mergeClasses(emph && 'emph', className) },
			ref
		)
)

// vim: ts=4
