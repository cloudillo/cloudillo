// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'

import type { ColorVariant, Elevation } from '../types.js'
import { createComponent, mergeClasses } from '../utils.js'

/** Spacing scale step: maps to the OpalUI `g-*` / `p-*` utilities */
export type Spacing = 0 | 1 | 2 | 3 | 4 | 5
export type BoxAlign = 'start' | 'center' | 'end' | 'stretch' | 'baseline'
export type BoxJustify = 'start' | 'center' | 'end' | 'between'

export interface BoxLayoutProps {
	gap?: Spacing
	padding?: Spacing
	align?: BoxAlign
	justify?: BoxJustify
	wrap?: boolean
	/** flex: 1 with a zero min size, so the box can shrink inside its parent box */
	fill?: boolean
	/** overflow: auto on the main axis */
	scroll?: boolean
	reverse?: boolean
	/** Paint a glass surface only when no ancestor surface does; true = 'low' */
	autoBg?: boolean | Elevation | ColorVariant
}

export function boxClasses({
	gap,
	padding,
	align,
	justify,
	wrap,
	fill,
	scroll,
	reverse,
	autoBg
}: BoxLayoutProps) {
	return mergeClasses(
		gap !== undefined && `g-${gap}`,
		padding !== undefined && `p-${padding}`,
		align && `align-items-${align}`,
		justify && `justify-content-${justify}`,
		wrap && 'flex-wrap',
		fill && 'fill',
		scroll && 'scroll',
		reverse && 'reverse',
		autoBg && 'auto-bg',
		typeof autoBg === 'string' && `auto-bg-${autoBg}`
	)
}

export interface HBoxProps extends React.HTMLAttributes<HTMLDivElement>, BoxLayoutProps {
	children?: React.ReactNode
}

export const HBox = createComponent<HTMLDivElement, HBoxProps>(
	'HBox',
	(
		{
			className,
			gap,
			padding,
			align,
			justify,
			wrap,
			fill,
			scroll,
			reverse,
			autoBg,
			children,
			...props
		},
		ref
	) => {
		return (
			<div
				ref={ref}
				className={mergeClasses(
					'c-hbox',
					boxClasses({
						gap,
						padding,
						align,
						justify,
						wrap,
						fill,
						scroll,
						reverse,
						autoBg
					}),
					className
				)}
				{...props}
			>
				{children}
			</div>
		)
	}
)

// vim: ts=4
