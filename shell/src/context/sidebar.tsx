/**
 * Context Switcher Sidebar
 *
 * Discord/Slack-style sidebar for switching between user context and communities.
 * Shows user profile at top, favorite communities, and recent communities.
 */

import './sidebar.css'

import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth, mergeClasses, ProfilePicture } from '@cloudillo/react'

import {
	LuStar as IcStar,
	LuClock as IcRecent,
	LuChevronLeft as IcCollapse,
	LuChevronRight as IcExpand,
	LuLoader as IcLoading,
	LuUsers as IcCreate,
	LuClock3 as IcPending
} from 'react-icons/lu'

import { useCommunitiesList, useContextSwitch, useSidebar, activeContextAtom } from './index'
import { useAtom } from 'jotai'
import type { CommunityRef } from './types'

interface CommunityListItemProps {
	community: CommunityRef
	isActive: boolean
	onSwitch: (idTag: string) => void
	onToggleFavorite: (idTag: string) => void
}

function CommunityListItem({
	community,
	isActive,
	onSwitch,
	onToggleFavorite
}: CommunityListItemProps) {
	const { t } = useTranslation()

	return (
		<div
			className={mergeClasses(
				'c-sidebar-item',
				isActive && 'active',
				community.isPending && 'pending'
			)}
			onClick={() => onSwitch(community.idTag)}
			title={community.isPending ? t('DNS propagation in progress...') : community.name}
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
			<button
				className="c-sidebar-item-favorite"
				onClick={(e) => {
					e.stopPropagation()
					onToggleFavorite(community.idTag)
				}}
				title={community.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
			>
				<IcStar className={community.isFavorite ? 'filled' : ''} />
			</button>
		</div>
	)
}

interface SidebarProps {
	className?: string
}

export function Sidebar({ className }: SidebarProps) {
	const { t } = useTranslation()
	const [auth] = useAuth()
	const [activeContext] = useAtom(activeContextAtom)
	const { favorites, recent, totalUnread, toggleFavorite } = useCommunitiesList()
	const { switchTo, isSwitching } = useContextSwitch()
	const { isOpen, isPinned, open, close, toggle, pin, unpin } = useSidebar()
	const navigate = useNavigate()
	const [isDesktop, setIsDesktop] = React.useState(window.innerWidth >= 1024)
	const initializedRef = React.useRef(false)

	// Auto-pin and open on desktop, close on mobile (only on initial load)
	React.useEffect(() => {
		const handleResize = () => {
			const desktop = window.innerWidth >= 1024
			setIsDesktop(desktop)
			if (desktop) {
				if (!isPinned) pin()
				if (!isOpen) open()
			} else if (!initializedRef.current) {
				// Close sidebar on mobile only on initial load
				if (isOpen) close()
			}
			initializedRef.current = true
		}

		handleResize() // Initial check
		window.addEventListener('resize', handleResize)
		return () => window.removeEventListener('resize', handleResize)
	}, [isPinned, isOpen, pin, open, close])

	// Handle context switch
	const handleSwitch = React.useCallback(
		(idTag: string) => {
			switchTo(idTag, '/feed').catch((err) => {
				console.error('❌ Failed to switch context:', err)
				// TODO: Show toast notification when toast system is available
				// For now, error is logged and isSwitching state is reset in finally block
			})
		},
		[switchTo]
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
			>
				{/* Header with toggle pin button */}
				<div className="c-sidebar-header">
					<h6>{t('Contexts')}</h6>
					<div className="c-sidebar-header-actions">
						{isSwitching && (
							<IcLoading className="c-sidebar-loading-spinner" size={16} />
						)}
						{/* Pin button only visible on mobile */}
						{!isDesktop && (
							<button
								className="c-sidebar-pin"
								onClick={() => (isPinned ? unpin() : pin())}
								title={isPinned ? t('Unpin sidebar') : t('Pin sidebar')}
							>
								{isPinned ? <IcCollapse /> : <IcExpand />}
							</button>
						)}
					</div>
				</div>

				{/* User's own profile */}
				<div className="c-sidebar-section">
					<div
						className={mergeClasses(
							'c-sidebar-item',
							'c-sidebar-item-me',
							activeContext?.idTag === auth.idTag && 'active'
						)}
						onClick={() => handleSwitch(auth.idTag!)}
					>
						<div className="c-sidebar-item-avatar">
							<ProfilePicture
								profile={{ profilePic: auth.profilePic }}
								srcTag={auth.idTag}
							/>
						</div>
						<div className="c-sidebar-item-info">
							<div className="c-sidebar-item-name">{auth.name || t('Me')}</div>
							<div className="c-sidebar-item-subtitle">{auth.idTag}</div>
						</div>
					</div>
				</div>

				{/* Favorite communities */}
				{favorites.length > 0 && (
					<div className="c-sidebar-section">
						<div className="c-sidebar-section-header">
							<IcStar size={14} />
							<span>{t('Favorites')}</span>
						</div>
						{favorites.map((community) => (
							<CommunityListItem
								key={community.idTag}
								community={community}
								isActive={activeContext?.idTag === community.idTag}
								onSwitch={handleSwitch}
								onToggleFavorite={toggleFavorite}
							/>
						))}
					</div>
				)}

				{/* Recent communities */}
				{recent.length > 0 && (
					<div className="c-sidebar-section">
						<div className="c-sidebar-section-header">
							<IcRecent size={14} />
							<span>{t('Recent')}</span>
						</div>
						{recent.map((community) => (
							<CommunityListItem
								key={community.idTag}
								community={community}
								isActive={activeContext?.idTag === community.idTag}
								onSwitch={handleSwitch}
								onToggleFavorite={toggleFavorite}
							/>
						))}
					</div>
				)}

				{/* Community buttons */}
				<div className="c-sidebar-footer">
					<button
						className="c-sidebar-add-button"
						onClick={() =>
							navigate(`/communities/create/${activeContext?.idTag || auth?.idTag}`)
						}
						title={t('Create new community')}
					>
						<IcCreate />
						<span>{t('Create community')}</span>
					</button>
				</div>
			</aside>

			{/* Backdrop for mobile when sidebar is open */}
			<div
				className={mergeClasses('c-sidebar-backdrop', isOpen && !isPinned && 'show')}
				onClick={toggle}
			/>
		</>
	)
}
