// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'

import { createComponent, mergeClasses } from '../utils.js'
import { type BoxLayoutProps, boxClasses } from './HBox.js'

export interface VBoxProps extends React.HTMLAttributes<HTMLDivElement>, BoxLayoutProps {
	children?: React.ReactNode
}

export const VBox = createComponent<HTMLDivElement, VBoxProps>(
	'VBox',
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
					'c-vbox',
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
