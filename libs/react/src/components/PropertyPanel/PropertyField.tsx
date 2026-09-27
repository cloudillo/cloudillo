// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'

import { Field } from '../Form/Field.js'
import { createComponent, mergeClasses } from '../utils.js'

export interface PropertyFieldProps extends React.HTMLAttributes<HTMLDivElement> {
	label: string
	labelWidth?: number
	children?: React.ReactNode
}

/** @deprecated Use `<Field orientation="horizontal" size="sm">` */
export const PropertyField = createComponent<HTMLDivElement, PropertyFieldProps>(
	'PropertyField',
	({ className, label, labelWidth = 60, style, children, ...props }, ref) => {
		return (
			<Field
				ref={ref}
				label={label}
				orientation="horizontal"
				size="sm"
				className={mergeClasses('c-property-field', className)}
				style={
					{ '--c-field-label-width': `${labelWidth}px`, ...style } as React.CSSProperties
				}
				{...props}
			>
				{/* apps style their controls through `.c-property-field-control` */}
				<div className="c-property-field-control">{children}</div>
			</Field>
		)
	}
)

// vim: ts=4
