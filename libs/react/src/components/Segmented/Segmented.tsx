// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'

import { useMergedRefs } from '../hooks.js'
import { createComponent, mergeClasses } from '../utils.js'

export interface SegmentedContextValue {
	value?: string
	onChange?: (value: string) => void
}

export const SegmentedContext = React.createContext<SegmentedContextValue>({})

export interface SegmentedProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onChange'> {
	value?: string
	onChange?: (value: string) => void
	children?: React.ReactNode
}

/**
 * A segmented button: one of N mutually exclusive values, picked in place.
 *
 * Not [`Tabs`](../Tab/Tabs.tsx), which it resembles. Tabs mean navigation — the
 * choice swaps what the region below *shows*. This is a setting: the choice is
 * the value, so it is a `radiogroup` and its items are `radio`s, which is what
 * makes a screen reader announce "2 of 3" rather than a panel change.
 *
 * Give it an `aria-label`: a radiogroup with no name is announced as a bare
 * group, and unlike a tab bar there is no surrounding heading convention to
 * borrow one from.
 */
export const Segmented = createComponent<HTMLDivElement, SegmentedProps>(
	'Segmented',
	({ className, value, onChange, children, ...props }, ref) => {
		// A fresh object per render would re-render every item on any parent render;
		// the two fields are the whole state, so memoizing on them is exact.
		const context = React.useMemo(() => ({ value, onChange }), [value, onChange])

		const groupRef = React.useRef<HTMLDivElement>(null)
		const mergedRef = useMergedRefs(ref, groupRef)
		/** The item this effect last handed the tab stop to, so it can take it back. */
		const patched = React.useRef<HTMLButtonElement | null>(null)

		// The roving tabindex is per item, and an item cannot see its siblings — so a
		// `value` no item declares (a typo, a stored value, a flag-narrowed list)
		// leaves every item at -1 and Tab cannot enter the group at all. One
		// post-commit DOM read is what a registry would otherwise have to maintain;
		// the arrow-key handler in `SegmentedItem` reads the same way.
		//
		// The retraction below is not optional: React's vdom for a patched item still
		// reads -1, so its diff will never undo the write, and a group that later gains
		// a real selection would keep this fallback as a *second* tab stop.
		//
		// No dependency array: any render can change which item is checked.
		React.useLayoutEffect(() => {
			const group = groupRef.current
			if (!group) return
			if (patched.current) {
				patched.current.tabIndex = -1
				patched.current = null
			}
			// `:scope >` to match `SegmentedItem`'s own arrow-key query, so a nested
			// control cannot be counted here and skipped there.
			const items = Array.from(
				group.querySelectorAll<HTMLButtonElement>(':scope > [role="radio"]:not(:disabled)')
			)
			if (items.length && !items.some((item) => item.tabIndex === 0)) {
				items[0].tabIndex = 0
				patched.current = items[0]
			}
		})

		return (
			<SegmentedContext.Provider value={context}>
				<div
					ref={mergedRef}
					className={mergeClasses('c-segmented', className)}
					role="radiogroup"
					{...props}
				>
					{children}
				</div>
			</SegmentedContext.Provider>
		)
	}
)

// vim: ts=4
