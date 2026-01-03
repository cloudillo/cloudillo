// This file is part of the Cloudillo Platform.
// Copyright (C) 2024  Szilárd Hajba
//
// Cloudillo is free software: you can redistribute it and/or modify
// it under the terms of the GNU Lesser General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Lesser General Public License for more details.
//
// You should have received a copy of the GNU Lesser General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

/**
 * ViewPicker component - Navigation bar for views/slides
 */

import * as React from 'react'
import { mergeClasses } from '../utils'

import {
	PiPlusBold as IcAdd,
	PiCaretLeftBold as IcPrev,
	PiCaretRightBold as IcNext,
	PiPlayBold as IcPlay,
	PiStopBold as IcStop,
	PiXBold as IcClose,
	PiCheckBold as IcCheck,
	PiCaretDownBold as IcCaret,
	PiCrownBold as IcOwner,
	PiLinkBold as IcLink
} from 'react-icons/pi'
import { useTranslation } from 'react-i18next'

import type { ViewId, ViewNode } from '../crdt'
import type { PresenterInfo } from '../awareness'

export interface ViewPickerProps {
	views: ViewNode[]
	activeViewId: ViewId | null
	onViewSelect: (id: ViewId) => void
	onAddView: () => void
	onPrevView: () => void
	onNextView: () => void
	onPresent: () => void
	readOnly?: boolean
	/** Callback to reorder a view to a new index in presentation order */
	onReorderView?: (viewId: ViewId, newIndex: number) => void
	/** Whether the local user is currently presenting */
	isPresenting?: boolean
	/** Callback to stop presenting */
	onStopPresenting?: () => void
	/** Active presenters for showing badges */
	activePresenters?: PresenterInfo[]
	/** Whether the device is mobile - shows compact counter instead of tabs */
	isMobile?: boolean
	/** Client ID being followed (for presenter indicator) */
	followingClientId?: number | null
	/** Callback to follow a presenter */
	onFollow?: (clientId: number) => void
	/** Callback to unfollow presenter */
	onUnfollow?: () => void
}

/**
 * PagePickerPopup - Mobile slide picker overlay
 */
interface PagePickerPopupProps {
	views: ViewNode[]
	activeIndex: number
	activePresenters: PresenterInfo[]
	onSelect: (id: ViewId) => void
	onClose: () => void
}

function PagePickerPopup({
	views,
	activeIndex,
	activePresenters,
	onSelect,
	onClose
}: PagePickerPopupProps) {
	const containerRef = React.useRef<HTMLDivElement>(null)

	// Close on outside click
	React.useEffect(() => {
		const handleClickOutside = (e: MouseEvent) => {
			if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
				onClose()
			}
		}
		document.addEventListener('mousedown', handleClickOutside)
		return () => document.removeEventListener('mousedown', handleClickOutside)
	}, [onClose])

	// Get presenter badges for a slide
	const getPresenterBadges = (viewId: ViewId): PresenterInfo[] => {
		return activePresenters.filter((p) => p.viewId === viewId)
	}

	return (
		<>
			<div className="c-page-picker-backdrop" onClick={onClose} />
			<div ref={containerRef} className="c-page-picker-popup">
				<div className="c-page-picker-header">
					<span className="c-page-picker-title">Go to page</span>
					<button className="c-button icon" onClick={onClose}>
						<IcClose />
					</button>
				</div>
				<div className="c-page-picker-list">
					{views.map((view, index) => {
						const presenters = getPresenterBadges(view.id)
						const isActive = index === activeIndex

						return (
							<button
								key={view.id}
								className={mergeClasses('c-page-picker-item', isActive && 'active')}
								onClick={() => onSelect(view.id)}
							>
								<span className="c-page-picker-item__number">{index + 1}</span>
								{presenters.length > 0 && (
									<span className="c-page-picker-item__presenters">
										{presenters.map((p) => (
											<span
												key={p.clientId}
												className="c-page-picker-item__presenter-dot"
												style={{ backgroundColor: p.user.color }}
												title={p.user.name}
											/>
										))}
									</span>
								)}
								{isActive && <IcCheck className="c-page-picker-item__check" />}
							</button>
						)
					})}
				</div>
			</div>
		</>
	)
}

// Drag state types
interface ViewDragData {
	viewId: ViewId
	originalIndex: number
}

interface ViewDropTarget {
	viewId: ViewId
	position: 'before' | 'after'
}

export function ViewPicker({
	views,
	activeViewId,
	onViewSelect,
	onAddView,
	onPrevView,
	onNextView,
	onPresent,
	readOnly,
	onReorderView,
	isPresenting,
	onStopPresenting,
	activePresenters = [],
	isMobile = false,
	followingClientId = null,
	onFollow,
	onUnfollow
}: ViewPickerProps) {
	const { t } = useTranslation()
	const activeIndex = views.findIndex((v) => v.id === activeViewId)

	// Mobile page picker popup state
	const [showPagePicker, setShowPagePicker] = React.useState(false)

	// Presenter dropdown state
	const [showPresenterDropdown, setShowPresenterDropdown] = React.useState(false)
	const presenterRef = React.useRef<HTMLDivElement>(null)

	// Close presenter dropdown on outside click
	React.useEffect(() => {
		if (!showPresenterDropdown) return

		const handleClickOutside = (e: MouseEvent) => {
			if (presenterRef.current && !presenterRef.current.contains(e.target as Node)) {
				setShowPresenterDropdown(false)
			}
		}

		document.addEventListener('mousedown', handleClickOutside)
		return () => document.removeEventListener('mousedown', handleClickOutside)
	}, [showPresenterDropdown])

	// Handle follow/unfollow
	const handleFollowClick = React.useCallback(
		(clientId: number) => {
			if (followingClientId === clientId) {
				onUnfollow?.()
			} else {
				onFollow?.(clientId)
			}
			setShowPresenterDropdown(false)
		},
		[followingClientId, onFollow, onUnfollow]
	)

	// Get presenter badges for each slide
	const getPresenterBadges = (viewId: ViewId): PresenterInfo[] => {
		return activePresenters.filter((p) => p.viewId === viewId)
	}

	// Drag-and-drop state
	const [draggedView, setDraggedView] = React.useState<ViewDragData | null>(null)
	const [dropTarget, setDropTarget] = React.useState<ViewDropTarget | null>(null)

	// Check if drag-drop is enabled
	const isDragEnabled = !readOnly && !!onReorderView

	// Cleanup helper
	const clearDragState = React.useCallback(() => {
		setDraggedView(null)
		setDropTarget(null)
	}, [])

	// Drag start handler
	const handleDragStart = React.useCallback(
		(e: React.DragEvent, viewId: ViewId, index: number) => {
			if (!isDragEnabled) return

			e.dataTransfer.effectAllowed = 'move'
			e.dataTransfer.setData('text/plain', viewId)
			setDraggedView({ viewId, originalIndex: index })
		},
		[isDragEnabled]
	)

	// Drag over handler - calculate drop position
	const handleDragOver = React.useCallback(
		(e: React.DragEvent, targetViewId: ViewId) => {
			e.preventDefault()
			e.stopPropagation()

			// Don't allow dropping on self
			if (!draggedView || draggedView.viewId === targetViewId) {
				setDropTarget(null)
				return
			}

			// Calculate position based on mouse X within the target element
			const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
			const x = e.clientX - rect.left
			const position: 'before' | 'after' = x < rect.width * 0.5 ? 'before' : 'after'

			e.dataTransfer.dropEffect = 'move'
			setDropTarget({ viewId: targetViewId, position })
		},
		[draggedView]
	)

	// Drag leave handler
	const handleDragLeave = React.useCallback((e: React.DragEvent) => {
		// Only clear if leaving the tabs container entirely
		const relatedTarget = e.relatedTarget as Element | null
		if (!relatedTarget || !relatedTarget.closest?.('.c-view-picker-tabs')) {
			setDropTarget(null)
		}
	}, [])

	// Drop handler - execute reorder
	const handleDrop = React.useCallback(
		(e: React.DragEvent, targetViewId: ViewId, targetIndex: number) => {
			e.preventDefault()
			e.stopPropagation()

			if (!draggedView || !dropTarget || !onReorderView) {
				clearDragState()
				return
			}

			// Calculate new index based on drop position
			// Note: reorderView() handles the adjustment for removing the source item
			let newIndex = targetIndex
			if (dropTarget.position === 'after') {
				newIndex = targetIndex + 1
			}

			// Only reorder if position actually changed
			if (newIndex !== draggedView.originalIndex) {
				onReorderView(draggedView.viewId, newIndex)
			}

			clearDragState()
		},
		[draggedView, dropTarget, onReorderView, clearDragState]
	)

	// Drag end handler - cleanup
	const handleDragEnd = React.useCallback(() => {
		clearDragState()
	}, [clearDragState])

	// Handle page picker selection
	const handlePageSelect = React.useCallback(
		(id: ViewId) => {
			onViewSelect(id)
			setShowPagePicker(false)
		},
		[onViewSelect]
	)

	return (
		<div className="c-nav c-hbox p-1 gap-1">
			<button
				onClick={onPrevView}
				className="c-button icon"
				disabled={activeIndex <= 0}
				title="Previous page"
			>
				<IcPrev />
			</button>

			{/* Mobile: compact counter with tap-to-expand */}
			{isMobile ? (
				<button
					className="c-button c-view-picker-counter flex-fill"
					onClick={() => setShowPagePicker(true)}
					title="Tap to select page"
				>
					{views.length > 0 ? `${activeIndex + 1}/${views.length}` : '0/0'}
				</button>
			) : (
				/* Desktop: full tab list with drag-and-drop */
				<div className="c-hbox gap-1 flex-fill c-view-picker-tabs">
					{views.map((view, index) => {
						const presenters = getPresenterBadges(view.id)

						return (
							<button
								key={view.id}
								onClick={() => onViewSelect(view.id)}
								className={mergeClasses(
									'c-button c-view-picker-tab',
									view.id === activeViewId && 'active',
									draggedView?.viewId === view.id && 'dragging',
									dropTarget?.viewId === view.id &&
										dropTarget.position === 'before' &&
										'drop-before',
									dropTarget?.viewId === view.id &&
										dropTarget.position === 'after' &&
										'drop-after',
									presenters.length > 0 && 'has-presenter'
								)}
								draggable={isDragEnabled}
								onDragStart={(e) => handleDragStart(e, view.id, index)}
								onDragOver={(e) => handleDragOver(e, view.id)}
								onDragLeave={handleDragLeave}
								onDrop={(e) => handleDrop(e, view.id, index)}
								onDragEnd={handleDragEnd}
							>
								{index + 1}
								{presenters.length > 0 && (
									<span className="c-view-picker-tab__presenter-badge">
										{presenters.map((p) => (
											<span
												key={p.clientId}
												className="c-view-picker-tab__presenter-dot"
												style={{ backgroundColor: p.user.color }}
												title={p.user.name}
											/>
										))}
									</span>
								)}
							</button>
						)
					})}
				</div>
			)}

			<button
				onClick={onNextView}
				className="c-button icon"
				disabled={activeIndex >= views.length - 1}
				title="Next page"
			>
				<IcNext />
			</button>

			{!readOnly && (
				<button onClick={onAddView} className="c-button icon" title="Add page">
					<IcAdd />
				</button>
			)}

			{isPresenting ? (
				<button
					onClick={onStopPresenting}
					className="c-button icon ms-2 presenting"
					title="Stop presenting"
				>
					<IcStop />
				</button>
			) : (
				<button
					onClick={onPresent}
					className="c-button icon ms-2"
					title="Present (fullscreen)"
					disabled={views.length === 0}
				>
					<IcPlay />
				</button>
			)}

			{/* Presenter indicator - inside toolbar */}
			{activePresenters.length > 0 && (
				<div ref={presenterRef} className="c-presenter-indicator-inline">
					<button
						className={mergeClasses(
							'c-button c-presenter-indicator-btn',
							followingClientId !== null && 'following'
						)}
						onClick={() => setShowPresenterDropdown(!showPresenterDropdown)}
						title={t('prezillo.presentersActive', { count: activePresenters.length })}
					>
						<span className="c-presenter-indicator-btn__dot">
							<span className="c-presenter-indicator-btn__pulse" />
						</span>
						<span className="c-presenter-indicator-btn__label">
							{activePresenters.length} {t('prezillo.live')}
						</span>
						{followingClientId !== null && (
							<IcLink className="c-presenter-indicator-btn__link" />
						)}
						<IcCaret
							className={mergeClasses(
								'c-presenter-indicator-btn__caret',
								showPresenterDropdown && 'open'
							)}
						/>
					</button>

					{showPresenterDropdown && (
						<div className="c-presenter-indicator__dropdown">
							{activePresenters.map((presenter) => {
								const isFollowing = followingClientId === presenter.clientId
								const slideNum = presenter.viewIndex + 1

								return (
									<div
										key={presenter.clientId}
										className={mergeClasses(
											'c-presenter-indicator__item',
											presenter.isOwner && 'owner'
										)}
									>
										<div
											className="c-presenter-indicator__avatar"
											style={{ backgroundColor: presenter.user.color }}
										>
											{presenter.user.name.charAt(0).toUpperCase()}
										</div>
										<div className="c-presenter-indicator__info">
											<div className="c-presenter-indicator__name">
												{presenter.user.name}
												{presenter.isOwner && (
													<IcOwner
														className="c-presenter-indicator__owner-badge"
														title={t('prezillo.owner')}
													/>
												)}
											</div>
											<div className="c-presenter-indicator__slide">
												{t('prezillo.slide')} {slideNum}/{views.length}
											</div>
										</div>
										<button
											className={`c-button compact${isFollowing ? ' accent' : ' primary'}`}
											onClick={() => handleFollowClick(presenter.clientId)}
										>
											{isFollowing
												? t('prezillo.following')
												: t('prezillo.follow')}
										</button>
									</div>
								)
							})}
						</div>
					)}
				</div>
			)}

			{/* Mobile page picker popup */}
			{isMobile && showPagePicker && (
				<PagePickerPopup
					views={views}
					activeIndex={activeIndex}
					activePresenters={activePresenters}
					onSelect={handlePageSelect}
					onClose={() => setShowPagePicker(false)}
				/>
			)}
		</div>
	)
}

// vim: ts=4
