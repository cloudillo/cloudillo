// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'

import { createComponent, mergeClasses } from '../utils.js'

export interface PropertyPanelProps extends React.HTMLAttributes<HTMLDivElement> {
	width?: number
	children?: React.ReactNode
}

export const PropertyPanel = createComponent<HTMLDivElement, PropertyPanelProps>(
	'PropertyPanel',
	({ className, width = 280, children, style, ...props }, ref) => {
		return (
			<div
				ref={ref}
				className={mergeClasses('c-panel', className)}
				style={{
					width,
					minWidth: width,
					maxWidth: width,
					borderLeft: '1px solid var(--col-outline)',
					overflow: 'hidden',
					...style
				}}
				{...props}
			>
				<div className="c-property-panel">{children}</div>
			</div>
		)
	}
)

// vim: ts=4
