// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { mergeClasses } from '../utils.js'

export interface FcdContentProps {
	className?: string
	onScroll?: () => void
	header?: React.ReactNode
	children?: React.ReactNode
	/** When true, content expands to fill available space (use when no details panel) */
	fluid?: boolean
}

export const FcdContent = React.forwardRef<HTMLDivElement, FcdContentProps>(
	function FcdContentInside({ className, onScroll, header, children, fluid }, ref) {
		return (
			<div
				className={mergeClasses(
					'c-vbox col h-100',
					fluid ? 'col-md-8 col-lg-9' : 'col-md-8 col-lg-6',
					className
				)}
			>
				{header}
				<div
					ref={ref}
					className={mergeClasses(
						'c-fcd-content-scroll c-vbox fill overflow-y-auto',
						className
					)}
					onScroll={onScroll}
				>
					{children}
				</div>
			</div>
		)
	}
)

FcdContent.displayName = 'FcdContent'

// vim: ts=4
