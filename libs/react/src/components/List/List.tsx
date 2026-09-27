// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'

import { createComponent, mergeClasses, polyRef } from '../utils.js'

export type ListVariant = 'plain' | 'divided' | 'bordered'
export type ListSelectable = 'single' | 'multiple'
export type ListMarker = 'bullet' | 'number'

export interface ListProps extends React.HTMLAttributes<HTMLElement> {
	/** Row separation (default plain) */
	variant?: ListVariant
	/** Scrolls vertically inside its flex parent instead of growing */
	scroll?: boolean
	/** Renders a listbox: rows become options, `ListItem selected` → `aria-selected` */
	selectable?: ListSelectable
	/** Prose bullets or numbered steps (`number` renders an `<ol>`) */
	marker?: ListMarker
}

export const ListContext = React.createContext<{ selectable?: ListSelectable }>({})

export const List = createComponent<HTMLElement, ListProps>(
	'List',
	({ className, variant, scroll, selectable, marker, ...props }, ref) => {
		const Tag = marker === 'number' ? 'ol' : 'ul'
		const ctx = React.useMemo(() => ({ selectable }), [selectable])

		return (
			<ListContext.Provider value={ctx}>
				<Tag
					ref={polyRef(ref)}
					className={mergeClasses(
						'c-list',
						variant && variant !== 'plain' && variant,
						scroll && 'scroll',
						marker && `marker-${marker}`,
						className
					)}
					role={selectable ? 'listbox' : undefined}
					aria-multiselectable={selectable === 'multiple' || undefined}
					{...props}
				/>
			</ListContext.Provider>
		)
	}
)

// vim: ts=4
