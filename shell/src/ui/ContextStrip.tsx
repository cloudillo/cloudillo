// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * The top bar's context strip: a `role="toolbar"` with one tab stop and arrow keys between
 * its chips (`[data-ctx-chip]`, i.e. `ContextChip`s), and a horizontal, handle-less
 * `SortableList` of the reorderable ones between `leading` and `trailing`.
 *
 * Handle-less, so the keyboard route (WCAG 2.5.7) is the consumer's: ContextBar puts Move
 * left / Move right in each chip's context menu.
 */

import { mergeClasses, SortableList, type SortableListProps } from '@cloudillo/react'
import * as React from 'react'

import './context-strip.css'

export interface ContextStripProps<T>
	extends Pick<SortableListProps<T>, 'items' | 'getKey' | 'getLabel' | 'onReorder' | 'group'> {
	'aria-label': string
	renderChip: (item: T) => React.ReactNode
	/** Fixed chips before the list (the personal tile) */
	leading?: React.ReactNode
	/** Fixed content after the list (the preview chip, the overflow popup) */
	trailing?: React.ReactNode
	className?: string
}

const NAV_KEYS = ['ArrowRight', 'ArrowLeft', 'Home', 'End']

export function ContextStrip<T>({
	'aria-label': ariaLabel,
	renderChip,
	leading,
	trailing,
	className,
	...list
}: ContextStripProps<T>) {
	const ref = React.useRef<HTMLDivElement | null>(null)
	// Roving tabindex: which chip owns the strip's single tab stop, as a DOM-order slot.
	// Without it, tabbing away and back always returns to the first chip.
	const [focusIdx, setFocusIdx] = React.useState(0)

	const chips = () =>
		Array.from(ref.current?.querySelectorAll<HTMLElement>('[data-ctx-chip]') ?? [])

	// Every render: a chip can be unpinned or fall into the overflow while it holds the stop.
	React.useLayoutEffect(() => {
		const items = chips()
		const roving = Math.min(focusIdx, items.length - 1)
		items.forEach((el, i) => {
			el.tabIndex = i === roving ? 0 : -1
		})
	})

	function onKeyDown(evt: React.KeyboardEvent) {
		if (!NAV_KEYS.includes(evt.key)) return
		// Portals (the overflow popup) bubble React events through here; leave them alone.
		if (!ref.current?.contains(evt.target as Node)) return
		const items = chips()
		if (!items.length) return
		const at = items.indexOf(document.activeElement as HTMLElement)
		evt.preventDefault()
		const next =
			evt.key === 'Home'
				? 0
				: evt.key === 'End'
					? items.length - 1
					: evt.key === 'ArrowRight'
						? (at + 1) % items.length
						: (at <= 0 ? items.length : at) - 1
		setFocusIdx(next)
		items[next]?.focus()
	}

	function onFocus(evt: React.FocusEvent) {
		const at = chips().indexOf(evt.target as HTMLElement)
		if (at >= 0) setFocusIdx(at)
	}

	// `role="toolbar"` is not itself focusable — focus lands on a chip, arrows move it.
	return (
		<div
			ref={ref}
			className={mergeClasses('c-ctx-bar g-1', className)}
			role="toolbar"
			data-tour="context"
			aria-label={ariaLabel}
			onKeyDown={onKeyDown}
			onFocus={onFocus}
		>
			{leading}
			<SortableList
				{...list}
				orientation="horizontal"
				handle={false}
				className="g-1"
				renderItem={(item) => renderChip(item)}
			/>
			{trailing}
		</div>
	)
}

// vim: ts=4
