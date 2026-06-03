// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Context Switcher Sidebar
 *
 * Discord/Slack-style sidebar for switching between user context and communities.
 * Shows user profile at top, favorite communities, and recent communities.
 */

import './sidebar.css'

import { mergeClasses, ProfilePicture, useAuth, useToast } from '@cloudillo/react'
import { useAtom, useAtomValue } from 'jotai'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { LuClock3 as IcPending, LuPin as IcPin } from 'react-icons/lu'
import { useLocation } from 'react-router-dom'

import { CONTEXT_ROUTE_REGEX, HOME_CONTEXT } from './constants'
import {
	activeContextAtom,
	contextIdpEnabledAtom,
	previewCommunityAtom,
	useCommunitiesList,
	useContextSwitch,
	useSidebar
} from './index'
import { ProfileContextMenu, useProfileContextMenu } from './profile-context-menu'
import type { CommunityRef } from './types'

interface CommunityListItemProps {
	community: CommunityRef
	isActive: boolean
	onSwitch: (idTag: string) => void
	onTogglePin: (idTag: string) => void
	mode: 'pinned' | 'preview'
	wrapClick?: (handler: (e: React.MouseEvent) => void) => (e: React.MouseEvent) => void
	triggerProps?: {
		onContextMenu: (e: React.MouseEvent) => void
		onTouchStart: (e: React.TouchEvent) => void
		onTouchEnd: () => void
		onTouchMove: () => void
	}
	// Drag-and-drop props (optional, only for pinned items)
	draggable?: boolean
	isDragging?: boolean
	isDragOver?: boolean
	onDragStart?: (e: React.DragEvent) => void
	onDragOver?: (e: React.DragEvent) => void
	onDrop?: (e: React.DragEvent) => void
	onDragEnd?: () => void
}

function CommunityListItem({
	community,
	isActive,
	onSwitch,
	onTogglePin,
	mode,
	wrapClick,
	triggerProps,
	draggable,
	isDragging,
	isDragOver,
	onDragStart,
	onDragOver,
	onDrop,
	onDragEnd
}: CommunityListItemProps) {
	const { t } = useTranslation()
	const isPreview = mode === 'preview'

	const baseAriaLabel = community.isPending
		? t('{{name}} (setting up)', { name: community.name })
		: community.name
	const ariaLabel = isPreview
		? t('Currently viewing {{name}} (not pinned)', { name: community.name })
		: baseAriaLabel

	const pinAriaLabel = t('Pin {{name}} to context bar', { name: community.name })

	return (
		<div
			className={mergeClasses(
				'c-sidebar-item',
				isActive && 'active',
				isPreview && 'preview',
				community.isPending && 'pending',
				isDragging && 'dragging',
				isDragOver && 'drag-over'
			)}
			role="button"
			tabIndex={0}
			aria-label={ariaLabel}
			aria-current={isActive ? 'true' : undefined}
			onClick={
				wrapClick
					? wrapClick(() => onSwitch(community.idTag))
					: () => onSwitch(community.idTag)
			}
			onKeyDown={(e) => {
				if (e.key === 'Enter' || e.key === ' ') {
					e.preventDefault()
					onSwitch(community.idTag)
				}
			}}
			title={community.isPending ? t('DNS propagation in progress...') : community.name}
			draggable={draggable}
			onDragStart={onDragStart}
			onDragOver={onDragOver}
			onDrop={onDrop}
			onDragEnd={onDragEnd}
			{...triggerProps}
		>
			<div className="c-sidebar-item-avatar">
				<ProfilePicture
					profile={{ profilePic: community.profilePic }}
					srcTag={community.idTag}
				/>
				{community.isPending && (
					<span className="c-sidebar-pending-indicator" title={t('Setting up...')}>
						<IcPending size={12} />
					</span>
				)}
			</div>
			{isPreview && (
				<button
					type="button"
					className="c-sidebar-item-pin-overlay"
					aria-label={pinAriaLabel}
					title={pinAriaLabel}
					onClick={(e) => {
						e.preventDefault()
						e.stopPropagation()
						onTogglePin(community.idTag)
					}}
					onKeyDown={(e) => {
						// Prevent the parent row's Enter/Space handler from also firing
						if (e.key === 'Enter' || e.key === ' ') {
							e.stopPropagation()
						}
					}}
				>
					<IcPin size={12} />
				</button>
			)}
			<div className="c-sidebar-item-info">
				<div className="c-sidebar-item-name">{community.name}</div>
				{community.isPending && (
					<span className="c-sidebar-item-subtitle text-muted small">
						{t('Setting up...')}
					</span>
				)}
				{!community.isPending && community.unreadCount > 0 && (
					<span className="c-badge br bg bg-error">{community.unreadCount}</span>
				)}
			</div>
		</div>
	)
}

interface SidebarProps {
	className?: string
}

export const Sidebar = React.memo(function Sidebar({ className }: SidebarProps) {
	const { t } = useTranslation()
	const [auth] = useAuth()
	const [activeContext] = useAtom(activeContextAtom)
	const [previewCommunity] = useAtom(previewCommunityAtom)
	const contextIdpEnabled = useAtomValue(contextIdpEnabledAtom)
	const { favorites, reorderFavorites, toggleFavorite } = useCommunitiesList()
	const { switchTo, isSwitching } = useContextSwitch()
	const { isOpen, isPinned, close } = useSidebar()
	const { error: toastError } = useToast()
	const location = useLocation()
	const [isDesktop, setIsDesktop] = React.useState(window.innerWidth >= 1024)
	const { menuState, closeMenu, getTriggerProps, wrapClick } = useProfileContextMenu()

	// Drag-and-drop state for reordering pinned communities
	const [draggedIndex, setDraggedIndex] = React.useState<number | null>(null)
	const [dragOverIndex, setDragOverIndex] = React.useState<number | null>(null)

	// Track desktop/mobile mode for responsive behavior
	React.useEffect(() => {
		const handleResize = () => {
			setIsDesktop(window.innerWidth >= 1024)
		}
		handleResize()
		window.addEventListener('resize', handleResize)
		return () => window.removeEventListener('resize', handleResize)
	}, [])

	// Drag-and-drop handlers for pinned communities
	const handleDragStart = React.useCallback((e: React.DragEvent, index: number) => {
		setDraggedIndex(index)
		e.dataTransfer.effectAllowed = 'move'
	}, [])

	const handleDragOver = React.useCallback((e: React.DragEvent, index: number) => {
		e.preventDefault()
		setDragOverIndex(index)
	}, [])

	const handleDrop = React.useCallback(
		(e: React.DragEvent, targetIndex: number) => {
			e.preventDefault()
			if (draggedIndex !== null && draggedIndex !== targetIndex) {
				reorderFavorites(draggedIndex, targetIndex)
			}
			setDraggedIndex(null)
			setDragOverIndex(null)
		},
		[draggedIndex, reorderFavorites]
	)

	const handleDragEnd = React.useCallback(() => {
		setDraggedIndex(null)
		setDragOverIndex(null)
	}, [])

	// Handle context switch - preserve current top-level route across contexts.
	// Recognizes `/app/...` plus the context-aware sibling routes
	// (`/idp/...`, `/settings/...`, `/users/...`, `/communities/...`,
	// `/profile/...`). Falls back to the default feed when the current URL
	// isn't one of these, or when switching into a context whose IDP is
	// disabled (or unknown — we have no token to ask the foreign server yet).
	const handleSwitch = React.useCallback(
		(idTag: string) => {
			const urlSegment = idTag === auth?.idTag ? HOME_CONTEXT : idTag
			const defaultDestination = `/app/${urlSegment}/feed`

			const contextRouteMatch = location.pathname.match(CONTEXT_ROUTE_REGEX)

			let destination = defaultDestination
			if (contextRouteMatch) {
				const prefix = contextRouteMatch[1]
				const tail = contextRouteMatch[3] ?? ''
				// IDP is per-tenant; fall back to feed when the target context's
				// IDP is disabled (or unknown — missing entry means we haven't
				// loaded the setting yet for that context).
				if (prefix === 'idp' && contextIdpEnabled[idTag] !== true) {
					destination = defaultDestination
				} else {
					destination = `/${prefix}/${urlSegment}${tail}`
				}
			}

			switchTo(idTag, destination).catch((err) => {
				console.error('Failed to switch context:', err)
				toastError(t('Failed to switch context. Please try again.'))
			})
		},
		[switchTo, location.pathname, toastError, t, auth?.idTag, contextIdpEnabled]
	)

	if (!auth) return null

	return (
		<>
			{/* Sidebar */}
			<aside
				className={mergeClasses(
					'c-sidebar',
					'left',
					isOpen && 'open',
					isPinned && 'pinned',
					isSwitching && 'switching',
					className
				)}
				role="navigation"
				aria-label={t('Context switcher')}
			>
				{/* User's own profile */}
				<div className="c-sidebar-section">
					<div
						className={mergeClasses(
							'c-sidebar-item',
							'c-sidebar-item-me',
							activeContext?.idTag === auth.idTag && 'active'
						)}
						role="button"
						tabIndex={0}
						aria-label={t('My profile')}
						aria-current={activeContext?.idTag === auth.idTag ? 'true' : undefined}
						onClick={wrapClick(() => handleSwitch(auth.idTag!))}
						onKeyDown={(e) => {
							if (e.key === 'Enter' || e.key === ' ') {
								e.preventDefault()
								handleSwitch(auth.idTag!)
							}
						}}
						{...getTriggerProps({
							idTag: auth.idTag!,
							name: auth.name ?? auth.idTag!,
							type: 'me'
						})}
					>
						<div className="c-sidebar-item-avatar">
							<ProfilePicture
								profile={{ profilePic: auth.profilePic }}
								srcTag={auth.idTag}
							/>
						</div>
					</div>
				</div>

				{/* Pinned communities */}
				{favorites.length > 0 && (
					<div className="c-sidebar-section">
						{favorites.map((community, index) => (
							<CommunityListItem
								key={community.idTag}
								community={community}
								isActive={activeContext?.idTag === community.idTag}
								onSwitch={handleSwitch}
								onTogglePin={toggleFavorite}
								mode="pinned"
								wrapClick={wrapClick}
								triggerProps={getTriggerProps({
									idTag: community.idTag,
									name: community.name,
									type: 'community'
								})}
								draggable
								isDragging={draggedIndex === index}
								isDragOver={dragOverIndex === index}
								onDragStart={(e) => handleDragStart(e, index)}
								onDragOver={(e) => handleDragOver(e, index)}
								onDrop={(e) => handleDrop(e, index)}
								onDragEnd={handleDragEnd}
							/>
						))}
						{/* Drop zone after last item */}
						<div
							className={mergeClasses(
								'c-sidebar-drop-zone',
								dragOverIndex === favorites.length && 'drag-over'
							)}
							onDragOver={(e) => handleDragOver(e, favorites.length)}
							onDrop={(e) => handleDrop(e, favorites.length)}
						/>
					</div>
				)}

				{/* Preview slot for active unpinned community */}
				{previewCommunity && (
					<div className="c-sidebar-section c-sidebar-section-preview">
						<CommunityListItem
							key={previewCommunity.idTag}
							community={previewCommunity}
							isActive
							onSwitch={handleSwitch}
							onTogglePin={toggleFavorite}
							mode="preview"
							wrapClick={wrapClick}
							triggerProps={getTriggerProps({
								idTag: previewCommunity.idTag,
								name: previewCommunity.name,
								type: 'community'
							})}
						/>
					</div>
				)}
			</aside>

			{/* Backdrop for mobile when sidebar is open */}
			<div
				className={mergeClasses('c-sidebar-backdrop', isOpen && !isDesktop && 'show')}
				onClick={close}
			/>

			{menuState && (
				<ProfileContextMenu
					target={menuState.target}
					position={menuState.position}
					onClose={closeMenu}
				/>
			)}
		</>
	)
})
