// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'

import { mergeClasses } from '../utils.js'

export type FcdDetailsMode = 'inline' | 'overlay' | 'adaptive'

/** Built-in mobile filter toggle state, provided when `filterLabel` is set */
export interface FcdFilterContextValue {
	filterLabel: string
	filterId: string
	filterOpen: boolean
	setFilterOpen: (open: boolean) => void
}

export const FcdFilterContext = React.createContext<FcdFilterContextValue | undefined>(undefined)

export interface FcdContainerProps {
	className?: string
	children?: React.ReactNode
	/** Remove the container width cap, letting the layout stretch to the viewport. */
	fluid?: boolean
	/**
	 * Where the details panel sits relative to content.
	 * - `'inline'` (default): details takes a column at lg (72rem+), overlays below; content reflows.
	 * - `'overlay'`: details is an absolute overlay inside the container at every breakpoint.
	 * - `'adaptive'`: overlay up to xl (96rem), then docks in the viewport's right gutter.
	 */
	detailsMode?: FcdDetailsMode
	/** Width of the details panel where it overlays or docks (CSS length, sets `--fcd-details-width`) */
	detailsWidth?: string
	/**
	 * Renders a mobile (<md) toggle row at the top of `Fcd.Content` that opens the filter;
	 * `Fcd.Filter` then manages its own visibility (no `isVisible`/`hide` needed).
	 */
	filterLabel?: string
}

export function FcdContainer({
	className,
	children,
	fluid,
	detailsMode = 'inline',
	detailsWidth,
	filterLabel
}: FcdContainerProps) {
	const filterId = React.useId()
	const [filterOpen, setFilterOpen] = React.useState(false)
	const ctx = React.useMemo(
		() => (filterLabel ? { filterLabel, filterId, filterOpen, setFilterOpen } : undefined),
		[filterLabel, filterId, filterOpen]
	)

	return (
		<FcdFilterContext.Provider value={ctx}>
			<main
				className={mergeClasses(
					'c-fcd c-container w-100 h-100',
					fluid && 'fluid',
					detailsMode === 'overlay' && 'details-overlay',
					detailsMode === 'adaptive' && 'details-adaptive',
					className
				)}
				style={
					detailsWidth
						? ({ '--fcd-details-width': detailsWidth } as React.CSSProperties)
						: undefined
				}
			>
				<div className="row h-100">{children}</div>
			</main>
		</FcdFilterContext.Provider>
	)
}

// vim: ts=4
