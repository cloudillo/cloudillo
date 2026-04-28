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
				<svg viewBox="0 0 48 48" fill="none" className="c-loading-spinner-svg">
					<circle className="c-loading-spinner-halo" cx="24" cy="30" r="11" />
					<line
						className="c-loading-spinner-link c-loading-spinner-link-1"
						x1="24"
						y1="30"
						x2="19"
						y2="8"
					/>
					<line
						className="c-loading-spinner-link c-loading-spinner-link-2"
						x1="24"
						y1="30"
						x2="33"
						y2="11"
					/>
					<line
						className="c-loading-spinner-link c-loading-spinner-link-3"
						x1="24"
						y1="30"
						x2="39"
						y2="22"
					/>
					<line
						className="c-loading-spinner-link c-loading-spinner-link-4"
						x1="24"
						y1="30"
						x2="10"
						y2="18"
					/>
					<circle className="c-loading-spinner-hub" cx="24" cy="30" r="6" />
					<circle
						className="c-loading-spinner-node c-loading-spinner-node-1"
						cx="19"
						cy="8"
						r="3.5"
					/>
					<circle
						className="c-loading-spinner-node c-loading-spinner-node-2"
						cx="33"
						cy="11"
						r="3"
					/>
					<circle
						className="c-loading-spinner-node c-loading-spinner-node-3"
						cx="39"
						cy="22"
						r="3"
					/>
					<circle
						className="c-loading-spinner-node c-loading-spinner-node-4"
						cx="10"
						cy="18"
						r="3.5"
					/>
				</svg>
				{label && <span className="c-loading-spinner-label">{label}</span>}
			</div>
		)
	}
)

// vim: ts=4
