// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'

import { createComponent, mergeClasses } from '../utils.js'
import { useFieldControl } from './Field.js'

export interface NativeSelectProps
	extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
	size?: 'sm' | 'md' | 'lg'
	children?: React.ReactNode
}

export const NativeSelect = createComponent<HTMLSelectElement, NativeSelectProps>(
	'NativeSelect',
	({ className, size, children, ...props }, ref) => {
		const field = useFieldControl(props, ref, 'NativeSelect')
		const sizeClass = (size ?? field.size) !== 'md' && (size ?? field.size)
		return (
			<select
				{...props}
				{...field.controlProps}
				ref={field.ref}
				className={mergeClasses('c-select', sizeClass, className)}
			>
				{children}
			</select>
		)
	}
)

// vim: ts=4
