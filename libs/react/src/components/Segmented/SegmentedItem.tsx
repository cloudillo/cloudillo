// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'

import { Icon } from '../Icon/Icon.js'
import { createComponent, mergeClasses } from '../utils.js'
import { SegmentedContext } from './Segmented.js'

type IconComponent = React.ComponentType<React.SVGAttributes<SVGElement>>

interface SegmentedItemBaseProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
	value?: string
	/** Overrides the context comparison, for a group driven from outside. */
	active?: boolean
}

export type SegmentedItemProps = SegmentedItemBaseProps &
	(
		| {
				/** Icon-only item: `label` is required and becomes its accessible name and title */
				icon: IconComponent
				label: string
				children?: never
		  }
		| { icon?: IconComponent; label?: undefined; children: React.ReactNode }
	)

/** Arrow keys wrap, so the group is a ring rather than a line with two dead ends. */
function step(from: number, delta: number, length: number) {
	return (from + delta + length) % length
}

export const SegmentedItem = createComponent<HTMLButtonElement, SegmentedItemProps>(
	'SegmentedItem',
	(
		{
			className,
			value,
			active: activeProp,
			icon,
			label,
			onClick,
			onKeyDown,
			children,
			...props
		},
		ref
	) => {
		const context = React.useContext(SegmentedContext)
		const { multiple } = context
		const isActive =
			activeProp ??
			(value !== undefined &&
				(multiple
					? (context.value as readonly string[] | undefined)?.includes(value) === true
					: context.value === value))
		// Roving tabindex, except when nothing is selected: a group where every item
		// answers -1 cannot be reached by Tab at all. Multi-toggle items are each a tab stop.
		const unselected = multiple || (activeProp === undefined && context.value === undefined)

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
				className={mergeClasses(
					'c-segmented-item',
					isActive && 'active',
					icon && children == null && 'icon',
					className
				)}
				// Multi-toggle: plain buttons, so the arrow-key handler's radio query matches nothing
				{...(multiple
					? { 'aria-pressed': isActive }
					: { role: 'radio', 'aria-checked': isActive })}
				aria-label={label}
				title={label}
				// A roving tabindex: the group is one tab stop and the arrows move
				// within it, so Tab never has to walk past every option to leave.
				tabIndex={isActive || unselected ? 0 : -1}
				onClick={handleClick}
				onKeyDown={handleKeyDown}
				{...props}
			>
				{icon && <Icon as={icon} />}
				{children}
			</button>
		)
	}
)

// vim: ts=4
