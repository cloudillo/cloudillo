// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'

import { createComponent, mergeClasses } from '../utils.js'

export interface FieldsetProps extends React.FieldsetHTMLAttributes<HTMLFieldSetElement> {
	legend?: React.ReactNode
	/** `inset`: a nested, indented group instead of a bordered box */
	variant?: 'inset'
	children?: React.ReactNode
}

export const Fieldset = createComponent<HTMLFieldSetElement, FieldsetProps>(
	'Fieldset',
	({ className, legend, variant, children, ...props }, ref) => {
		return (
			<fieldset
				ref={ref}
				className={mergeClasses('c-fieldset', variant, className)}
				{...props}
			>
				{legend && <legend>{legend}</legend>}
				{children}
			</fieldset>
		)
	}
)

// vim: ts=4
