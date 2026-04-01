// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { mergeClasses, createComponent } from '../utils.js'

export interface FieldsetProps extends React.FieldsetHTMLAttributes<HTMLFieldSetElement> {
	legend?: React.ReactNode
	children?: React.ReactNode
}

export const Fieldset = createComponent<HTMLFieldSetElement, FieldsetProps>(
	'Fieldset',
	({ className, legend, children, ...props }, ref) => {
		return (
			<fieldset ref={ref} className={mergeClasses('c-fieldset', className)} {...props}>
				{legend && <legend>{legend}</legend>}
				{children}
			</fieldset>
		)
	}
)

// vim: ts=4
