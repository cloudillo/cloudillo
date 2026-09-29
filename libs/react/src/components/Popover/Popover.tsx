// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { createPortal } from 'react-dom'
import { usePopper } from 'react-popper'

import { useMenuKeyboard, useOutsideDismiss } from '../hooks.js'
import { mergeRefs } from '../Tooltip/Tooltip.js'
import type { Elevation } from '../types.js'
import { mergeClasses } from '../utils.js'

export type AnchorPlacement =
	| 'top'
	| 'top-start'
	| 'top-end'
	| 'bottom'
	| 'bottom-start'
	| 'bottom-end'
	| 'left'
	| 'left-start'
	| 'left-end'
	| 'right'
	| 'right-start'
	| 'right-end'

/** A point or box to anchor to — react-popper's virtual element shape */
export interface VirtualAnchor {
	getBoundingClientRect: () => DOMRect
}

export interface AnchoredPositionOptions {
	placement?: AnchorPlacement
	/** Gap between anchor and surface, px */
	offset?: number
}

/**
 * Position `floating` against `anchor` with the popper engine (fixed strategy, flips when
 * out of room). Shared by every anchored overlay: spread `style` and `attributes` on the surface.
 */
export function useAnchoredPosition(
	anchor: Element | VirtualAnchor | null,
	floating: HTMLElement | null,
	{ placement = 'bottom-start', offset = 4 }: AnchoredPositionOptions = {}
) {
	const { styles, attributes } = usePopper(anchor, floating, {
		placement,
		strategy: 'fixed',
		modifiers: [
			{ name: 'offset', options: { offset: [0, offset] } },
			// Keep a gap to the viewport edge when the surface is shifted back into view.
			{ name: 'preventOverflow', options: { padding: 8 } }
		]
	})
	return { style: styles.popper, attributes: attributes.popper }
}

/**
 * Where an anchored surface is portaled: inside the nearest popover or `<dialog>` around
 * the anchor (so it is not inert under a modal and nests as a popover descendant), else
 * `#popper-container`, else `body`.
 */
export function overlayContainer(anchor: Element | null): Element {
	return (
		anchor?.closest('[popover], dialog') ??
		document.getElementById('popper-container') ??
		document.body
	)
}

/**
 * DESIGN-6: `:root[data-input-modality]` is `pointer` or `keyboard` after the last input.
 * Overlays auto-focus their first item on open; components.css hides that ring while the
 * modality is `pointer`, so only a keyboard-opened (or keyboard-driven) overlay shows it.
 */
export function trackInputModality() {
	if (typeof document === 'undefined' || document.documentElement.dataset.inputModality) return
	const root = document.documentElement
	root.dataset.inputModality = 'keyboard'
	function set(modality: string) {
		if (root.dataset.inputModality !== modality) root.dataset.inputModality = modality
	}
	document.addEventListener('pointerdown', () => set('pointer'), true)
	document.addEventListener('keydown', () => set('keyboard'), true)
}

export type PopoverWidth = 'sm' | 'md' | 'lg'

export interface PopoverProps
	extends Omit<React.HTMLAttributes<HTMLDivElement>, 'role' | 'children'> {
	/** One element (a Button) that accepts a ref; gets onClick and aria-expanded/controls */
	trigger: React.ReactElement
	placement?: AnchorPlacement
	width?: PopoverWidth
	/** Controlled open state; leave undefined for uncontrolled */
	open?: boolean
	onOpenChange?: (open: boolean) => void
	/** `menu` roves focus over its items; anything else moves focus onto the surface */
	role?: 'dialog' | 'menu' | 'listbox'
	elevation?: Elevation
	children?: React.ReactNode
}

/**
 * Anchored arbitrary content in the top layer (`popover` attribute). Escape and an
 * outside click close it; focus moves in on open and back to the trigger on close.
 */
export function Popover({
	trigger,
	placement = 'bottom-start',
	width,
	open: openProp,
	onOpenChange,
	role = 'dialog',
	elevation = 'high',
	id: idProp,
	children,
	...props
}: PopoverProps) {
	const autoId = React.useId()
	const id = idProp ?? autoId
	const [openState, setOpenState] = React.useState(false)
	const open = openProp ?? openState
	// Mount, not open: the listener must see the pointerdown that opens us
	React.useEffect(() => {
		trackInputModality()
	}, [])
	const [triggerEl, setTriggerEl] = React.useState<HTMLElement | null>(null)
	// Open state as the pointer went down: native light dismiss may close us before the
	// trigger's click lands, and that click must not reopen.
	const wasOpen = React.useRef<boolean | null>(null)

	const openRef = React.useRef(open)
	openRef.current = open
	const setOpen = React.useCallback(
		(next: boolean) => {
			if (next === openRef.current) return
			if (openProp === undefined) setOpenState(next)
			onOpenChange?.(next)
		},
		[openProp, onOpenChange]
	)
	const close = React.useCallback(() => setOpen(false), [setOpen])

	const child = trigger as React.ReactElement<Record<string, unknown>>
	const own = child.props
	const childRef = own.ref as React.Ref<HTMLElement> | undefined
	const ref = React.useMemo(() => mergeRefs(setTriggerEl, childRef), [childRef])

	return (
		<>
			{React.cloneElement(child, {
				ref,
				'aria-haspopup': own['aria-haspopup'] ?? role,
				'aria-expanded': open,
				'aria-controls': open ? id : undefined,
				onPointerDown: (evt: React.PointerEvent<HTMLElement>) => {
					wasOpen.current = openRef.current
					;(own.onPointerDown as ((e: React.PointerEvent) => void) | undefined)?.(evt)
				},
				onClick: (evt: React.MouseEvent<HTMLElement>) => {
					;(own.onClick as ((e: React.MouseEvent) => void) | undefined)?.(evt)
					const next = !(wasOpen.current ?? openRef.current)
					wasOpen.current = null
					setOpen(next)
				}
			})}
			{open && triggerEl && (
				<PopoverSurface
					{...props}
					id={id}
					anchor={triggerEl}
					placement={placement}
					width={width}
					role={role}
					elevation={elevation}
					onClose={close}
				>
					{children}
				</PopoverSurface>
			)}
		</>
	)
}

export interface PopoverSurfaceProps
	extends Omit<PopoverProps, 'trigger' | 'open' | 'onOpenChange'> {
	/** An element, or a virtual box such as a context menu's pointer position */
	anchor: HTMLElement | VirtualAnchor
	onClose: () => void
	/** A right-click outside closes too, and passes through to open the next context menu */
	closeOnContextMenu?: boolean
}

/**
 * The open surface without a trigger: for overlays that own their open state and anchor
 * (`Menu`'s `position` / `anchor` modes). Mount it to open, unmount to close.
 */
export function PopoverSurface({
	anchor,
	placement,
	width,
	role,
	elevation,
	onClose,
	closeOnContextMenu,
	className,
	onKeyDown,
	children,
	...props
}: PopoverSurfaceProps) {
	const [el, setEl] = React.useState<HTMLElement | null>(null)
	const { style, attributes } = useAnchoredPosition(anchor, el, { placement })
	const onCloseRef = React.useRef(onClose)
	onCloseRef.current = onClose
	const isMenu = role === 'menu'

	useOutsideDismiss([el], onClose, { closeOnContextMenu })
	const handleMenuKeyDown = useMenuKeyboard(isMenu ? el : null)

	// Top layer + native light dismiss; jsdom and old engines lack showPopover
	React.useLayoutEffect(() => {
		if (!el || typeof el.showPopover !== 'function') return
		try {
			;(el.showPopover as (opts?: { source?: HTMLElement }) => void)({
				source: anchor instanceof HTMLElement ? anchor : undefined
			})
		} catch {
			// already showing
		}
		function onToggle(evt: Event) {
			if ((evt as Event & { newState?: string }).newState === 'closed') onCloseRef.current()
		}
		el.addEventListener('toggle', onToggle)
		return () => el.removeEventListener('toggle', onToggle)
	}, [el, anchor])

	// Our own Escape, capture phase: a Dialog underneath must not close with us
	React.useEffect(() => {
		function handleKeyDown(evt: KeyboardEvent) {
			if (evt.key !== 'Escape') return
			evt.stopImmediatePropagation()
			evt.preventDefault()
			onCloseRef.current()
		}
		document.addEventListener('keydown', handleKeyDown, true)
		return () => document.removeEventListener('keydown', handleKeyDown, true)
	}, [])

	React.useEffect(() => {
		if (el && !isMenu) el.focus({ preventScroll: true })
	}, [el, isMenu])

	// Runs before the surface leaves the DOM: focus inside goes back to the trigger (or,
	// for a virtual anchor, to whatever had it before) instead of falling to <body>.
	const elRef = React.useRef<HTMLElement | null>(null)
	elRef.current = el
	const [prevFocus] = React.useState(() => document.activeElement as HTMLElement | null)
	const returnTo = anchor instanceof HTMLElement ? anchor : prevFocus
	React.useLayoutEffect(
		() => () => {
			if (elRef.current?.contains(document.activeElement)) returnTo?.focus()
		},
		[returnTo]
	)

	return createPortal(
		<div
			{...props}
			ref={setEl}
			// Context menus open mid-press (contextmenu fires on mousedown): native light dismiss
			// would close them on the matching pointerup. useOutsideDismiss + our Escape cover it.
			popover={closeOnContextMenu ? 'manual' : 'auto'}
			role={role}
			tabIndex={-1}
			className={mergeClasses('c-popper', elevation, width, className)}
			style={{ ...style, ...props.style }}
			onKeyDown={(evt) => {
				if (isMenu) handleMenuKeyDown(evt)
				onKeyDown?.(evt)
			}}
			{...attributes}
		>
			{children}
		</div>,
		overlayContainer(anchor instanceof Element ? anchor : null)
	)
}

// vim: ts=4
