// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'

import { IcMenu } from '../../icons.js'
import { Button } from '../Button/Button.js'
import { mergeClasses } from '../utils.js'
import { FcdFilterContext } from './FcdContainer.js'

export interface FcdContentProps {
	className?: string
	onScroll?: () => void
	header?: React.ReactNode
	children?: React.ReactNode
	/**
	 * `'scroll'` (default): children scroll, with extra bottom padding for mobile browser chrome.
	 * `'column'`: a plain flex column for children that handle their own scrolling.
	 */
	layout?: 'scroll' | 'column'
	/**
	 * md+: caps the content grid track (`--fcd-content-max`), centred in the slack beside it:
	 * `'reading'` 42rem (streams), `'form'` 48rem (settings, the default), `'wide'` 64rem
	 * (lists, tables), `'fluid'` uncapped (takes all space the filter/details leave).
	 */
	width?: 'reading' | 'form' | 'wide' | 'fluid'
	/**
	 * md+: `'raised'` paints the column as one L1 surface (nested panels fall to inset);
	 * `'none'` (default) paints nothing, so children sit on the Fcd plate.
	 */
	surface?: 'raised' | 'none'
}

export const FcdContent = React.forwardRef<HTMLDivElement, FcdContentProps>(
	function FcdContentInside(
		{ className, onScroll, header, children, layout, width = 'form', surface },
		ref
	) {
		const ctx = React.useContext(FcdFilterContext)

		return (
			<div
				className={mergeClasses(
					'c-fcd-content h-100',
					`width-${width}`,
					surface === 'raised' && 'surface-raised',
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
						'c-fcd-content-scroll fill overflow-y-auto',
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
