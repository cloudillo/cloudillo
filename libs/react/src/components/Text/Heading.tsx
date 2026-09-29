// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'

import { createComponent, mergeClasses, polyRef } from '../utils.js'
import type { TextSize } from './Text.js'

export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6

export interface HeadingProps extends React.HTMLAttributes<HTMLHeadingElement> {
	/** Document outline level (semantics) */
	level: HeadingLevel
	/** Visual size; defaults from `level` (`xs` with `overline`) */
	size?: TextSize
	/** Small uppercase label style */
	overline?: boolean
}

const LEVEL_SIZE: Record<HeadingLevel, TextSize> = {
	1: '3xl',
	2: '2xl',
	3: 'xl',
	4: 'lg',
	5: 'base',
	6: 'sm'
}

export const Heading = createComponent<HTMLHeadingElement, HeadingProps>(
	'Heading',
	({ level, size, overline, className, ...props }, ref) => {
		const Tag = `h${level}` as const
		return (
			<Tag
				ref={polyRef(ref)}
				className={mergeClasses(
					`text-${size ?? (overline ? 'xs' : LEVEL_SIZE[level])}`,
					overline && 'overline',
					className
				)}
				{...props}
			/>
		)
	}
)

// vim: ts=4
