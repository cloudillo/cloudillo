// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'

import { createComponent, mergeClasses } from '../utils.js'
import { SegmentedContext } from './Segmented.js'

export interface SegmentedItemProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
	value?: string
	/** Overrides the context comparison, for a group driven from outside. */
	active?: boolean
	children?: React.ReactNode
}

/** Arrow keys wrap, so the group is a ring rather than a line with two dead ends. */
function step(from: number, delta: number, length: number) {
	return (from + delta + length) % length
}

export const SegmentedItem = createComponent<HTMLButtonElement, SegmentedItemProps>(
	'SegmentedItem',
	({ className, value, active: activeProp, onClick, onKeyDown, children, ...props }, ref) => {
		const context = React.useContext(SegmentedContext)
		const isActive = activeProp ?? (value !== undefined && context.value === value)
		// Roving tabindex, except when nothing is selected: a group where every item
		// answers -1 cannot be reached by Tab at all.
		const unselected = activeProp === undefined && context.value === undefined

		function handleClick(evt: React.MouseEvent<HTMLButtonElement>) {
			if (value !== undefined && context.onChange) context.onChange(value)
			if (onClick) onClick(evt)
		}

		// The siblings are read off the DOM rather than out of a registry in the
		// context: a registry would have to track mount order to know what "next"
		// means, and the DOM already does. Only this group's own items are matched,
		// so a nested control cannot be stepped into.
		function handleKeyDown(evt: React.KeyboardEvent<HTMLButtonElement>) {
			const delta =
				evt.key === 'ArrowRight' || evt.key === 'ArrowDown'
					? 1
					: evt.key === 'ArrowLeft' || evt.key === 'ArrowUp'
						? -1
						: 0
			if (delta || evt.key === 'Home' || evt.key === 'End') {
				const group = evt.currentTarget.closest('.c-segmented')
				const items = group
					? Array.from(
							group.querySelectorAll<HTMLButtonElement>(
								':scope > [role="radio"]:not(:disabled)'
							)
						)
					: []
				const from = items.indexOf(evt.currentTarget)
				if (items.length && from >= 0) {
					evt.preventDefault()
					const next = delta
						? items[step(from, delta, items.length)]
						: items[evt.key === 'Home' ? 0 : items.length - 1]
					// Move *and* select, which is the radiogroup model — the click is
					// what carries the selection, so the group needs no second handler.
					next.focus()
					next.click()
				}
			}
			if (onKeyDown) onKeyDown(evt)
		}

		return (
			<button
				ref={ref}
				type="button"
				className={mergeClasses('c-segmented-item', isActive && 'active', className)}
				role="radio"
				aria-checked={isActive}
				// A roving tabindex: the group is one tab stop and the arrows move
				// within it, so Tab never has to walk past every option to leave.
				tabIndex={isActive || unselected ? 0 : -1}
				onClick={handleClick}
				onKeyDown={handleKeyDown}
				{...props}
			>
				{children}
			</button>
		)
	}
)

// vim: ts=4
