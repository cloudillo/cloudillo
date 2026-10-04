// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * The shell's app nav: the vertical left rail (desktop) and the bottom bar (mobile),
 * including the overflow "Other" menu. Both surfaces share this one item engine —
 * which items are visible, and what badge each carries.
 */

import {
	APP_IDS,
	type AppId,
	AppIcon,
	Badge,
	BottomSheet,
	Popover,
	useAuth
} from '@cloudillo/react'
import { useAtomValue, useSetAtom } from 'jotai'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { LuGrip as IcApps } from 'react-icons/lu'
import { useLocation } from 'react-router-dom'

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
import {
	AppDockContextToggle,
	AppDockDivider,
	AppDockIsland,
	AppDockLink,
	AppDockOther,
	AppDockSplit
} from '../ui/AppDock.js'
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

export function Menu({
	inert,
	vertical,
	sidebarToggle
}: {
	inert?: boolean
	/** Icon-over-label item layout (the left rail and the mobile bottom bar). */
	vertical?: boolean
	/** The mobile bottom bar: the community-sheet toggle first, Other as a sheet. */
	sidebarToggle?: boolean
}) {
	const { t, i18n } = useTranslation()
	const location = useLocation()
	const ctx = useCtx()
	const [appConfig, _setAppConfig] = useAppConfig()
	const [auth, _setAuth] = useAuth()
	const [moreMenuOpen, setMoreMenuOpen] = React.useState(false)
	const sidebar = useSidebar()
	const [guestDocument] = useGuestDocument()
	const [, setQrScannerOpen] = useQrScanner()
	const lastApp = useAtomValue(lastAppAtom)
	const setLastApp = useSetAtom(lastAppAtom)
	// Real idTag (own idTag for the personal context) — matches the key the feed
	// unread probe writes; a `~`-shaped URL context would miss.
	const menuContextIdTag = useCurrentContextIdTag()
	const unreadCounts = useAtomValue(unreadCountAtom)
	const activeContext = useAtomValue(activeContextAtom)
	const contextDisplay = useAtomValue(activeContextDisplayAtom)

	React.useEffect(
		function onLocationChange() {
			setMoreMenuOpen(false)
		},
		[location]
	)

	function menuLink(
		menuItem: MenuLinkItem,
		opts: { className?: string; vertical?: boolean; onClick?: () => void } = {}
	) {
		const icon = (APP_IDS as readonly string[]).includes(menuItem.id) ? (
			<AppIcon app={menuItem.id as AppId} />
		) : (
			menuItem.icon && React.createElement(menuItem.icon)
		)
		return (
			<AppDockLink
				key={menuItem.id}
				href={scopePath(ctx.base, menuItem.path)}
				icon={icon}
				label={menuItem.trans?.[i18n.language] || menuItem.label}
				// A dot for the feed's active context. See read-position.ts.
				badge={
					menuItem.id === 'feed' &&
					!!unreadCounts[menuContextIdTag ?? ''] && (
						<Badge dot color="accent" role="status" aria-label={t('New content')} />
					)
				}
				vertical={opts.vertical ?? vertical}
				className={opts.className}
				onClick={opts.onClick}
			/>
		)
	}

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

	// One grid for both layouts: the dock's modal sheet, or the rail's flyout.
	const moreNav = (
		<AppDockOther inert={inert} aria-label={t('More menu items')}>
			{moreItems.map((menuItem) =>
				menuLink(menuItem, {
					className: 'h-small',
					vertical: true,
					onClick: () => {
						setLastApp(menuItem.id)
						setMoreMenuOpen(false)
					}
				})
			)}
			{auth && (
				<AppDockLink
					icon={<AppIcon app="qrscan" />}
					label={t('Scan QR')}
					vertical
					className="h-small"
					onClick={() => {
						setQrScannerOpen(true)
						setMoreMenuOpen(false)
					}}
				/>
			)}
		</AppDockOther>
	)

	const moreLabel = t('More menu items')
	const appLinks = (
		<>
			{inlineItems.map((menuItem) => menuLink(menuItem))}
			{recentItem && <AppDockDivider />}
			{needsMoreMenu && (
				<AppDockSplit aria-label={t('Other apps')} single={!recentItem}>
					{recentItem && menuLink(recentItem)}
					{sidebarToggle ? (
						<AppDockLink
							icon={<IcApps />}
							label={t('Other')}
							vertical={vertical}
							className="c-nav-split-more"
							onClick={() => setMoreMenuOpen(!moreMenuOpen)}
							aria-label={moreLabel}
							aria-haspopup="dialog"
							aria-expanded={moreMenuOpen}
						/>
					) : (
						<Popover
							trigger={
								<AppDockLink
									icon={<IcApps />}
									label={t('Other')}
									vertical={vertical}
									className="c-nav-split-more"
									aria-label={moreLabel}
								/>
							}
							open={moreMenuOpen}
							onOpenChange={setMoreMenuOpen}
							placement="right-start"
							className="c-menu-ex-flyout"
						>
							{moreNav}
						</Popover>
					)}
				</AppDockSplit>
			)}
		</>
	)

	if (location.pathname.match('^/register/')) return null

	return (
		<>
			{sidebarToggle && auth?.idTag && (
				<AppDockContextToggle
					open={sidebar.isOpen}
					onToggle={() => sidebar.toggle()}
					idTag={contextDisplay?.idTag ?? auth.idTag}
					profilePic={contextDisplay?.profilePic ?? auth.profilePic}
					name={contextDisplay?.name ?? auth.name ?? auth.idTag}
					aria-label={t('Switch community')}
				/>
			)}
			{sidebarToggle && needsMoreMenu && (
				<BottomSheet
					showBackdrop
					snapPoint={moreMenuOpen ? 'half' : 'closed'}
					onSnapChange={(snap) => {
						if (snap === 'closed') setMoreMenuOpen(false)
					}}
					aria-label={moreLabel}
				>
					{moreNav}
				</BottomSheet>
			)}
			{sidebarToggle ? <AppDockIsland apps>{appLinks}</AppDockIsland> : appLinks}
		</>
	)
}

// vim: ts=4
