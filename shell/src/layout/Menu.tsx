// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * The shell's app nav: the vertical left rail (desktop) and the bottom bar (mobile),
 * including the overflow "Other" menu. Both surfaces share this one item engine —
 * which items are visible, and what badge each carries.
 */

import {
	Button,
	mergeClasses,
	ProfilePicture,
	useAuth,
	useEscapeKey,
	useMenuKeyboard,
	useOutsideDismiss
} from '@cloudillo/react'
import { useAtomValue, useSetAtom } from 'jotai'
import * as React from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { LuGrip as IcApps, LuScanLine as IcScan } from 'react-icons/lu'
import { usePopper } from 'react-popper'
import { NavLink, useLocation } from 'react-router-dom'

import { getFileIcon } from '../apps/files/icons.js'
import { useQrScanner } from '../components/QrScanner/index.js'
// Leaf modules, not the `context/` barrel: the barrel re-exports `Sidebar`, which
// imports this file, and going through it would make that an import cycle.
import { activeContextAtom, activeContextDisplayAtom } from '../context/atoms.js'
import { useCtx } from '../context/ctx.js'
import { useGuestDocument } from '../context/guest-document.js'
import {
	isContextLeader,
	LEADER_ONLY_APPS,
	useCurrentContextIdTag,
	useSidebar
} from '../context/hooks.js'
import { unreadCountAtom } from '../read-position.js'
import { appPath, ctxBase, scopePath } from '../routes.js'
import { lastAppAtom } from '../state/last-app.js'
import { useAppConfig } from '../utils.js'

/** Truncate a filename while preserving its extension. Shared with `ContextBar`. */
export function truncateFileName(name: string, maxLen: number = 12): string {
	if (name.length <= maxLen) return name
	const extIdx = name.lastIndexOf('.')
	if (extIdx > 0 && name.length - extIdx <= 6) {
		const baseName = name.substring(0, extIdx)
		const extension = name.substring(extIdx)
		const available = maxLen - extension.length - 1 // -1 for "…"
		if (available > 0) {
			return baseName.substring(0, available) + '…' + extension
		}
	}
	return name.substring(0, maxLen - 1) + '…'
}

interface MenuLinkItem {
	id: string
	icon?: React.ComponentType
	label: string
	trans?: Record<string, string>
	path: string
}

// A nav link with a generic badge slot: a content dot for the feed, a numeric
// unread count for messages.
function MenuLink({
	menuItem,
	className,
	badge,
	onClick
}: {
	menuItem: MenuLinkItem
	className?: string
	badge?: React.ReactNode
	onClick?: () => void
}) {
	const { i18n } = useTranslation()
	const ctx = useCtx()
	return (
		<NavLink className={className} to={scopePath(ctx.base, menuItem.path)} onClick={onClick}>
			<span style={{ position: 'relative', display: 'inline-flex' }}>
				{menuItem.icon && React.createElement(menuItem.icon)}
				{badge}
			</span>
			<span className="c-nav-label">{menuItem.trans?.[i18n.language] || menuItem.label}</span>
		</NavLink>
	)
}

export function Menu({
	inert,
	vertical,
	sidebarToggle,
	extraMenuPortal
}: {
	inert?: boolean
	/** Icon-over-label item layout (the left rail and the mobile bottom bar). */
	vertical?: boolean
	/** Render the community-sheet toggle first — the mobile bottom bar only. */
	sidebarToggle?: boolean
	extraMenuPortal?: HTMLElement | null
}) {
	const { t } = useTranslation()
	const location = useLocation()
	const [appConfig, _setAppConfig] = useAppConfig()
	const [auth, _setAuth] = useAuth()
	const [moreMenuOpen, setMoreMenuOpen] = React.useState(false)
	// Desktop rail only: the flyout is portaled out and anchored to its trigger.
	// The mobile bottom bar takes the `extraMenuPortal` branch and never sets these.
	const [triggerEl, setTriggerEl] = React.useState<HTMLButtonElement | null>(null)
	const [flyoutEl, setFlyoutEl] = React.useState<HTMLDivElement | null>(null)
	const { styles: popperStyles, attributes } = usePopper(triggerEl, flyoutEl, {
		placement: 'right-start',
		strategy: 'fixed',
		modifiers: [
			{ name: 'flip', options: { fallbackPlacements: ['right-end', 'left-start', 'top'] } },
			{ name: 'preventOverflow', options: { padding: 8 } },
			{ name: 'offset', options: { offset: [0, 8] } }
		]
	})
	const sidebar = useSidebar()
	const [guestDocument] = useGuestDocument()
	const [, setQrScannerOpen] = useQrScanner()
	const lastApp = useAtomValue(lastAppAtom)
	const setLastApp = useSetAtom(lastAppAtom)
	// Real idTag (own idTag for the personal context) — matches the key the feed
	// unread probe writes; a `~`-shaped URL context would miss.
	const menuContextIdTag = useCurrentContextIdTag()
	const unreadCounts = useAtomValue(unreadCountAtom)

	// A dot for the feed's active context. See read-position.ts.
	function badgeFor(menuItem: MenuLinkItem): React.ReactNode {
		if (menuItem.id === 'feed' && unreadCounts[menuContextIdTag ?? '']) {
			return (
				<span
					className="c-badge dot accent positioned tr"
					role="status"
					aria-label={t('New content')}
				/>
			)
		}
		return undefined
	}
	const activeContext = useAtomValue(activeContextAtom)
	const contextDisplay = useAtomValue(activeContextDisplayAtom)

	React.useEffect(
		function onLocationChange() {
			setMoreMenuOpen(false)
		},
		[location]
	)

	function closeMoreMenu(refocus?: boolean) {
		setMoreMenuOpen(false)
		if (refocus) triggerEl?.focus()
	}

	useEscapeKey(() => closeMoreMenu(true), moreMenuOpen)

	// Roving focus for the flyout grid. `flyoutEl` stays null while the popover is
	// closed, so the hook is inert then; the mobile sheet never sets it. `autoFocus`
	// is off: a mouse open must not yank the caret into the first link. Keyboard entry
	// still works — with focus off the list `current` is -1, so ArrowDown enters at the
	// top and ArrowUp at the bottom.
	const handleFlyoutKeys = useMenuKeyboard(flyoutEl, {
		itemSelector: '.c-nav-link',
		autoFocus: false
	})

	// The trigger is exempt (it would close here and reopen on its own click), but it
	// must not arm the hook: it is always mounted, and an armed hook swallows every
	// click in the shell. Only the open surface arms it: the desktop flyout (exists only
	// while open) or the mobile sheet's portal (always mounted, so gated on the flag —
	// its empty band is `pointer-events: none`, so only taps on the sheet count inside).
	const moreSurface = flyoutEl ?? (moreMenuOpen ? extraMenuPortal : null)
	useOutsideDismiss(moreSurface ? [moreSurface, triggerEl] : [], () => setMoreMenuOpen(false))

	// Tenant-owned apps (contacts, calendar) are leader-only server-side.
	const leaderHere = isContextLeader(activeContext, auth?.idTag)

	const staticItems =
		appConfig?.menu.filter((item) => {
			if (LEADER_ONLY_APPS.has(item.id) && !leaderHere) return false
			return (!!auth && (!item.perm || auth.roles?.includes(item.perm))) || item.public
		}) || []

	const isAppDoc = !!guestDocument?.appId // CRDT/RTDB set appId; BLOB/FLDR set ''
	const guestDocMenuItem = guestDocument
		? {
				id: 'guest-doc',
				icon: getFileIcon(guestDocument.contentType, guestDocument.fileTp),
				label: truncateFileName(guestDocument.fileName),
				trans: {} as Record<string, string>,
				// Absolute, and pinned to the owner's own context: a guest browsing a
				// share link has no context of their own. `scopePath` leaves both
				// branches alone because both start with `/`.
				path: isAppDoc
					? appPath(
							ctxBase(guestDocument.ownerIdTag, undefined),
							guestDocument.appId,
							guestDocument.resId,
							guestDocument.accessLevel !== 'write'
								? { access: guestDocument.accessLevel }
								: undefined
						)
					: `/s/${guestDocument.refId}`,
				public: true
			}
		: null

	const visibleItems = guestDocMenuItem ? [guestDocMenuItem, ...staticItems] : staticItems

	// The mobile bottom bar (the only `sidebarToggle` user) spends a slot on the context chip.
	const maxInline = sidebarToggle ? 3 : 4
	const inlineItems = visibleItems.slice(0, maxInline)
	const moreItems = visibleItems.slice(maxInline)
	// Logged in, Other always renders: it always holds Scan QR.
	const needsMoreMenu = moreItems.length > 0 || !!auth

	// The recall half of the split Other button: the last app opened from Other, else
	// the first overflow app, so the split stays stable. Looked up in `moreItems`, so an
	// app since pinned inline or filtered out (leader-only, `perm`) falls back cleanly.
	const recentItem = moreItems.find((item) => item.id === lastApp) ?? moreItems[0]

	// One markup for both layouts: mobile renders it into `extraMenuPortal` as the
	// slide-up sheet (the `open` class drives that transition), desktop into the
	// popper-anchored flyout, which only exists while it is open.
	const moreNav = (
		<nav
			inert={inert}
			className={mergeClasses('c-nav c-extra-menu', moreMenuOpen && 'open')}
			aria-label={t('More menu items')}
		>
			{moreItems.map((menuItem) => (
				<MenuLink
					key={menuItem.id}
					menuItem={menuItem}
					className="c-nav-link h-small vertical"
					badge={badgeFor(menuItem)}
					// No `refocus`: after navigating, the trigger is no longer where
					// the user is looking.
					onClick={() => {
						setLastApp(menuItem.id)
						closeMoreMenu()
					}}
				/>
			))}
			{auth && (
				<Button
					kind="nav-link"
					className="h-small vertical"
					onClick={() => {
						setQrScannerOpen(true)
						closeMoreMenu()
					}}
				>
					<IcScan />
					<span className="c-nav-label">{t('Scan QR')}</span>
				</Button>
			)}
		</nav>
	)

	const appLinks = (
		<>
			{inlineItems.map((menuItem) => (
				<MenuLink
					key={menuItem.id}
					menuItem={menuItem}
					className={mergeClasses('c-nav-link', vertical && 'vertical')}
					badge={badgeFor(menuItem)}
				/>
			))}
			{recentItem && <span className="c-nav-divider" aria-hidden="true" />}
			{needsMoreMenu && (
				<div
					className={mergeClasses('c-nav-split', !recentItem && 'single')}
					role="group"
					aria-label={t('Other apps')}
				>
					{recentItem && (
						<MenuLink
							menuItem={recentItem}
							className={mergeClasses('c-nav-link', vertical && 'vertical')}
							badge={badgeFor(recentItem)}
						/>
					)}
					<Button
						ref={setTriggerEl}
						kind="nav-link"
						className={mergeClasses(
							'c-nav-split-more',
							vertical && 'vertical',
							moreMenuOpen && 'active'
						)}
						onClick={() => setMoreMenuOpen(!moreMenuOpen)}
						aria-label={t('More menu items')}
						aria-haspopup="true"
						aria-expanded={moreMenuOpen}
					>
						<IcApps />
						<span className="c-nav-label">{t('Other')}</span>
					</Button>
				</div>
			)}
		</>
	)

	return (
		!location.pathname.match('^/register/') && (
			<>
				{sidebarToggle && auth && (
					<Button
						kind="nav-link"
						className={mergeClasses(
							'c-ctx-toggle c-nav-island vertical',
							sidebar.isOpen && 'active'
						)}
						onClick={() => sidebar.toggle()}
						aria-label={t('Switch community')}
						aria-haspopup="dialog"
						aria-expanded={sidebar.isOpen}
					>
						<ProfilePicture
							profile={{ profilePic: contextDisplay?.profilePic ?? auth.profilePic }}
							srcTag={contextDisplay?.idTag ?? auth.idTag}
							tiny
						/>
						<span className="c-nav-label">
							{contextDisplay?.name ?? auth.name ?? auth.idTag}
						</span>
					</Button>
				)}
				{needsMoreMenu && extraMenuPortal && createPortal(moreNav, extraMenuPortal)}
				{needsMoreMenu &&
					!extraMenuPortal &&
					moreMenuOpen &&
					createPortal(
						<div
							ref={setFlyoutEl}
							className="c-popper high c-menu-ex-flyout"
							style={popperStyles.popper}
							onKeyDown={handleFlyoutKeys}
							{...attributes.popper}
						>
							{moreNav}
						</div>,
						document.getElementById('popper-container') ?? document.body
					)}
				{sidebarToggle ? (
					<div className="c-nav-island c-nav-apps">{appLinks}</div>
				) : (
					appLinks
				)}
			</>
		)
	)
}
// vim: ts=4
