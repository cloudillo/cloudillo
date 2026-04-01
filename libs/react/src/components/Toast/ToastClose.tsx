// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { LuX as IcClose } from 'react-icons/lu'
import { mergeClasses, createComponent } from '../utils.js'
import { useToastContext } from './ToastContext.js'

export interface ToastCloseProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
	children?: React.ReactNode
}

export const ToastClose = createComponent<HTMLButtonElement, ToastCloseProps>(
	'ToastClose',
	({ className, onClick, children, ...props }, ref) => {
		const context = useToastContext()

		function handleClick(evt: React.MouseEvent<HTMLButtonElement>) {
			if (context.dismiss) {
				context.dismiss()
			}
			onClick?.(evt)
		}

		return (
			<button
				ref={ref}
				type="button"
				className={mergeClasses('c-toast-close', className)}
				onClick={handleClick}
				aria-label="Close"
				{...props}
			>
				{children || <IcClose size="1em" />}
			</button>
		)
	}
)

// vim: ts=4
