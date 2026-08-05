// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * The shell's primary nav: the horizontal app menu (desktop) and the vertical
 * bottom bar (mobile), including the overflow "More" menu.
 */

import { Button, mergeClasses, ProfilePicture, useAuth } from '@cloudillo/react'
import { useAtomValue } from 'jotai'
import * as React from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { LuGrip as IcApps, LuScanLine as IcScan } from 'react-icons/lu'
import { NavLink, useLocation } from 'react-router-dom'

import { getFileIcon } from '../apps/files/icons.js'
import { useQrScanner } from '../components/QrScanner/index.js'
import {
	activeContextAtom,
	activeContextDisplayAtom,
	contextIdpEnabledAtom,
	isContextLeader,
	LEADER_ONLY_APPS,
	useContextPath,
	useCurrentContextIdTag,
	useGuestDocument,
	useSidebar
} from '../context/index.js'
import { unreadCountAtom } from '../read-position.js'
import { useAppConfig } from '../utils.js'
import { truncateFileName } from './paths.js'

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
	badge
}: {
	menuItem: MenuLinkItem
	className?: string
	badge?: React.ReactNode
}) {
	const { i18n } = useTranslation()
	const { getContextPath } = useContextPath()
	return (
		<NavLink className={className} to={getContextPath(menuItem.path)}>
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
	extraMenuPortal
}: {
	inert?: boolean
	vertical?: boolean
	extraMenuPortal?: HTMLElement | null
}) {
	const { t } = useTranslation()
	const location = useLocation()
	const [appConfig, _setAppConfig] = useAppConfig()
	const [auth, _setAuth] = useAuth()
	const [moreMenuOpen, setMoreMenuOpen] = React.useState(false)
	const sidebar = useSidebar()
	const [guestDocument] = useGuestDocument()
	const [, setQrScannerOpen] = useQrScanner()
	// Real idTag (own idTag for the personal context) — matches the key the feed
	// unread probe writes; useUrlContextIdTag would yield '~' for home and miss.
	const menuContextIdTag = useCurrentContextIdTag()
	const unreadCounts = useAtomValue(unreadCountAtom)

	// A dot for the feed's active context; for messages, a count of `msg:<convId>`
	// conversations with unread — consistent across DMs (per-message counts) and
	// groups (0/1 dots). See read-position.ts.
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
		if (menuItem.id === 'messages') {
			let total = 0
			for (const [k, v] of Object.entries(unreadCounts)) {
				if (k.startsWith('msg:') && v > 0) total += 1
			}
			if (total > 0) {
				return (
					<span
						className="c-badge accent positioned tr"
						role="status"
						aria-label={t('Unread messages')}
					>
						{total}
					</span>
				)
			}
		}
		return undefined
	}
	const activeContext = useAtomValue(activeContextAtom)
	const contextDisplay = useAtomValue(activeContextDisplayAtom)
	const contextIdpEnabled = useAtomValue(contextIdpEnabledAtom)

	React.useEffect(
		function onLocationChange() {
			setMoreMenuOpen(false)
		},
		[location]
	)

	// `=== true` on purpose: the atom is three-state, and neither 'unknown' (a transient lookup
	// failure) nor a missing entry may show the IdP nav item. See contextIdpEnabledAtom.
	const idpEnabledHere = !!activeContext && contextIdpEnabled[activeContext.idTag] === true
	// Tenant-owned apps (contacts, calendar) are leader-only server-side.
	const leaderHere = isContextLeader(activeContext, auth?.idTag)

	const staticItems =
		appConfig?.menu.filter((item) => {
			if (item.id === 'idp' && !idpEnabledHere) return false
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
				path: isAppDoc
					? `/app/${guestDocument.ownerIdTag}/${guestDocument.appId}/${guestDocument.resId}${guestDocument.accessLevel !== 'write' ? `?access=${guestDocument.accessLevel}` : ''}`
					: `/s/${guestDocument.refId}`,
				public: true
			}
		: null

	const visibleItems = guestDocMenuItem ? [guestDocMenuItem, ...staticItems] : staticItems

	const MAX_INLINE_ITEMS = 4
	const needsMoreMenu = visibleItems.length > MAX_INLINE_ITEMS

	const inlineItems = needsMoreMenu ? visibleItems.slice(0, MAX_INLINE_ITEMS) : visibleItems
	const moreItems = needsMoreMenu ? visibleItems.slice(MAX_INLINE_ITEMS) : []

	// One markup for both layouts: the portal branch renders it straight into
	// `extraMenuPortal`, the inline branch wraps it in the `.c-menu-ex`
	// positioning container. `c-extra-menu` is only ever styled as a descendant
	// of a portal container, so carrying it inline changes nothing.
	const moreNav = (
		<nav inert={inert} className={mergeClasses('c-nav c-extra-menu', moreMenuOpen && 'open')}>
			{moreItems.map((menuItem) => (
				<MenuLink
					key={menuItem.id}
					menuItem={menuItem}
					className="c-nav-link h-small vertical"
					badge={badgeFor(menuItem)}
				/>
			))}
			{auth && (
				<Button
					kind="nav-link"
					className="h-small vertical"
					onClick={() => setQrScannerOpen(true)}
				>
					<IcScan />
					<span className="c-nav-label">{t('Scan QR')}</span>
				</Button>
			)}
		</nav>
	)

	return (
		!location.pathname.match('^/register/') && (
			<>
				{/* Sidebar toggle button on mobile (first item) - shows current context */}
				{vertical && auth && (
					<Button
						kind="nav-link"
						className={mergeClasses('vertical', sidebar.isOpen && 'active')}
						onClick={() => sidebar.toggle()}
						aria-label={t('Toggle sidebar')}
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
				{/* Extra menu: use portal on mobile (when extraMenuPortal is provided), inline otherwise */}
				{needsMoreMenu && extraMenuPortal && createPortal(moreNav, extraMenuPortal)}
				{needsMoreMenu && !extraMenuPortal && (
					<div className="c-menu-ex flex-order-end">{moreNav}</div>
				)}
				{inlineItems.map((menuItem) => (
					<MenuLink
						key={menuItem.id}
						menuItem={menuItem}
						className={mergeClasses('c-nav-link', vertical && 'vertical')}
						badge={badgeFor(menuItem)}
					/>
				))}
				{needsMoreMenu && (
					<Button
						kind="nav-link"
						className={mergeClasses(vertical && 'vertical')}
						onClick={() => setMoreMenuOpen(!moreMenuOpen)}
						aria-label={t('More menu items')}
						aria-expanded={moreMenuOpen}
					>
						<IcApps />
						<span className="c-nav-label">{t('More')}</span>
					</Button>
				)}
			</>
		)
	)
}
// vim: ts=4
