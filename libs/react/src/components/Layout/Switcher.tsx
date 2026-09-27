// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'

import type { Spacing } from '../Box/HBox.js'
import { createComponent, mergeClasses } from '../utils.js'

export interface SwitcherProps extends React.HTMLAttributes<HTMLDivElement> {
	/** Container width (CSS length) below which the children stack; default 30rem */
	threshold?: string
	gap?: Spacing
	children?: React.ReactNode
}

export const Switcher = createComponent<HTMLDivElement, SwitcherProps>(
	'Switcher',
	({ className, style, threshold, gap, children, ...props }, ref) => (
		<div
			ref={ref}
			className={mergeClasses('c-switcher', gap !== undefined && `g-${gap}`, className)}
			style={
				threshold
					? ({ '--switcher-threshold': threshold, ...style } as React.CSSProperties)
					: style
			}
			{...props}
		>
			{children}
		</div>
	)
)

// vim: ts=4
