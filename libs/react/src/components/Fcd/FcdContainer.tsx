// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { mergeClasses } from '../utils.js'

export type FcdDetailsMode = 'inline' | 'overlay' | 'adaptive'

export interface FcdContainerProps {
	className?: string
	children?: React.ReactNode
	/** Remove the 1200px container cap, letting the layout stretch to the viewport. */
	fluid?: boolean
	/**
	 * Where the details panel sits relative to content.
	 * - `'inline'` (default): details takes a column on lg+, overlays on sm/md; content reflows.
	 * - `'overlay'`: details is an absolute overlay inside the container at every breakpoint.
	 * - `'adaptive'`: overlay up to xl (115em / 1840px), then docks in the viewport's right gutter.
	 */
	detailsMode?: FcdDetailsMode
}

export function FcdContainer({
	className,
	children,
	fluid,
	detailsMode = 'inline'
}: FcdContainerProps) {
	return (
		<main
			className={mergeClasses(
				'c-container w-100 h-100',
				fluid && 'fluid',
				detailsMode === 'overlay' && 'details-overlay',
				detailsMode === 'adaptive' && 'details-adaptive',
				className
			)}
		>
			<div className="row h-100">{children}</div>
		</main>
	)
}

// vim: ts=4
