// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'

import { createComponent, mergeClasses } from '../utils.js'

// Input component for single-line text input
export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

export const Input = createComponent<HTMLInputElement, InputProps>(
	'Input',
	({ className, ...props }, ref) => {
		return <input ref={ref} className={mergeClasses('c-input', className)} {...props} />
	}
)

// vim: ts=4
