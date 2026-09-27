// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { LuMenu as IcMenu } from 'react-icons/lu'

import { Button } from '../Button/Button.js'
import { mergeClasses } from '../utils.js'
import { FcdFilterContext } from './FcdContainer.js'

export interface FcdContentProps {
	className?: string
	onScroll?: () => void
	header?: React.ReactNode
	children?: React.ReactNode
	/** When true, content expands to fill available space (use when no details panel) */
	fluid?: boolean
	/**
	 * `'scroll'` (default): children scroll, with extra bottom padding for mobile browser chrome.
	 * `'column'`: a plain flex column for children that handle their own scrolling.
	 */
	layout?: 'scroll' | 'column'
}

export const FcdContent = React.forwardRef<HTMLDivElement, FcdContentProps>(
	function FcdContentInside({ className, onScroll, header, children, fluid, layout }, ref) {
		const ctx = React.useContext(FcdFilterContext)

		return (
			<div
				className={mergeClasses(
					'c-fcd-content c-vbox col h-100',
					fluid ? 'col-md-8 col-lg-9' : 'col-md-8 col-lg-6',
					className
				)}
			>
				{ctx && (
					<div className="c-fcd-filter-toggle md-hide lg-hide">
						<Button
							variant="ghost"
							aria-expanded={ctx.filterOpen}
							aria-controls={ctx.filterId}
							onClick={() => ctx.setFilterOpen(!ctx.filterOpen)}
						>
							<IcMenu aria-hidden="true" />
							{ctx.filterLabel}
						</Button>
					</div>
				)}
				{header}
				<div
					ref={ref}
					className={mergeClasses(
						'c-fcd-content-scroll c-vbox fill overflow-y-auto',
						layout === 'column' && 'column',
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
