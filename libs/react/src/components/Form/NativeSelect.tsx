// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { mergeClasses, createComponent } from '../utils.js'

export interface NativeSelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
	children?: React.ReactNode
}

export const NativeSelect = createComponent<HTMLSelectElement, NativeSelectProps>(
	'NativeSelect',
	({ className, children, ...props }, ref) => {
		return (
			<select ref={ref} className={mergeClasses('c-select', className)} {...props}>
				{children}
			</select>
		)
	}
)

// vim: ts=4
