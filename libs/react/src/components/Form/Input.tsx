// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'

import { createComponent, mergeClasses } from '../utils.js'
import { useFieldControl } from './Field.js'

// Input component for single-line text input
export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
	/** Rendered inside the border before the text: an icon, static text like `https://` */
	leading?: React.ReactNode
	/** Rendered inside the border after the text: a unit, a small Button */
	trailing?: React.ReactNode
	size?: 'sm' | 'md' | 'lg'
}

export const Input = createComponent<HTMLInputElement, InputProps>(
	'Input',
	({ className, leading, trailing, size, ...props }, ref) => {
		const field = useFieldControl(props, ref, 'Input')
		const sizeClass = (size ?? field.size) !== 'md' && (size ?? field.size)

		if (leading == null && trailing == null) {
			return (
				<input
					{...props}
					{...field.controlProps}
					ref={field.ref}
					className={mergeClasses('c-input', sizeClass, className)}
				/>
			)
		}

		// With slots the bordered box is a wrapper; width utilities (className) go on it
		return (
			<div className={mergeClasses('c-input', 'slotted', sizeClass, className)}>
				{leading != null && <span className="c-input-slot">{leading}</span>}
				<input {...props} {...field.controlProps} ref={field.ref} />
				{trailing != null && <span className="c-input-slot">{trailing}</span>}
			</div>
		)
	}
)

// vim: ts=4
