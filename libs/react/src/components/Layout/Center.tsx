// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'

import { createComponent, mergeClasses } from '../utils.js'

export interface CenterProps extends React.HTMLAttributes<HTMLDivElement> {
	/** Fill the viewport height */
	viewport?: boolean
	/** Content keeps its own width (column, centered) instead of the grid cell */
	intrinsic?: boolean
	/** Center the text too */
	text?: boolean
	children?: React.ReactNode
}

export const Center = createComponent<HTMLDivElement, CenterProps>(
	'Center',
	({ className, viewport, intrinsic, text, children, ...props }, ref) => (
		<div
			ref={ref}
			className={mergeClasses(
				'c-center',
				viewport && 'viewport',
				intrinsic && 'intrinsic',
				text && 'text',
				className
			)}
			{...props}
		>
			{children}
		</div>
	)
)

// vim: ts=4
