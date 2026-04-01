// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { mergeClasses, createComponent } from '../utils.js'
import { ToastContext } from './ToastContext.js'
import type { ToastVariant } from '../types.js'
import type { ToastData } from './useToast.js'

export interface ToastProps extends React.HTMLAttributes<HTMLDivElement> {
	variant?: ToastVariant
	dismissing?: boolean
	withProgress?: boolean
	duration?: number
	onDismiss?: () => void
	toast?: ToastData
	children?: React.ReactNode
}

export const Toast = createComponent<HTMLDivElement, ToastProps>(
	'Toast',
	(
		{
			className,
			variant,
			dismissing,
			withProgress,
			duration,
			onDismiss,
			toast,
			children,
			...props
		},
		ref
	) => {
		const contextValue = React.useMemo(
			() => ({
				toast,
				dismiss: onDismiss
			}),
			[toast, onDismiss]
		)

		return (
			<ToastContext.Provider value={contextValue}>
				<div
					ref={ref}
					className={mergeClasses(
						'c-toast',
						variant ?? toast?.variant,
						dismissing && 'dismissing',
						withProgress && 'with-progress',
						className
					)}
					role="alert"
					{...props}
				>
					{children}
				</div>
			</ToastContext.Provider>
		)
	}
)

// vim: ts=4
