// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * A flyout of icon buttons opened from a toolbar trigger.
 *
 * Generic over ITEMS rather than over ToolType, so one component serves the desktop shape group,
 * the desktop layer-order group and the mobile all-tools popup. The trigger button is rendered by
 * the caller, so this is positioning and chrome only.
 *
 * Deliberately not `Dropdown`/`Popper` from @cloudillo/react: both keep the open state internal,
 * so two triggers cannot be made mutually exclusive, and `Popper` has no placement prop, so it
 * cannot open upward from a bottom-docked bar. Not `ActionSheet` either - that is a modal with a
 * body-scroll lock and one item per row, which is the wrong shape for a tool grid.
 */

import { useEscapeKey } from '@cloudillo/react'
import * as React from 'react'
import type { IconType } from 'react-icons'

import { useEdgeClamp } from '../hooks/useEdgeClamp.js'

export interface ToolPopoverItem {
	key: string
	Icon: IconType
	label: string
	shortcut?: string
	active?: boolean
	disabled?: boolean
	onSelect: () => void
}

export interface ToolPopoverSection {
	key: string
	/** Row caption. Omitted for a single-category desktop popup. */
	heading?: string
	items: ToolPopoverItem[]
}

/**
 * Index of the next selectable item `delta` steps from `from`, wrapping, skipping disabled ones.
 *
 * Returns `from` unchanged when nothing else is selectable, so a menu with one enabled item does not
 * spin. `from = -1` with `delta = 1` yields the FIRST selectable item, and `from = 0` with
 * `delta = -1` the LAST - which is how Home and End are expressed.
 *
 * Exported for its own unit test: driving the component's keyboard handling would need a renderer.
 */
export function nextEnabledIndex(
	items: readonly { disabled?: boolean }[],
	from: number,
	delta: number
): number {
	const n = items.length
	if (!n) return -1
	let i = from
	for (let step = 0; step < n; step++) {
		i = (i + delta + n) % n
		if (!items[i].disabled) return i
	}
	// Nothing else selectable: stay put if the caller already is somewhere valid, else say so
	return from >= 0 && from < n && !items[from].disabled ? from : -1
}

export interface ToolPopoverProps {
	open: boolean
	onClose: () => void
	sections: ToolPopoverSection[]
	/** 'rows' = one flex row per section (mobile); 'wrap' = one wrapped row (desktop) */
	layout?: 'rows' | 'wrap'
	iconSize?: number
	/**
	 * The trigger, so an outside click can spare it: closing on the trigger's `pointerdown` and
	 * then re-opening on its `click` would make the popover impossible to dismiss by its own button.
	 */
	anchorRef?: React.RefObject<HTMLElement | null>
	'aria-label': string
}

export function ToolPopover({
	open,
	onClose,
	sections,
	layout = 'wrap',
	iconSize = 22,
	anchorRef,
	'aria-label': ariaLabel
}: ToolPopoverProps) {
	// No flip: this opens upward from a bottom-docked toolbar, so the other side is off screen
	const { ref, shift, maxHeight } = useEdgeClamp({ side: 'above', flip: false, gap: 8 })

	useEscapeKey(onClose, open)

	// Not `useOutsideClick`: it watches a single ref, and the trigger has to be spared too.
	React.useEffect(() => {
		if (!open) return
		const handleOutside = (evt: PointerEvent) => {
			const target = evt.target as Node | null
			if (!target) return
			if (ref.current?.contains(target)) return
			if (anchorRef?.current?.contains(target)) return
			// The dismissing click is SWALLOWED. Without this the same pointerdown reaches
			// SvgCanvas, and closing the shape flyout by clicking the canvas also placed a shape.
			evt.stopPropagation()
			evt.preventDefault()
			onClose()
		}
		// Capture phase, and it has to be: React 19 attaches its listeners at the root container,
		// which is a DESCENDANT of `document`, so a bubble-phase listener here runs after React has
		// already dispatched the event and can no longer retract it.
		document.addEventListener('pointerdown', handleOutside, true)
		return () => document.removeEventListener('pointerdown', handleOutside, true)
	}, [open, onClose, ref, anchorRef])

	/*
	 * Roving tabindex over the items flattened across sections: exactly one item is tabbable at a
	 * time and the arrows move which. That is the `menu` contract this claims with role=menu, and
	 * without it the arrows did nothing at all.
	 */
	const flatItems = React.useMemo(() => sections.flatMap((s) => s.items), [sections])
	const itemRefs = React.useRef<(HTMLButtonElement | null)[]>([])
	const [focusIndex, setFocusIndex] = React.useState(() => nextEnabledIndex(flatItems, -1, 1))

	// Re-seat the roving index if the item set changes under it (a tool becoming disabled)
	React.useEffect(() => {
		setFocusIndex((prev) =>
			prev >= 0 && prev < flatItems.length && !flatItems[prev].disabled
				? prev
				: nextEnabledIndex(flatItems, -1, 1)
		)
	}, [flatItems])

	// Focus the roving item on open and hand focus back to the trigger on close, so the popover is
	// operable and escapable from the keyboard alone.
	React.useEffect(() => {
		if (!open) return
		const trigger = anchorRef?.current ?? null
		itemRefs.current[focusIndex]?.focus()
		return () => {
			if (trigger?.isConnected) trigger.focus()
		}
		// focusIndex deliberately absent: this is the OPEN transition. Arrow keys move focus
		// themselves in moveFocus below; re-running here would fight them on every keystroke.
	}, [open, anchorRef])

	const moveFocus = React.useCallback((next: number) => {
		if (next < 0) return
		setFocusIndex(next)
		itemRefs.current[next]?.focus()
	}, [])

	const handleKeyDown = React.useCallback(
		(evt: React.KeyboardEvent<HTMLDivElement>) => {
			switch (evt.key) {
				case 'ArrowRight':
				case 'ArrowDown':
					evt.preventDefault()
					moveFocus(nextEnabledIndex(flatItems, focusIndex, 1))
					break
				case 'ArrowLeft':
				case 'ArrowUp':
					evt.preventDefault()
					moveFocus(nextEnabledIndex(flatItems, focusIndex, -1))
					break
				case 'Home':
					evt.preventDefault()
					moveFocus(nextEnabledIndex(flatItems, -1, 1))
					break
				case 'End':
					evt.preventDefault()
					moveFocus(nextEnabledIndex(flatItems, 0, -1))
					break
				case 'Tab':
					// Tab CLOSES rather than being trapped: a menu is a transient overlay, and the
					// unmount effect above already hands focus back to the trigger, so Tab then
					// continues from the trigger exactly where the user expects. A trap would leave
					// the only exit as Escape, which is worse for a keyboard user who wants out.
					onClose()
					break
			}
		},
		[flatItems, focusIndex, moveFocus, onClose]
	)

	if (!open) return null

	// Running offset, so an item's index in `flatItems` is the one its ref and tabIndex use
	let flatIndex = -1

	return (
		<div
			ref={ref}
			className={`ideallo-tool-popover${layout === 'rows' ? ' rows' : ''}`}
			style={
				{
					'--popover-shift': `${shift}px`,
					maxHeight: maxHeight ?? undefined,
					overflowY: maxHeight != null ? 'auto' : undefined
				} as React.CSSProperties
			}
			role="menu"
			aria-label={ariaLabel}
			onKeyDown={handleKeyDown}
		>
			{/*
				`role=none` on the layout wrappers is not decoration: a `menu` must OWN its
				menuitems, and a generic div in between breaks that ownership - so an AT stops
				enumerating the items and some will not enter menu navigation at all. It is
				unconditional, because the desktop shape flyout has no heading and its wrappers were
				the ones left generic.
			*/}
			{sections.map((section) => (
				<div key={section.key} className="ideallo-tool-popover-section" role="none">
					{section.heading && (
						<span
							className="ideallo-tool-popover-heading"
							id={`${section.key}-heading`}
						>
							{section.heading}
						</span>
					)}
					{/* A labelled group per section, so the heading is announced with its items. An
					    unlabelled group would be pure noise, so a headingless section is `none`. */}
					<div
						className="ideallo-tool-popover-row"
						role={section.heading ? 'group' : 'none'}
						aria-labelledby={section.heading ? `${section.key}-heading` : undefined}
					>
						{section.items.map((item) => {
							// menuitemRADIO with aria-checked, not menuitem with aria-pressed:
							// aria-pressed is not supported on menuitem, so which shape is active
							// was never conveyed at all.
							flatIndex++
							const index = flatIndex
							return (
								<button
									key={item.key}
									type="button"
									role="menuitemradio"
									ref={(node) => {
										itemRefs.current[index] = node
									}}
									className={`ideallo-tool-btn${item.active ? ' active' : ''}`}
									aria-checked={Boolean(item.active)}
									tabIndex={index === focusIndex ? 0 : -1}
									disabled={item.disabled}
									onClick={item.onSelect}
									onFocus={() => setFocusIndex(index)}
									title={
										item.shortcut
											? `${item.label} (${item.shortcut})`
											: item.label
									}
									aria-label={item.label}
								>
									<item.Icon size={iconSize} />
								</button>
							)
						})}
					</div>
				</div>
			))}
		</div>
	)
}

// vim: ts=4
