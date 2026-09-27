// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'

import type { Spacing } from '../Box/HBox.js'
import { createComponent, mergeClasses } from '../utils.js'

export type AffixPosition =
	| 'top'
	| 'bottom'
	| 'top-start'
	| 'top-end'
	| 'bottom-start'
	| 'bottom-end'

export interface AffixProps extends React.HTMLAttributes<HTMLDivElement> {
	mode?: 'fixed' | 'sticky'
	position: AffixPosition
	/** Distance from the edge, on the spacing scale */
	offset?: Spacing
	children?: React.ReactNode
}

/**
 * The one place for fixed/sticky positioning. The strip itself lets pointer
 * events through; only its children catch them. Fixed mode adds the safe-area
 * and on-screen-keyboard insets.
 */
export const Affix = createComponent<HTMLDivElement, AffixProps>(
	'Affix',
	({ className, mode = 'fixed', position, offset, children, ...props }, ref) => (
		<div
			ref={ref}
			className={mergeClasses(
				'c-affix',
				mode,
				position,
				offset !== undefined && `offset-${offset}`,
				className
			)}
			{...props}
		>
			{children}
		</div>
	)
)

// vim: ts=4
