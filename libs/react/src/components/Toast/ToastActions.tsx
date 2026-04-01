// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { mergeClasses, createComponent } from '../utils.js'

export interface ToastActionsProps extends React.HTMLAttributes<HTMLDivElement> {
	children?: React.ReactNode
}

export const ToastActions = createComponent<HTMLDivElement, ToastActionsProps>(
	'ToastActions',
	({ className, children, ...props }, ref) => {
		return (
			<div ref={ref} className={mergeClasses('c-toast-actions', className)} {...props}>
				{children}
			</div>
		)
	}
)

// vim: ts=4
