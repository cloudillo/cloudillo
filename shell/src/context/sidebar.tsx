/**
 * Context Switcher Sidebar
 *
 * Discord/Slack-style sidebar for switching between user context and communities.
 * Shows user profile at top, favorite communities, and recent communities.
 */

import './sidebar.css'

import * as React from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth, useToast, mergeClasses, ProfilePicture } from '@cloudillo/react'

import { LuClock3 as IcPending } from 'react-icons/lu'

import { useCommunitiesList, useContextSwitch, useSidebar, activeContextAtom } from './index'
import { useAtom } from 'jotai'
import type { CommunityRef } from './types'

interface CommunityListItemProps {
	community: CommunityRef
	isActive: boolean
	onSwitch: (idTag: string) => void
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
	draggable,
	isDragging,
	isDragOver,
	onDragStart,
	onDragOver,
	onDrop,
	onDragEnd
}: CommunityListItemProps) {
	const { t } = useTranslation()

	return (
		<div
			className={mergeClasses(
				'c-sidebar-item',
				isActive && 'active',
				community.isPending && 'pending',
				isDragging && 'dragging',
				isDragOver && 'drag-over'
			)}
			role="button"
			tabIndex={0}
			aria-label={
				community.isPending
					? t('{{name}} (setting up)', { name: community.name })
					: community.name
			}
			aria-current={isActive ? 'true' : undefined}
			onClick={() => onSwitch(community.idTag)}
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
	const { favorites, reorderFavorites } = useCommunitiesList()
	const { switchTo, isSwitching } = useContextSwitch()
	const { isOpen, isPinned, close } = useSidebar()
	const { error: toastError } = useToast()
	const location = useLocation()
	const [isDesktop, setIsDesktop] = React.useState(window.innerWidth >= 1024)

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

	// Handle context switch - preserve current app path
	const handleSwitch = React.useCallback(
		(idTag: string) => {
			// Extract current app path from URL: /app/{contextIdTag}/{appPath}
			// We want to keep the appPath when switching contexts
			const match = location.pathname.match(/^\/app\/[^/]+\/(.+)$/)
			const currentAppPath = match ? `/${match[1]}` : '/feed'

			switchTo(idTag, currentAppPath).catch((err) => {
				console.error('Failed to switch context:', err)
				toastError(t('Failed to switch context. Please try again.'))
			})
		},
		[switchTo, location.pathname]
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
						onClick={() => handleSwitch(auth.idTag!)}
						onKeyDown={(e) => {
							if (e.key === 'Enter' || e.key === ' ') {
								e.preventDefault()
								handleSwitch(auth.idTag!)
							}
						}}
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
			</aside>

			{/* Backdrop for mobile when sidebar is open */}
			<div
				className={mergeClasses('c-sidebar-backdrop', isOpen && !isDesktop && 'show')}
				onClick={close}
			/>
		</>
	)
}
