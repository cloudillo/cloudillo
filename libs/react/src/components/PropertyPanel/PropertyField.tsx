// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { mergeClasses, createComponent } from '../utils.js'

export interface PropertyFieldProps extends React.HTMLAttributes<HTMLDivElement> {
	label: string
	labelWidth?: number
	children?: React.ReactNode
}

export const PropertyField = createComponent<HTMLDivElement, PropertyFieldProps>(
	'PropertyField',
	({ className, label, labelWidth = 60, children, ...props }, ref) => {
		return (
			<div
				ref={ref}
				className={mergeClasses('c-property-field c-hbox g-1', className)}
				{...props}
			>
				<span
					className="c-property-field-label"
					style={{ width: labelWidth, minWidth: labelWidth }}
				>
					{label}
				</span>
				<div className="c-property-field-control flex-fill">{children}</div>
			</div>
		)
	}
)

// vim: ts=4
