// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { createPortal } from 'react-dom'
import { mergeClasses, createComponent } from '../utils.js'
import type { Position } from '../types.js'

export interface ToastContainerProps extends React.HTMLAttributes<HTMLDivElement> {
	position?: Position
	children?: React.ReactNode
}

export const ToastContainer = createComponent<HTMLDivElement, ToastContainerProps>(
	'ToastContainer',
	({ className, position = 'top-right', children, ...props }, ref) => {
		const content = (
			<div
				ref={ref}
				className={mergeClasses('c-toast-container', position, className)}
				role="region"
				aria-live="polite"
				aria-label="Notifications"
				{...props}
			>
				{children}
			</div>
		)

		// Portal to document body
		if (typeof document !== 'undefined') {
			return createPortal(content, document.body)
		}

		return content
	}
)

// vim: ts=4
