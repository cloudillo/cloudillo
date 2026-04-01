// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { mergeClasses, createComponent } from '../utils.js'
import type { ColorVariant, Size } from '../types.js'

export interface LoadingSpinnerProps extends React.HTMLAttributes<HTMLDivElement> {
	size?: Size
	variant?: ColorVariant
	label?: string
}

export const LoadingSpinner = createComponent<HTMLDivElement, LoadingSpinnerProps>(
	'LoadingSpinner',
	({ className, size = 'md', variant, label, ...props }, ref) => {
		return (
			<div
				ref={ref}
				className={mergeClasses('c-loading-spinner', size, variant, className)}
				role="status"
				aria-label={label || 'Loading'}
				{...props}
			>
				<svg viewBox="0 0 24 24" fill="none" className="c-loading-spinner-svg">
					<circle
						className="c-loading-spinner-track"
						cx="12"
						cy="12"
						r="10"
						strokeWidth="3"
					/>
					<circle
						className="c-loading-spinner-indicator"
						cx="12"
						cy="12"
						r="10"
						strokeWidth="3"
						strokeDasharray="31.4 31.4"
						strokeLinecap="round"
					/>
				</svg>
				{label && <span className="c-loading-spinner-label">{label}</span>}
			</div>
		)
	}
)

// vim: ts=4
