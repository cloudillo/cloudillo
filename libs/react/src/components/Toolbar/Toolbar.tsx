// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'

import type { Spacing } from '../Box/HBox.js'
import { createComponent, mergeClasses } from '../utils.js'

export interface ToolbarProps extends React.HTMLAttributes<HTMLDivElement> {
	compact?: boolean
	/** Inner padding on the spacing scale; overrides the default and `compact`. */
	padding?: Spacing
	/** `soft`: tinted secondary container instead of the neutral one. */
	variant?: 'default' | 'soft'
	/** Elevated, rounded look for a toolbar placed over content (wrap it in `Affix`). */
	floating?: boolean
	/** Fade out while the page scrolls down, back on scroll up. Never hides while focused. */
	autoHide?: boolean
	children?: React.ReactNode
}

/** Tracks scroll direction on any scroll container; true while scrolling down. */
function useScrollingDown(enabled: boolean) {
	const [down, setDown] = React.useState(false)

	React.useEffect(() => {
		if (!enabled) return
		// one last-position for all scroll containers; switching container resets it.
		let lastTarget: EventTarget | null = null
		let lastY = 0
		function onScroll(evt: Event) {
			const el = evt.target instanceof Element ? evt.target : document.scrollingElement
			if (!el) return
			const y = el.scrollTop
			if (evt.target !== lastTarget) {
				lastTarget = evt.target
				lastY = y
				return
			}
			// Small threshold so trackpad jitter doesn't flicker it.
			if (Math.abs(y - lastY) < 8) return
			setDown(y > lastY)
			lastY = y
		}
		window.addEventListener('scroll', onScroll, { capture: true, passive: true })
		return () => window.removeEventListener('scroll', onScroll, { capture: true })
	}, [enabled])

	return enabled && down
}

export const Toolbar = createComponent<HTMLDivElement, ToolbarProps>(
	'Toolbar',
	({ className, compact, padding, variant, floating, autoHide, children, ...props }, ref) => {
		// The "never while focused" half lives in CSS (`:focus-within`), so a keyboard
		// user tabbing in brings it back even mid-scroll.
		const hidden = useScrollingDown(!!autoHide)

		return (
			<div
				ref={ref}
				className={mergeClasses(
					'c-toolbar',
					compact && 'compact',
					padding !== undefined && `padding-${padding}`,
					variant === 'soft' && 'soft',
					floating && 'floating',
					autoHide && 'auto-hide',
					hidden && 'scrolled-away',
					className
				)}
				{...props}
			>
				{children}
			</div>
		)
	}
)

export interface ToolbarDividerProps extends React.HTMLAttributes<HTMLDivElement> {}

export const ToolbarDivider = createComponent<HTMLDivElement, ToolbarDividerProps>(
	'ToolbarDivider',
	({ className, ...props }, ref) => (
		<div ref={ref} className={mergeClasses('c-toolbar-divider', className)} {...props} />
	)
)

export type { SpacerProps as ToolbarSpacerProps } from '../Box/Spacer.js'
export { Spacer as ToolbarSpacer } from '../Box/Spacer.js'

export interface ToolbarGroupProps extends React.HTMLAttributes<HTMLDivElement> {
	children?: React.ReactNode
}

export const ToolbarGroup = createComponent<HTMLDivElement, ToolbarGroupProps>(
	'ToolbarGroup',
	({ className, children, ...props }, ref) => (
		<div ref={ref} className={mergeClasses('c-toolbar-group', className)} {...props}>
			{children}
		</div>
	)
)

// vim: ts=4
