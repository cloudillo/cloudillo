// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { createPortal } from 'react-dom'
import { usePopper } from 'react-popper'
import { Link as RouterLink } from 'react-router-dom'

import { ActionSheet, ActionSheetSubItem } from '../ActionSheet/ActionSheet.js'
import { useMenuKeyboard, useMergedRefs } from '../hooks.js'
import {
	type AnchorPlacement,
	overlayContainer,
	Popover,
	PopoverSurface,
	trackInputModality,
	type VirtualAnchor
} from '../Popover/Popover.js'
import { createComponent, isCrossOrigin, isInternal, mergeClasses } from '../utils.js'

export interface MenuPosition {
	x: number
	y: number
}

/** Touch devices and narrow viewports (below 48rem, the md band) get a bottom sheet */
export const MENU_SHEET_QUERY = '(pointer: coarse), (width < 48rem)'

function useSheetMode(): boolean {
	const [sheet, setSheet] = React.useState(() => !!window.matchMedia?.(MENU_SHEET_QUERY).matches)
	React.useEffect(() => {
		const mq = window.matchMedia?.(MENU_SHEET_QUERY)
		if (!mq?.addEventListener) return
		const onChange = () => setSheet(mq.matches)
		mq.addEventListener('change', onChange)
		return () => mq.removeEventListener('change', onChange)
	}, [])
	return sheet
}

/** How the items render (`sheet`) and how activating one closes the menu */
const MenuContext = React.createContext<{ sheet: boolean; close: () => void } | null>(null)

const TYPEAHEAD_ITEMS = '[role^="menuitem"]:not([disabled])'

/** Type a label's first letters to focus it; a repeated single letter cycles through matches */
function useTypeahead() {
	const buffer = React.useRef({ text: '', at: 0 })
	return React.useCallback((evt: React.KeyboardEvent<HTMLElement>) => {
		if (evt.key.length !== 1 || evt.key === ' ' || evt.ctrlKey || evt.metaKey || evt.altKey) {
			return
		}
		const now = Date.now()
		const b = buffer.current
		b.text = (now - b.at > 500 ? '' : b.text) + evt.key.toLowerCase()
		b.at = now

		const items = Array.from(evt.currentTarget.querySelectorAll<HTMLElement>(TYPEAHEAD_ITEMS))
		const current = items.indexOf(document.activeElement as HTMLElement)
		const from = b.text.length === 1 ? current + 1 : Math.max(current, 0)
		const match = [...items.slice(from), ...items.slice(0, from)].find((el) =>
			(el.querySelector('.c-menu-item-label') ?? el).textContent
				?.trim()
				.toLowerCase()
				.startsWith(b.text)
		)
		if (match) {
			evt.preventDefault()
			match.focus()
		}
	}, [])
}

export interface MenuProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'children'> {
	/** Triggered mode: one element (a Button) that toggles the menu */
	trigger?: React.ReactElement
	/** Context-menu mode: open at viewport coordinates while mounted */
	position?: MenuPosition
	/** Anchored mode: open against this element while mounted */
	anchor?: HTMLElement | null
	/** Anchored and triggered modes; position mode opens at `bottom-start` of the point */
	placement?: AnchorPlacement
	/** Triggered mode, controlled; leave undefined for uncontrolled */
	open?: boolean
	onOpenChange?: (open: boolean) => void
	/** Called on Escape, outside click, or item activation */
	onClose?: () => void
	children?: React.ReactNode
}

/**
 * One menu for context (`position`), anchored (`anchor`) and triggered (`trigger`)
 * use. On touch or below 48rem it renders as a bottom sheet — callers never switch.
 */
export function Menu({
	trigger,
	position,
	anchor,
	placement = 'bottom-start',
	open: openProp,
	onOpenChange,
	onClose,
	className,
	children,
	...props
}: MenuProps) {
	const sheet = useSheetMode()
	const typeahead = useTypeahead()
	React.useEffect(() => {
		trackInputModality()
	}, [])
	const [openState, setOpenState] = React.useState(false)
	const open = trigger ? (openProp ?? openState) : true

	const onCloseRef = React.useRef(onClose)
	onCloseRef.current = onClose
	const setOpen = React.useCallback(
		(next: boolean) => {
			if (openProp === undefined) setOpenState(next)
			onOpenChange?.(next)
			if (!next) onCloseRef.current?.()
		},
		[openProp, onOpenChange]
	)
	const close = React.useCallback(() => setOpen(false), [setOpen])
	const ctx = React.useMemo(() => ({ sheet, close }), [sheet, close])

	const x = position?.x
	const y = position?.y
	const virtualAnchor = React.useMemo<VirtualAnchor | undefined>(
		() =>
			x === undefined || y === undefined
				? undefined
				: { getBoundingClientRect: () => new DOMRect(x, y, 0, 0) },
		[x, y]
	)
	const surfaceAnchor = anchor ?? virtualAnchor

	let content: React.ReactNode
	if (sheet) {
		const own = (trigger as React.ReactElement<Record<string, unknown>> | undefined)?.props
		content = (
			<>
				{trigger &&
					React.cloneElement(trigger as React.ReactElement<Record<string, unknown>>, {
						'aria-haspopup': 'menu',
						'aria-expanded': open,
						onClick: (evt: React.MouseEvent) => {
							;(own?.onClick as ((e: React.MouseEvent) => void) | undefined)?.(evt)
							setOpen(!open)
						}
					})}
				<ActionSheet
					{...props}
					className={className}
					isOpen={open && (!!trigger || !!surfaceAnchor)}
					onClose={close}
				>
					{children}
				</ActionSheet>
			</>
		)
	} else if (trigger) {
		content = (
			<Popover
				{...props}
				trigger={trigger}
				placement={placement}
				role="menu"
				open={open}
				onOpenChange={setOpen}
				className={mergeClasses('c-menu', className)}
				onKeyDown={typeahead}
			>
				{children}
			</Popover>
		)
	} else if (surfaceAnchor) {
		content = (
			<PopoverSurface
				{...props}
				anchor={surfaceAnchor}
				placement={placement}
				role="menu"
				elevation="high"
				closeOnContextMenu
				onClose={close}
				className={mergeClasses('c-menu', className)}
				onKeyDown={typeahead}
			>
				{children}
			</PopoverSurface>
		)
	}

	return <MenuContext.Provider value={ctx}>{content}</MenuContext.Provider>
}

export interface MenuItemProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
	icon?: React.ReactNode
	label: string
	/** Second line under the label */
	description?: React.ReactNode
	shortcut?: string
	/** Content at the end of the row (a badge, a count) */
	trailing?: React.ReactNode
	color?: 'error'
	/** @deprecated Use `color="error"`. */
	danger?: boolean
	/** Toggle item (`menuitemcheckbox`) */
	checked?: boolean
	/** One-of-many item (`menuitemradio`) */
	selected?: boolean
	/** Renders a link; internal paths route in-app */
	href?: string
}

export const MenuItem = createComponent<HTMLButtonElement, MenuItemProps>(
	'MenuItem',
	(
		{
			icon,
			label,
			description,
			shortcut,
			trailing,
			color,
			danger,
			checked,
			selected,
			href,
			disabled,
			onClick,
			className,
			...props
		},
		ref
	) => {
		const menu = React.useContext(MenuContext)
		const sheet = !!menu?.sheet
		const on = checked ?? selected
		const role =
			checked !== undefined
				? 'menuitemcheckbox'
				: selected !== undefined
					? 'menuitemradio'
					: 'menuitem'

		function handleClick(evt: React.MouseEvent<HTMLElement>) {
			onClick?.(evt as React.MouseEvent<HTMLButtonElement>)
			if (!evt.defaultPrevented) menu?.close()
		}

		const common = {
			role,
			'aria-checked': on,
			className: mergeClasses(
				sheet ? 'c-action-sheet-item' : 'c-menu-item',
				(color === 'error' || danger) && 'error',
				className
			),
			onClick: handleClick
		}
		const content = (
			<>
				{on !== undefined && (
					<span className="c-menu-item-check" aria-hidden="true">
						{on ? '✓' : ''}
					</span>
				)}
				{icon && (
					<span className={sheet ? 'c-action-sheet-item-icon' : 'c-menu-item-icon'}>
						{icon}
					</span>
				)}
				<span className="c-menu-item-label">
					{label}
					{description && <span className="c-menu-item-description">{description}</span>}
				</span>
				{shortcut && !sheet && <span className="c-menu-item-shortcut">{shortcut}</span>}
				{trailing && <span className="c-menu-item-trailing">{trailing}</span>}
			</>
		)

		if (href && !disabled) {
			const linkProps = {
				...(props as React.AnchorHTMLAttributes<HTMLAnchorElement>),
				...common,
				ref: ref as unknown as React.Ref<HTMLAnchorElement>
			}
			return isInternal(href) ? (
				<RouterLink to={href} {...linkProps}>
					{content}
				</RouterLink>
			) : (
				<a href={href} rel={isCrossOrigin(href) ? 'noopener' : undefined} {...linkProps}>
					{content}
				</a>
			)
		}

		return (
			<button ref={ref} type="button" disabled={disabled} {...props} {...common}>
				{content}
			</button>
		)
	}
)

export interface MenuDividerProps extends React.HTMLAttributes<HTMLDivElement> {}

export const MenuDivider = createComponent<HTMLDivElement, MenuDividerProps>(
	'MenuDivider',
	({ className, ...props }, ref) => {
		const sheet = !!React.useContext(MenuContext)?.sheet
		return (
			// A generic element is not a permitted child of `role="menu"`.
			<div
				ref={ref}
				role="separator"
				className={mergeClasses(
					sheet ? 'c-action-sheet-divider' : 'c-menu-divider',
					className
				)}
				{...props}
			/>
		)
	}
)

export interface MenuHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
	children?: React.ReactNode
}

export const MenuHeader = createComponent<HTMLDivElement, MenuHeaderProps>(
	'MenuHeader',
	({ className, children, ...props }, ref) => (
		// A generic element is not a permitted child of `role="menu"`.
		<div
			ref={ref}
			role="presentation"
			className={mergeClasses('c-menu-header', className)}
			{...props}
		>
			{children}
		</div>
	)
)

// SubMenuItem - a menu item that opens a nested submenu on hover/keyboard; in the sheet
// renderer it expands inline instead
export interface SubMenuItemProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'children'> {
	icon?: React.ReactNode
	label: string
	/** Optional secondary label shown after the main label (e.g. current value) */
	detail?: string
	disabled?: boolean
	children?: React.ReactNode
}

export const SubMenuItem = createComponent<HTMLDivElement, SubMenuItemProps>(
	'SubMenuItem',
	(props, ref) =>
		React.useContext(MenuContext)?.sheet ? (
			<ActionSheetSubItem ref={ref} {...props} />
		) : (
			<FloatingSubMenu ref={ref} {...props} />
		)
)

const FloatingSubMenu = React.forwardRef<HTMLDivElement, SubMenuItemProps>(function FloatingSubMenu(
	{ icon, label, detail, disabled, children, className, ...props },
	ref
) {
	const [isOpen, setIsOpen] = React.useState(false)
	const [triggerEl, setTriggerEl] = React.useState<HTMLDivElement | null>(null)
	const [popperEl, setPopperEl] = React.useState<HTMLDivElement | null>(null)
	const closeTimerRef = React.useRef<number | undefined>(undefined)
	const mergedRef = useMergedRefs(ref, setTriggerEl)
	const handleRovingKeyDown = useMenuKeyboard(popperEl, { autoFocus: false })

	const { styles: popperStyles, attributes } = usePopper(triggerEl, popperEl, {
		placement: 'right-start',
		strategy: 'fixed',
		modifiers: [
			{ name: 'flip', options: { fallbackPlacements: ['left-start'] } },
			{ name: 'preventOverflow', options: { padding: 8 } },
			{ name: 'offset', options: { offset: [-4, -4] } }
		]
	})

	function scheduleClose() {
		closeTimerRef.current = window.setTimeout(() => setIsOpen(false), 150)
	}

	function cancelClose() {
		if (closeTimerRef.current) {
			clearTimeout(closeTimerRef.current)
			closeTimerRef.current = undefined
		}
	}

	function handleMouseEnter() {
		if (disabled) return
		cancelClose()
		setIsOpen(true)
	}

	function handleMouseLeave() {
		scheduleClose()
	}

	function handleKeyDown(evt: React.KeyboardEvent) {
		if (disabled) return
		if (evt.key === 'ArrowRight' || evt.key === 'Enter') {
			evt.preventDefault()
			evt.stopPropagation()
			setIsOpen(true)
			requestAnimationFrame(() => {
				const firstItem = popperEl?.querySelector<HTMLButtonElement>(
					'.c-menu-item:not([disabled])'
				)
				firstItem?.focus()
			})
		}
	}

	// Keys inside the submenu stay there: the parent menu's roving would otherwise
	// walk both lists (the submenu is portaled into the parent surface).
	function handleSubmenuKeyDown(evt: React.KeyboardEvent) {
		if (evt.key === 'ArrowLeft') {
			evt.preventDefault()
			setIsOpen(false)
			triggerEl?.querySelector<HTMLButtonElement>('.c-submenu-item')?.focus()
		} else {
			handleRovingKeyDown(evt)
		}
		evt.stopPropagation()
	}

	React.useEffect(
		() => () => {
			if (closeTimerRef.current) clearTimeout(closeTimerRef.current)
		},
		[]
	)

	// Own top layer entry; jsdom lacks showPopover. Unmount removes it from the top layer.
	React.useLayoutEffect(() => {
		if (!popperEl || typeof popperEl.showPopover !== 'function') return
		try {
			popperEl.showPopover()
		} catch {
			// already showing
		}
	}, [popperEl])

	return (
		<div
			ref={mergedRef}
			className={mergeClasses('c-submenu-container', className)}
			onMouseEnter={handleMouseEnter}
			onMouseLeave={handleMouseLeave}
			{...props}
		>
			<button
				type="button"
				role="menuitem"
				aria-haspopup="menu"
				aria-expanded={isOpen}
				className={mergeClasses('c-submenu-item', isOpen && 'active')}
				disabled={disabled}
				onKeyDown={handleKeyDown}
			>
				{icon && <span className="c-menu-item-icon">{icon}</span>}
				<span className="c-menu-item-label">
					{label}
					{detail && <span className="c-menu-item-detail">{detail}</span>}
				</span>
				<span className="c-menu-item-chevron">&#x25B8;</span>
			</button>
			{isOpen &&
				// Its own manual popover (top layer, so the parent's overflow and containing
				// block don't clip it); portaled into the parent so a click in it is "inside".
				createPortal(
					<div
						ref={setPopperEl}
						popover="manual"
						className="c-menu"
						role="menu"
						style={popperStyles.popper}
						onMouseEnter={cancelClose}
						onMouseLeave={scheduleClose}
						onKeyDown={handleSubmenuKeyDown}
						{...attributes.popper}
					>
						{children}
					</div>,
					overlayContainer(triggerEl)
				)}
		</div>
	)
})

// vim: ts=4
