// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'

import { createComponent, mergeClasses } from '../utils.js'
import { useFieldControl } from './Field.js'

export interface TextAreaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
	resize?: boolean
}

export const TextArea = createComponent<HTMLTextAreaElement, TextAreaProps>(
	'TextArea',
	({ className, resize, ...props }, ref) => {
		const field = useFieldControl(props, ref, 'TextArea')
		return (
			<textarea
				{...props}
				{...field.controlProps}
				ref={field.ref}
				className={mergeClasses('c-input', resize && 'resize', className)}
			/>
		)
	}
)

// vim: ts=4
