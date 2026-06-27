// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import {
	ActionSheet,
	ActionSheetDivider,
	ActionSheetItem,
	Menu,
	MenuDivider,
	MenuItem,
	useApi,
	useAuth,
	useIsMobile,
	useToast
} from '@cloudillo/react'
import type { ProfileStatus } from '@cloudillo/types'
import type { TFunction } from 'i18next'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import {
	LuCircleOff as IcBlock,
	LuCheck as IcCheck,
	LuAtSign as IcCopyTag,
	LuHouse as IcHome,
	LuBellOff as IcMute,
	LuPin as IcPin,
	LuPinOff as IcPinOff,
	LuRotateCcw as IcRestore,
	LuExternalLink as IcVisitProfile
} from 'react-icons/lu'
import { useNavigate } from 'react-router-dom'

import { HOME_CONTEXT } from './constants'
import { useCommunitiesList } from './hooks'
import { useUrlContextIdTag } from './use-context-from-route'

export interface ProfileMenuTarget {
	idTag: string
	name: string
	type: 'person' | 'community' | 'me'
	status?: ProfileStatus
}

interface MenuState {
	target: ProfileMenuTarget
	position: { x: number; y: number }
}

const LONG_PRESS_MS = 500

export interface ProfileContextMenuProps {
	target: ProfileMenuTarget
	position: { x: number; y: number }
	onClose: () => void
	onRestored?: (idTag: string) => void
}

type StatusChange = 'A' | 'B' | 'M'

function restoreLabel(t: TFunction, s: ProfileStatus): string {
	switch (s) {
		case 'B':
			return t('Unblock')
		case 'S':
			return t('Unsuspend')
		case 'M':
			return t('Unmute')
		default:
			return t('Restore to Active')
	}
}

export function ProfileContextMenu({
	target,
	position,
	onClose,
	onRestored
}: ProfileContextMenuProps) {
	const { t } = useTranslation()
	const navigate = useNavigate()
	const { api } = useApi()
	const [auth] = useAuth()
	const toast = useToast()
	const urlContextIdTag = useUrlContextIdTag()
	const { communities, favorites, toggleFavorite, setShowInHome } = useCommunitiesList()

	const isMobile = useIsMobile()
	const Item = isMobile ? ActionSheetItem : MenuItem
	const Divider = isMobile ? ActionSheetDivider : MenuDivider

	const ctxSegment = urlContextIdTag ?? HOME_CONTEXT
	const profileIdSegment = target.type === 'me' ? 'me' : target.idTag
	const profilePath = `/profile/${ctxSegment}/${profileIdSegment}`

	const isOwnProfile = target.type === 'me' || target.idTag === auth?.idTag
	const isCommunity = target.type === 'community'
	const isMember = isCommunity && communities.some((c) => c.idTag === target.idTag)
	const isPinned = isCommunity && favorites.some((c) => c.idTag === target.idTag)
	const showPinEntry = isCommunity && !isOwnProfile && (isPinned || isMember)
	// Composition: members can opt a community in/out of the merged home feed.
	const memberCommunity = isMember ? communities.find((c) => c.idTag === target.idTag) : undefined
	const showHomeEntry = isCommunity && !isOwnProfile && isMember
	const shownInHome = memberCommunity?.showInHome !== false

	const handleAction = (action: () => void) => () => {
		action()
		onClose()
	}

	const handleVisit = () => {
		navigate(profilePath)
	}

	const handleCopyTag = async () => {
		try {
			await navigator.clipboard.writeText(`@${target.idTag}`)
			toast.success(t('Identity tag copied'))
		} catch {
			// Clipboard API not available
		}
	}

	const handleTogglePin = () => {
		toggleFavorite(target.idTag)
	}

	const applyStatus = async (next: StatusChange, successMsg: string, failureMsg: string) => {
		if (!api) return
		try {
			await api.profiles.updateConnection(target.idTag, { status: next })
			toast.success(successMsg)
			onRestored?.(target.idTag)
		} catch (err) {
			console.error('Failed to update profile status', err)
			toast.error(failureMsg)
		}
	}

	const handleRestore = () =>
		applyStatus('A', t('Profile restored'), t('Failed to restore profile'))
	const handleBlock = () => applyStatus('B', t('Profile blocked'), t('Failed to block profile'))
	const handleMute = () => applyStatus('M', t('Profile muted'), t('Failed to mute profile'))

	const currentStatus = target.status ?? 'A'
	const showRestore = currentStatus !== 'A'
	const showBlock = !isOwnProfile && currentStatus !== 'B'
	const showMute = !isOwnProfile && currentStatus !== 'M' && currentStatus !== 'B'

	const menuContent = (
		<>
			<Item
				icon={<IcVisitProfile />}
				label={t('Visit profile')}
				onClick={handleAction(handleVisit)}
			/>
			<Item
				icon={<IcCopyTag />}
				label={t('Copy identity tag')}
				onClick={handleAction(handleCopyTag)}
			/>
			{showPinEntry && (
				<>
					<Divider />
					{isPinned ? (
						<Item
							icon={<IcPinOff />}
							label={t('Unpin from sidebar')}
							onClick={handleAction(handleTogglePin)}
						/>
					) : (
						<Item
							icon={<IcPin />}
							label={t('Pin to sidebar')}
							onClick={handleAction(handleTogglePin)}
						/>
					)}
				</>
			)}
			{showHomeEntry && (
				<>
					<Divider />
					<Item
						icon={shownInHome ? <IcCheck /> : <IcHome />}
						label={t('Show in Home feed')}
						onClick={handleAction(() => setShowInHome(target.idTag, !shownInHome))}
					/>
				</>
			)}
			{(showRestore || showMute || showBlock) && <Divider />}
			{showRestore && target.status && (
				<Item
					icon={<IcRestore />}
					label={restoreLabel(t, target.status)}
					onClick={handleAction(handleRestore)}
				/>
			)}
			{showMute && (
				<Item icon={<IcMute />} label={t('Mute')} onClick={handleAction(handleMute)} />
			)}
			{showBlock && (
				<Item icon={<IcBlock />} label={t('Block')} onClick={handleAction(handleBlock)} />
			)}
		</>
	)

	if (isMobile) {
		return (
			<ActionSheet isOpen={true} onClose={onClose} title={target.name}>
				{menuContent}
			</ActionSheet>
		)
	}

	return (
		<Menu position={position} onClose={onClose}>
			{menuContent}
		</Menu>
	)
}

export function useProfileContextMenu() {
	const [menuState, setMenuState] = React.useState<MenuState | null>(null)
	const longPressTimerRef = React.useRef<number | undefined>(undefined)
	const longPressFiredRef = React.useRef(false)

	const clearLongPress = React.useCallback(() => {
		if (longPressTimerRef.current !== undefined) {
			window.clearTimeout(longPressTimerRef.current)
			longPressTimerRef.current = undefined
		}
	}, [])

	React.useEffect(() => clearLongPress, [clearLongPress])

	const openMenu = React.useCallback(
		(e: React.MouseEvent | React.TouchEvent, target: ProfileMenuTarget) => {
			let x = 0
			let y = 0
			if ('touches' in e) {
				const touch = e.touches[0] ?? e.changedTouches[0]
				if (touch) {
					x = touch.clientX
					y = touch.clientY
				}
			} else {
				x = e.clientX
				y = e.clientY
			}
			setMenuState({ target, position: { x, y } })
		},
		[]
	)

	const closeMenu = React.useCallback(() => {
		longPressFiredRef.current = false
		setMenuState(null)
	}, [])

	const getTriggerProps = React.useCallback(
		(target: ProfileMenuTarget) => ({
			onContextMenu: (e: React.MouseEvent) => {
				e.preventDefault()
				e.stopPropagation()
				openMenu(e, target)
			},
			onTouchStart: (e: React.TouchEvent) => {
				longPressFiredRef.current = false
				clearLongPress()
				const touch = e.touches[0]
				if (!touch) return
				const x = touch.clientX
				const y = touch.clientY
				longPressTimerRef.current = window.setTimeout(() => {
					longPressFiredRef.current = true
					setMenuState({ target, position: { x, y } })
					longPressTimerRef.current = undefined
				}, LONG_PRESS_MS)
			},
			onTouchEnd: () => {
				clearLongPress()
			},
			onTouchMove: () => {
				clearLongPress()
			}
		}),
		[openMenu, clearLongPress]
	)

	// Wraps a row's own click handler so the synthetic click fired right after
	// a long-press (which already opened the context menu) is swallowed instead
	// of also triggering navigation/switch logic.
	const wrapClick = React.useCallback(
		(handler: (e: React.MouseEvent) => void) => (e: React.MouseEvent) => {
			if (longPressFiredRef.current) {
				e.preventDefault()
				e.stopPropagation()
				longPressFiredRef.current = false
				return
			}
			handler(e)
		},
		[]
	)

	return { menuState, closeMenu, getTriggerProps, wrapClick }
}

// vim: ts=4
