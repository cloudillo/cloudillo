// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'

import type { ColorVariant, Elevation } from '../types.js'
import { createComponent, mergeClasses } from '../utils.js'

export interface PanelProps extends React.HTMLAttributes<HTMLDivElement> {
	variant?: ColorVariant
	elevation?: Elevation
	emph?: boolean
	children?: React.ReactNode
}

export const Panel = createComponent<HTMLDivElement, PanelProps>(
	'Panel',
	({ className, variant, elevation, emph, children, ...props }, ref) => {
		return (
			<div
				ref={ref}
				className={mergeClasses('c-panel', variant, elevation, emph && 'emph', className)}
				{...props}
			>
				{children}
			</div>
		)
	}
)

// vim: ts=4
