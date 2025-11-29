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
				className={mergeClasses(
					'c-loading-spinner',
					size,
					variant,
					className
				)}
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
