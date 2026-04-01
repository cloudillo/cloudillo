// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { mergeClasses, createComponent } from '../utils.js'

export interface TextAreaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
	resize?: boolean
}

export const TextArea = createComponent<HTMLTextAreaElement, TextAreaProps>(
	'TextArea',
	({ className, resize, ...props }, ref) => {
		return (
			<textarea
				ref={ref}
				className={mergeClasses('c-input', resize && 'resize', className)}
				{...props}
			/>
		)
	}
)

// vim: ts=4
