// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'

import { mergeClasses } from '../utils.js'

export type FcdDetailsMode = 'overlay'

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
	/**
	 * Full-width bar (e.g. a `DocBar`) rendered flush above the filter/content/details grid.
	 * Below md the filter drawer and the details sheet open under it.
	 */
	bar?: React.ReactNode
	/**
	 * Where the details panel sits relative to content.
	 * - unset (default): details docks beside content at md+ while there is room, and overlays
	 *   once content would drop below its floor width.
	 * - `'overlay'`: details is always an absolute overlay inside the container; it never docks.
	 */
	detailsMode?: FcdDetailsMode
	/** Width of the details panel where it docks or overlays (CSS length, sets `--fcd-details-width`) */
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
	bar,
	detailsMode,
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
					'c-fcd c-container fluid w-100 h-100',
					detailsMode === 'overlay' && 'details-overlay',
					className
				)}
				style={
					detailsWidth
						? ({ '--fcd-details-width': detailsWidth } as React.CSSProperties)
						: undefined
				}
			>
				{bar && <div className="c-fcd-bar">{bar}</div>}
				<div className="row c-fcd-grid fill">{children}</div>
			</main>
		</FcdFilterContext.Provider>
	)
}

// vim: ts=4
