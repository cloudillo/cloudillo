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
import { PiLockBold as IcLocked } from 'react-icons/pi'

import { useEdgeClamp } from '../hooks/useEdgeClamp.js'

export interface ToolPopoverItem {
	key: string
	Icon: IconType
	label: string
	shortcut?: string
	active?: boolean
	disabled?: boolean
	/**
	 * A toggle rather than one of a set: renders `menuitemcheckbox` instead of `menuitemradio`.
	 * `active` carries the checked state either way - `aria-pressed` is not valid on a menu item.
	 */
	checkbox?: boolean
	/**
	 * Render as a LABELLED row even in an icon layout, the way `layout='menu'` renders every item.
	 * For an item a bare glyph cannot name: the mobile Tools flyout's tool lock wears the same
	 * padlock the property bar uses for OBJECT lock, so the visible label is what tells them apart.
	 */
	row?: boolean
	/** Kept armed by the tool lock: draws the same badge the toolbar button does. Icon layouts only. */
	kept?: boolean
	onSelect: () => void
}

export interface ToolPopoverSection {
	key: string
	/** Row caption. Omitted for a single-category desktop popup. */
	heading?: string
	/** Extra class on the section wrapper, for a section that needs a layout of its own. */
	className?: string
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
	/**
	 * Escape INSTEAD of `onClose`, for a flyout whose mere opening changed something - the tool
	 * group triggers arm their last-used member, and Escape is the only way back to what was armed
	 * before. An outside click and an item selection are not cancellations and still call `onClose`.
	 */
	onCancel?: () => void
	sections: ToolPopoverSection[]
	/**
	 * 'rows' = one flex row per section (mobile); 'wrap' = one wrapped row (desktop);
	 * 'menu' = a vertical list of LABELLED rows, for items whose icon alone would be ambiguous.
	 */
	layout?: 'rows' | 'wrap' | 'menu'
	iconSize?: number
	/**
	 * The trigger, so an outside click can spare it: closing on the trigger's `pointerdown` and
	 * then re-opening on its `click` would make the popover impossible to dismiss by its own button.
	 */
	anchorRef?: React.RefObject<HTMLElement | null>
	/**
	 * What an outside pointerdown does to the event.
	 *
	 * 'swallow' (default) cancels it, so dismissing a menu can never also act on the canvas.
	 * 'passthrough' only closes: the caller is asserting the armed tool commits on drag alone, so a
	 * dismissing TAP still creates nothing while a dismissing DRAG draws what the user plainly
	 * intended. Swallowing there would kill the whole gesture, not just a click - preventDefault on
	 * pointerdown stops SvgCanvas ever taking pointer capture.
	 */
	dismissMode?: 'swallow' | 'passthrough'
	'aria-label': string
}

export function ToolPopover({
	open,
	onClose,
	onCancel,
	sections,
	layout = 'wrap',
	iconSize = 22,
	anchorRef,
	dismissMode = 'swallow',
	'aria-label': ariaLabel
}: ToolPopoverProps) {
	// No flip: this opens upward from a bottom-docked toolbar, so the other side is off screen
	const { ref, shift, maxHeight } = useEdgeClamp({ side: 'above', flip: false, gap: 8 })

	useEscapeKey(onCancel ?? onClose, open)

	// Not `useOutsideClick`: it watches a single ref, and the trigger has to be spared too.
	React.useEffect(() => {
		if (!open) return
		const handleOutside = (evt: PointerEvent) => {
			const target = evt.target as Node | null
			if (!target) return
			if (ref.current?.contains(target)) return
			if (anchorRef?.current?.contains(target)) return
			// Swallowing the dismissing click keeps it off SvgCanvas, where it would place a
			// sticky or erase - see `dismissMode` for why the drag-committed tools opt out.
			if (dismissMode === 'swallow') {
				evt.stopPropagation()
				evt.preventDefault()
			}
			onClose()
		}
		// Capture phase, and it has to be: React 19 attaches its listeners at the root container,
		// which is a DESCENDANT of `document`, so a bubble-phase listener here runs after React has
		// already dispatched the event and can no longer retract it. In passthrough mode that same
		// ordering is what closes the flyout BEFORE the canvas handler runs.
		document.addEventListener('pointerdown', handleOutside, true)
		return () => document.removeEventListener('pointerdown', handleOutside, true)
	}, [open, onClose, ref, anchorRef, dismissMode])

	/*
	 * Roving tabindex over the items flattened across sections: exactly one item is tabbable at a
	 * time and the arrows move which. That is the `menu` contract this claims with role=menu, and
	 * without it the arrows did nothing at all.
	 */
	const flatItems = React.useMemo(() => sections.flatMap((s) => s.items), [sections])
	const itemRefs = React.useRef<(HTMLButtonElement | null)[]>([])
	const [focusIndex, setFocusIndex] = React.useState(() => nextEnabledIndex(flatItems, -1, 1))

	/*
	 * Re-seat the roving index if the item set changes under it (a tool becoming disabled).
	 *
	 * Keyed on the item set's VALUE, not on `flatItems`. Every caller builds `sections` as an inline
	 * array literal, so `flatItems` is a fresh array on every render - and the toolbar re-renders on
	 * every pointer move of a canvas drag. Depending on its identity scheduled an update from inside
	 * React's passive-effect flush once per frame, which trips "Maximum update depth exceeded" while
	 * blaming whichever setState came next.
	 *
	 * The same trick as PropertyBar's `arrowPropsKey`/`textValuesKey`, and it fixes the popover for
	 * any caller rather than asking five call sites to memoise.
	 */
	const itemsKey = flatItems.map((item) => `${item.key}:${item.disabled ? 0 : 1}`).join('|')

	React.useEffect(() => {
		setFocusIndex((prev) =>
			prev >= 0 && prev < flatItems.length && !flatItems[prev].disabled
				? prev
				: nextEnabledIndex(flatItems, -1, 1)
		)
		// itemsKey is the real dependency; flatItems is read through it
	}, [itemsKey])

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
			className={`ideallo-tool-popover${layout === 'wrap' ? '' : ` ${layout}`}`}
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
				<div
					key={section.key}
					className={`ideallo-tool-popover-section${section.className ? ` ${section.className}` : ''}`}
					role="none"
				>
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
							// was never conveyed at all. A `checkbox` item is a toggle rather than
							// one of a set, so it says menuitemcheckbox instead.
							flatIndex++
							const index = flatIndex
							// A menu row is a labelled line, not a 44x44 square, so it takes its
							// own class - and its label is visible, so it needs no aria-label.
							const isRow = layout === 'menu' || Boolean(item.row)
							return (
								<button
									key={item.key}
									type="button"
									role={item.checkbox ? 'menuitemcheckbox' : 'menuitemradio'}
									ref={(node) => {
										itemRefs.current[index] = node
									}}
									className={`${isRow ? 'ideallo-tool-menu-item' : 'ideallo-tool-btn'}${item.active ? ' active' : ''}`}
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
									aria-label={isRow ? undefined : item.label}
								>
									<item.Icon size={iconSize} />
									{/* aria-hidden: app.tsx's live region already announces the
									    mode, and the ... menu's row names it */}
									{!isRow && item.kept && (
										<span className="ideallo-tool-kept" aria-hidden="true">
											<IcLocked size={12} />
										</span>
									)}
									{isRow && <span>{item.label}</span>}
									{isRow && item.shortcut && (
										<span className="ideallo-tool-menu-shortcut">
											{item.shortcut}
										</span>
									)}
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
