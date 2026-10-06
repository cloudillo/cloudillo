// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { BadgeAnchor, Button, mergeClasses, ProfilePicture } from '@cloudillo/react'
import * as React from 'react'
import { NavLink } from 'react-router-dom'

export interface AppDockProps {
	'aria-label': string
	inert?: boolean
	/** The dock's islands (`layout/Menu` composes them from the parts below). */
	children: React.ReactNode
}

/** The mobile bottom dock (below lg). */
export function AppDock({ 'aria-label': ariaLabel, inert, children }: AppDockProps) {
	return (
		<nav
			inert={inert}
			className="c-nav nav-bottom w-100 border-radius-0 justify-content-center flex-order-end lg-hide"
			aria-label={ariaLabel}
		>
			{children}
		</nav>
	)
}

/** A floating island in the dock; `apps` is the one that grows and spreads its links. */
export function AppDockIsland({ apps, children }: { apps?: boolean; children: React.ReactNode }) {
	return (
		<div
			className={mergeClasses('c-nav-island', apps && 'c-nav-apps')}
			data-tour={apps ? 'nav' : undefined}
		>
			{children}
		</div>
	)
}

/**
 * An app tile (dock, rail, Other grid): icon (an `AppIcon` tile) with an optional badge over
 * a label. A link with `href`, else a button (Scan QR, the Other trigger).
 */
export function AppDockLink({
	href,
	icon,
	label,
	badge,
	vertical,
	className,
	onClick,
	ref,
	...aria
}: {
	href?: string
	icon?: React.ReactNode
	label: string
	badge?: React.ReactNode
	vertical?: boolean
	className?: string
	onClick?: (evt: React.MouseEvent<HTMLElement>) => void
	/** Button mode: a `Popover` trigger's ref and pointer handler land here. */
	ref?: React.Ref<HTMLButtonElement>
	onPointerDown?: (evt: React.PointerEvent<HTMLElement>) => void
} & React.AriaAttributes) {
	const content = (
		<>
			<BadgeAnchor badge={badge}>{icon}</BadgeAnchor>
			<span className="c-nav-label">{label}</span>
		</>
	)
	const cls = mergeClasses('c-nav-link', vertical && 'vertical', className)
	if (href == null) {
		return (
			<Button ref={ref} kind="nav-link" className={cls} onClick={onClick} {...aria}>
				{content}
			</Button>
		)
	}
	return (
		<NavLink className={cls} to={href} onClick={onClick} {...aria}>
			{content}
		</NavLink>
	)
}

/** The Other grid, inside the rail's flyout or the dock's sheet. */
export function AppDockOther({
	inert,
	'aria-label': ariaLabel,
	children
}: {
	inert?: boolean
	'aria-label': string
	children: React.ReactNode
}) {
	return (
		<nav inert={inert} className="c-nav c-extra-menu" aria-label={ariaLabel}>
			{children}
		</nav>
	)
}

/** Separates the inline apps from the split Other button. */
export function AppDockDivider() {
	return <span className="c-nav-divider" aria-hidden="true" />
}

/**
 * The split Other button: the recent app (optional) and the ▦ trigger, grouped. Row on the
 * dock, stacked on the desktop rail (`ui/app-shell.css`).
 */
export function AppDockSplit({
	'aria-label': ariaLabel,
	single,
	children
}: {
	'aria-label': string
	/** No recent app: the trigger takes the whole slot. */
	single?: boolean
	children: React.ReactNode
}) {
	return (
		<div
			className={mergeClasses('c-nav-split', single && 'single')}
			role="group"
			aria-label={ariaLabel}
		>
			{children}
		</div>
	)
}

/** The dock's context island: opens the community sheet (a dialog), not a destination. */
export function AppDockContextToggle({
	open,
	onToggle,
	idTag,
	profilePic,
	name,
	'aria-label': ariaLabel
}: {
	open: boolean
	onToggle: () => void
	idTag: string
	profilePic?: string
	name: string
	'aria-label': string
}) {
	return (
		<Button
			kind="nav-link"
			className={mergeClasses('c-ctx-toggle c-nav-island vertical', open && 'active')}
			onClick={onToggle}
			aria-label={ariaLabel}
			aria-haspopup="dialog"
			aria-expanded={open}
			data-tour="context"
		>
			<ProfilePicture profile={{ profilePic }} srcTag={idTag} tiny />
			<span className="c-nav-label">{name}</span>
		</Button>
	)
}

// vim: ts=4
