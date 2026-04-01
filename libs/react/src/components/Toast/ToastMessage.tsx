// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { mergeClasses, createComponent } from '../utils.js'

export interface ToastMessageProps extends React.HTMLAttributes<HTMLParagraphElement> {
	children?: React.ReactNode
}

export const ToastMessage = createComponent<HTMLParagraphElement, ToastMessageProps>(
	'ToastMessage',
	({ className, children, ...props }, ref) => {
		return (
			<p ref={ref} className={mergeClasses('c-toast-message', className)} {...props}>
				{children}
			</p>
		)
	}
)

// vim: ts=4
