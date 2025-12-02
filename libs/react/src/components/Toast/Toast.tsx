// This file is part of the Cloudillo Platform.
// Copyright (C) 2024  Szilárd Hajba
//
// Cloudillo is free software: you can redistribute it and/or modify
// it under the terms of the GNU Lesser General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Lesser General Public License for more details.
//
// You should have received a copy of the GNU Lesser General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

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
