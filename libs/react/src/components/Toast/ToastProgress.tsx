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
