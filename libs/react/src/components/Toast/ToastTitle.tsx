// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { mergeClasses, createComponent } from '../utils.js'

export interface ToastTitleProps extends React.HTMLAttributes<HTMLHeadingElement> {
	children?: React.ReactNode
}

export const ToastTitle = createComponent<HTMLHeadingElement, ToastTitleProps>(
	'ToastTitle',
	({ className, children, ...props }, ref) => {
		return (
			<h4 ref={ref} className={mergeClasses('c-toast-title', className)} {...props}>
				{children}
			</h4>
		)
	}
)

// vim: ts=4
