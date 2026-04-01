// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { mergeClasses, createComponent } from '../utils.js'
import { useToastContext } from './ToastContext.js'

export interface ToastProgressProps extends React.HTMLAttributes<HTMLDivElement> {
	duration?: number
}

export const ToastProgress = createComponent<HTMLDivElement, ToastProgressProps>(
	'ToastProgress',
	({ className, duration: durationProp, style, ...props }, ref) => {
		const context = useToastContext()
		const duration = durationProp ?? context.toast?.duration ?? 5000

		const progressStyle = {
			...style,
			'--toast-duration': `${duration}ms`
		} as React.CSSProperties

		return (
			<div
				ref={ref}
				className={mergeClasses('c-toast-progress', className)}
				style={progressStyle}
				{...props}
			/>
		)
	}
)

// vim: ts=4
