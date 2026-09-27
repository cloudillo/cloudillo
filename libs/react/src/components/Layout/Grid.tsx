// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'

import type { Spacing } from '../Box/HBox.js'
import { createComponent, mergeClasses } from '../utils.js'

export interface GridProps extends React.HTMLAttributes<HTMLDivElement> {
	/** Minimum column width (CSS length); columns fit the container, not the viewport */
	min?: string
	gap?: Spacing
	children?: React.ReactNode
}

export const Grid = createComponent<HTMLDivElement, GridProps>(
	'Grid',
	({ className, style, min, gap, children, ...props }, ref) => (
		<div
			ref={ref}
			className={mergeClasses(
				'c-grid',
				'auto-fit',
				gap !== undefined && `g-${gap}`,
				className
			)}
			style={min ? ({ '--grid-min': min, ...style } as React.CSSProperties) : style}
			{...props}
		>
			{children}
		</div>
	)
)

// vim: ts=4
