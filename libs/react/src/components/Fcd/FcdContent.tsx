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
