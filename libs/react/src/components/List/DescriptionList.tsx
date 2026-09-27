// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'

import { createComponent, mergeClasses } from '../utils.js'

export interface DescriptionListItem {
	term: React.ReactNode
	description: React.ReactNode
	/** Needed when `term` is not a string */
	key?: string
}

export interface DescriptionListProps extends React.HTMLAttributes<HTMLDListElement> {
	/** Term/description pairs, rendered as a two-column `<dl>` */
	items: DescriptionListItem[]
}

export const DescriptionList = createComponent<HTMLDListElement, DescriptionListProps>(
	'DescriptionList',
	({ className, items, ...props }, ref) => (
		<dl ref={ref} className={mergeClasses('c-dl', className)} {...props}>
			{items.map((item, i) => (
				<React.Fragment key={item.key ?? (typeof item.term === 'string' ? item.term : i)}>
					<dt>{item.term}</dt>
					<dd>{item.description}</dd>
				</React.Fragment>
			))}
		</dl>
	)
)

// vim: ts=4
